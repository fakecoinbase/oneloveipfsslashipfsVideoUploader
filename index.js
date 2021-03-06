const Config = require('./config.json')
const UpdateLogs = require('./db/updatelogs.json')
const FileUploader = require('./ipfsUploadHandler')
const db = require('./dbManager')
const Auth = require('./authManager')
const WC = require('./wcHelper')
const Shawp = require('./shawp')
const WooCommerce = require('woocommerce-api')
const fs = require('fs')
const async = require('async')
const Express = require('express')
const RateLimiter = require('express-rate-limit')
const Parser = require('body-parser')
const CORS = require('cors')
const app = Express()
const http = require('http').Server(app)

FileUploader.IPSync.init(http)
Shawp.init()

// Prohibit access to certain files through HTTP
app.get('/index.js',(req,res) => {return res.status(404).redirect('/404')})
app.get('/dbManager.js',(req,res) => {return res.status(404).redirect('/404')})
app.get('/authManager.js',(req,res) => {return res.status(404).redirect('/404')})
app.get('/ipfsUploadHandler.js',(req,res) => {return res.status(404).redirect('/404')})
app.get('/wcHelper.js',(req,res) => {return res.status(404).redirect('/404')})
app.get('/scripts/generateKeys.js',(req,res) => {return res.status(404).redirect('/404')})
app.get('/whitelist.txt',(req,res) => {return res.status(404).redirect('/404')})
app.get('/config.json',(req,res) => {return res.status(404).redirect('/404')})
app.get('/db/wc.json',(req,res) => {return res.status(404).redirect('/404')})
app.get('/db/shawp/*',(req,res) => {return res.status(404).redirect('/404')})
app.get('/package.json',(req,res) => {return res.status(404).redirect('/404')})
app.get('/package-lock.json',(req,res) => {return res.status(404).redirect('/404')})

// Rate limit
const AuthAPILimiter = RateLimiter({
    max: 5,
    windowMs: 60000, // 5 login attempts every 60 seconds
    message: "You have too many login attempts!",
    skipSuccessfulRequests: true
})

const ImageUploadAPILimiter = RateLimiter({
    max: 10,
    windowMs: 30000 // 10 requests every 30 seconds
})

const APILimiter = RateLimiter({
    max: 5,
    windowMs: 1000 // 5 requests per second
})

app.use(Express.static(__dirname, { dotfiles: 'deny' }));
app.use(CORS())

// body parser
const rawBodySaver = (req, res, buf, encoding) => {
    if (buf && buf.length) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
}

app.use(Parser.text())

// Setup WooCommerce
let WooCommerceAPI = Config.WooCommerceEnabled ? new WooCommerce(Config.WooCommerceConfig) : null

app.get('/', (request,response) => loadWebpage('./client/welcome.html',response)) // Home page
app.get('/upload', (request,response) => loadWebpage('./client/uploader.html',response)) // Upload page
app.get('/404', (request,response) => loadWebpage('./client/404.html',response)) // 404 page

app.get('/checkuser', APILimiter, (request,response) => {
    // Check if user is in whitelist
    if (!Config.whitelistEnabled)
        response.send({
            isInWhitelist: true,
            isAdmin: Config.admins.includes(request.query.user)
        })
    else
        response.send({
            isInWhitelist: Auth.isInWhitelist(request.query.user,request.query.network),
            isAdmin: Config.admins.includes(request.query.user)
        })
})

app.get('/login',AuthAPILimiter,(request,response) => {
    // Steem Keychain Auth
    if ((request.query.user === undefined) || request.query.user === '')
        // Username not specified, throw an error
        return response.status(400).send({error: 'Username not specified!'})

    let queryNetwork = request.query.network
    if (request.query.dtc == 'true') queryNetwork = 'dtc'

    if (Config.whitelistEnabled)
        if (!Auth.isInWhitelist(request.query.user,queryNetwork))
            return response.status(403).send({error: 'Looks like you do not have access to the uploader!'})

    if (request.query.dtc == 'true' || request.query.network == 'dtc') {
        Auth.generateEncryptedMemoAvalon(request.query.user,request.query.dtckeyid,(e,memo) => {
            if (e) return response.send(e)
            response.send({encrypted_memo: memo, error: null})
        })
    } else Auth.generateEncryptedMemo(request.query.user,(err,memo) => {
        if (err) return response.send({error: err})
        response.send({encrypted_memo: memo, error: null})
    })
})

app.post('/logincb',AuthAPILimiter,(request,response) => {
    // Keychain Auth Callback
    Auth.decryptMessage(request.body,(decoded) => {
        if (Config.whitelistEnabled)
            if (!Auth.isInWhitelist(decoded[0],decoded[2]))
                return response.status(403).send({error: 'Looks like you do not have access to the uploader!'})

        Auth.generateJWT(decoded[0],decoded[2],(err,token) => {
            if (err) return response.send({error: err})
            response.send({access_token: token, error: null})
        })
    })
})

app.get('/auth',AuthAPILimiter,(request,response) => {
    let access_token = request.query.access_token
    Auth.verifyAuth(access_token,false,(err,res) => {
        if (err) return response.status(401).send({error: err})
        else return response.send(res)
    })
})

app.post('/uploadVideo',(request,response) => {
    response.status(410).send({error: 'Non-resumable video upload API is depreciated. Please use Tus resumable video uploads. For more info, please refer to ResumableUploads.md in documentation.'})
})

app.post('/uploadImage',ImageUploadAPILimiter,(request,response) => {
    Authenticate(request,response,true,(user,network) => FileUploader.uploadImage(user,network,request,response))
})

app.post('/uploadSubtitle',APILimiter,(request,response) => {
    Authenticate(request,response,true,(user,network) => FileUploader.uploadSubtitles(user,network,request,response))
})

app.post('/uploadVideoResumable',Parser.json({ verify: rawBodySaver }),Parser.urlencoded({ verify: rawBodySaver, extended: true }),Parser.raw({ verify: rawBodySaver, type: '*/*' }),(request,response) => {
    if (!request.body.Upload.IsFinal)
        return response.status(200).send()
    // console.log(request.headers['hook-name'],request.body.Upload)
    switch (request.headers['hook-name']) {
        case "pre-create":
            // Upload type check
            if(!db.getPossibleTypes().includes(request.body.Upload.MetaData.type)) return response.status(400).send({error: 'Invalid upload type'})

            // Authenticate
            Auth.authenticate(request.body.Upload.MetaData.access_token,request.body.Upload.MetaData.keychain,true,(e,user) => {
                if (e) return response.status(401).send({error: e})
                if (request.body.Upload.MetaData.encoderUser && request.body.Upload.MetaData.encodingCost) { 
                    if (Auth.invalidHiveUsername(request.body.Upload.MetaData.encoderUser))
                        return response.status(401).send({error: 'Invalid encoderUser Hive username'})
                    else if (!Config.admins.includes(user) && !Config.encoderAccounts.includes(user))
                        return response.status(401).send({error: 'Uploads from encoding servers must be an admin or encoder account.'})
                    else if (request.body.Upload.MetaData.type == 'videos')
                        return response.status(401).send({error: 'Uploads from encoding servers may not be source video files.'})
                }
                return response.status(200).send()
            })
            break
        case "post-finish":
            request.socket.setTimeout(0)

            // Get user by access token then process upload
            Auth.authenticate(request.body.Upload.MetaData.access_token,request.body.Upload.MetaData.keychain,false,(e,user,network) => {
                let uploadUser = user
                if (request.body.Upload.MetaData.encoderUser && request.body.Upload.MetaData.encodingCost)
                    uploadUser = request.body.Upload.MetaData.encoderUser
                FileUploader.handleTusUpload(request.body,uploadUser,network,() => {
                    FileUploader.writeUploadRegister()
                    response.status(200).send()
                })
            })
            break
        default:
            response.status(200).send()
            break
    }
})

app.get('/usage',APILimiter, (request,response) => {
    // API to get usage info
    if (!Config.UsageLogs) return response.send('Logs are disabled therefore API is not available for usage.');
    if (request.query.user === undefined || request.query.user === '') return response.send('Username is not defined!');
    let usage = db.getUsage(request.query.user,request.query.network)
    response.send(usage)
})

app.get('/stats',APILimiter,(request,response) => {
    let getUseOps = {}
    let possibleTypes = db.getPossibleTypes()

    for(let i = 0; i < possibleTypes.length; i++) {
        getUseOps[possibleTypes[i]] = (cb) => {
            db.getAllUsage(possibleTypes[i],(total) => {
                cb(null,total)
            })
        }
    }

    async.parallel(getUseOps,(err,result) => {
        let allUse = result
        allUse.total = 0
        for(let i = 0; i < possibleTypes.length; i++) {
            allUse.total += result[possibleTypes[i]]
        }
        db.getHashes('videos',(obtainedHashes) => {
            response.send({
                count: obtainedHashes.videos.length,
                usercount: db.allUsersCount(),
                usage: allUse
            })
        })
    })
})

app.get('/hashes',APILimiter, (request,response) => {
    // API to get IPFS hashes of uploaded files
    let typerequested = request.query.hashtype;
    if (typerequested === '' || typerequested === undefined) {
        // What are you looking for???
        return response.send('hashtype not specified in GET. What are you looking for?');
    }

    typerequested.split(',');

    if (request.query.user === undefined || request.query.user === '')
        // Steem user not specified, return all hashes (either all videos, snaps or sprites, or all three)
        db.getHashes(typerequested,(obtainedHashes) => {
            return response.send(obtainedHashes);
        })
    else {
        let network = request.query.network
        if (Auth.isInWhitelist(request.query.user,null))
            network = 'all'
        db.userExistInHashesDB(request.query.user,network,(result) => {
            if (!result) return response.send('User specified doesn\'t exist in our record.')
            else {
                // BOTH valid Steem username and hash type request are specified
                db.getHashesByUser(typerequested,request.query.user,network,(obtainedHashes) => {
                    return response.send(obtainedHashes)
                })
            }
        })
    }
});

app.get('/updatelogs',APILimiter,(request,response) => {
    // Send all update logs to client to be displayed on homepage
    response.send(UpdateLogs);
})

app.get('/config',APILimiter,(req,res) => {
    res.send(Config.ClientConfig)
})

app.get('/activeusers',APILimiter,(req,res) => {
    res.send({count: FileUploader.IPSync.activeCount()})
})

app.get('/shawp_config',APILimiter,(req,res) => {
    res.send(Config.Shawp)
})

app.get('/shawp_refill_history',APILimiter,(req,res) => {
    if (!Config.Shawp.Enabled) return res.status(404).end()
    Authenticate(req,res,false,(user,network) => {
        return res.send(Shawp.getRefillHistory(user,network,req.query.start || 0,req.query.count))
    })
})

app.get('/shawp_refill_history_admin',APILimiter,(req,res) => {
    if (!Config.Shawp.Enabled) return res.status(404).end()
    Authenticate(req,res,false,(user) => {
        if (!Config.admins.includes(user)) return res.status(403).send({error:'Not an admin'})
        return res.send(Shawp.getRefillHistory(req.query.user,req.query.network || 'all',req.query.start || 0,req.query.count))
    })
})

app.get('/shawp_consumption_history',APILimiter,(req,res) => {
    if (!Config.Shawp.Enabled) return res.status(404).end()
    Authenticate(req,res,false,(user,network) => {
        return res.send(Shawp.getConsumeHistory(user,network,req.query.start || 0,req.query.count))
    })
})

app.get('/shawp_consumption_history_admin',APILimiter,(req,res) => {
    if (!Config.Shawp.Enabled) return res.status(404).end()
    Authenticate(req,res,false,(user) => {
        if (!Config.admins.includes(user)) return res.status(403).send({error:'Not an admin'})
        return res.send(Shawp.getConsumeHistory(req.query.user,req.query.network || 'all',req.query.start || 0,req.query.count))
    })
})

app.post('/shawp_refill_coinbase',Parser.json(),(req,res) => {
    if (!Config.Shawp.Enabled || !Config.Shawp.Coinbase.enabled) return res.status(404).send()
    if (!req.body.username || !req.body.usdAmt) return res.status(400).send({error:'Username or amount is missing'})
    Shawp.CoinbaseCharge(req.body.username,req.body.network || 'all',req.body.usdAmt,(e,r) => {
        if (e)
            return res.status(400).send({error:e.message})
        else
            return res.status(200).send(r)
    },req.body.cbUrl,req.body.cancelUrl)
})

app.post('/shawp_refill_coinbase_webhook',Parser.json({ verify: rawBodySaver }),Parser.urlencoded({ verify: rawBodySaver, extended: true }),Parser.raw({ verify: rawBodySaver, type: '*/*' }),(req,res) => {
    if (!Config.Shawp.Enabled || !Config.Shawp.Coinbase.enabled) return res.status(404).send()
    Shawp.CoinbaseWebhookVerify(req,(verified) => {
        if (!verified) return res.status(403).send()
        res.status(200).send()

        if (req.body.event.data.name == Config.CoinbaseCommerce.ProductName && req.body.event.type == 'charge:confirmed') {
            Shawp.Refill('',req.body.event.data.metadata.customer_username,req.body.event.data.metadata.network,Shawp.methods.Coinbase,req.body.event.data.payments[0].value.crypto.amount + ' ' + req.body.event.data.payments[0].value.crypto.currency,parseFloat(req.body.event.data.pricing.local.amount))
            Shawp.WriteUserDB()
            Shawp.WriteRefillHistory()
        }
    })
})

app.post('/botusage',Parser.json(),(req,res) => {
    if (!Config.WooCommerceEnabled || Config.Shawp.Enabled) return res.status(404).end()
    Auth.webhookAuth(req.body.token,(err,valid) => {
        if (err || valid == false) return res.status(403).send('Failed to verify webhook.')
        res.status(200).send()
        if (WC.UserExists(req.body.username)) {
            WC.UpdateBotUsage(req.body.username,req.body.size)
            WC.WriteWCUserData()
        }
    })
})

// WooCommerce API calls
// Depreciate non-Shawp payment system?
app.post('/wc_order_update',Parser.json({ verify: rawBodySaver }),Parser.urlencoded({ verify: rawBodySaver, extended: true }),Parser.raw({ verify: rawBodySaver, type: '*/*' }),(req,res) => {
    if (!Config.WooCommerceEnabled || Config.Shawp.Enabled) return res.status(404).end()
    WC.VerifyWebhook(req.rawBody,req.header('X-WC-Webhook-Signature'),(isValid) => {
        if (!isValid) return res.status(403).send('Invalid webhook')

        // Send a 200 response code if webhook is legitimate
        res.status(200).send('works')

        // Check if user has paid, then process order
        // When WooCommerce detects a payment, order status updates to processing
        if (req.body.status === 'processing') {
            let getUsername = req.body.meta_data.find(user => user.key === '_billing_steem_account_name')
            let getTier = Config.WooCommerceSettings.Tiers.findIndex(tier => tier.wcpid === req.body.line_items[0].product_id)
            if (getUsername !== undefined || getUsername !== '' || getTier !== -1) {
                Auth.whitelistAdd(getUsername.value,() => {})

                // Complete order
                WooCommerceAPI.put('orders/' + req.body.id,{ status: 'completed' },() => {
                    console.log('Order ID ' + req.body.id + ' has been processed successfully!')
                })

                if (!WC.UserExists(getUsername.value)) {
                    WC.AddUser(getUsername.value,req.body.customer_id,getTier,0)

                    // Referrals
                    let getReferral = req.body.meta_data.find(refUser => refUser.key === '_billing_referral_username')
                    if (getReferral !== undefined || getReferral !== '') {
                        WC.AddReferral(getUsername.value,getReferral.value)
                    }

                    WC.WriteWCUserData()
                }
            }
        }
    })
})

app.get('/wc_user_info',APILimiter,(req,res) => {
    if (!Config.WooCommerceEnabled && !Config.Shawp.Enabled) return res.status(404).end()
    Authenticate(req,res,false,(user,network) => {
        let fullusername = user
        if (network && network != 'all') fullusername += '@' + network
        if (Config.Shawp.Enabled) 
            return res.send(Shawp.User(fullusername))
        else WC.User(user,(err,info) => {
            if (err) res.status(400).send(err)
            return res.send(info)
        })
    })
})

app.get('/wc_user_info_admin',APILimiter,(req,res) => {
    if (!Config.WooCommerceEnabled && !Config.Shawp.Enabled) return res.status(404).end()
    Authenticate(req,res,false,(user,network) => {
        if (!Config.admins.includes(user)) return res.status(403).send({error:'Not an admin'})
        if (Config.Shawp.Enabled) 
            return res.send(Shawp.User(req.query.user,req.query.network || 'all'))
        else WC.User(req.query.user,(err,info) => {
            if (err) res.status(400).send(err)
            return res.send(info)
        })
    })
})

function loadWebpage(HTMLFile,response) {
    fs.readFile(HTMLFile,function(error, data) {
        if (error) {
            response.writeHead(404);
            response.write(error);
            response.end();
        } else {
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.write(data);
            response.end();
        }
    });
}

function Authenticate(request,response,needscredits,next) {
    let access_token = request.query.access_token
    if (Config.whitelistEnabled && !access_token) return response.status(400).send({error: 'Missing API auth credentials'})
    if (Config.whitelistEnabled && request.query.scauth === 'true') {
        // Handle SteemConnect access token
        Auth.scAuth(access_token,needscredits,(err,user,network) => {
            if (err) return response.status(401).send({ error: err })
            else next(user,network)
        })
    } else {
        // Handle access token from /logincb
        Auth.verifyAuth(access_token,needscredits,(err,result) => {
            if (err) return response.status(401).send({ error: err })
            else next(result.user,result.network)
        })
    }
}

app.use((req,res) => { return res.status(404).redirect('/404') })

http.listen(Config.HTTP_PORT)