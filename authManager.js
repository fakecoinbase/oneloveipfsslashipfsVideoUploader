const Hive = require('@hiveio/hive-js')
const Avalon = require('javalon')
const SteemConnect = require('steemconnect')
const JWT = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const Crypto = require('crypto-js')
const fs = require('fs')
const Keys = require('./.auth.json')
const Config = require('./config.json')
const Shawp = require('./shawp')

Hive.api.setOptions({ url: 'https://hived.techcoderx.com', useAppbaseApi: true })
Hive.config.set('uri', 'https://hived.techcoderx.com')
Hive.config.set('alternative_api_endpoints', [])

// If whitelist file doesn't exist create it
if (Config.whitelistEnabled && !fs.existsSync('whitelist.txt'))
    fs.writeFileSync('./whitelist.txt','')

// Cache whitelist in a variable, and update variable when fs detects a file change
let whitelist = fs.readFileSync('whitelist.txt','utf8').split('\n')
let whitelistWatcher = fs.watch('whitelist.txt',() => {
    fs.readFile('whitelist.txt', 'utf8',(err,readList) => {
        if (err) return console.log('Error while updating whitelist: ' + err)
        whitelist = readList.split('\n')
        console.log(whitelist)
    })
})

let auth = {
    generateEncryptedMemo: (username,cb) => {
        // Generate encrypted text to be decrypted by Keychain or posting key on client
        let encrypted_message = Crypto.AES.encrypt(username + ':oneloveipfs_login',Keys.AESKey).toString()
        Hive.api.getAccounts([username],(err,res) => {
            if (err) return cb(err)
            let encrypted_memo = Hive.memo.encode(Keys.wifMessage,res[0].posting.key_auths[0][0],'#' + encrypted_message)
            cb(null,encrypted_memo)
        })
    },
    generateEncryptedMemoAvalon: async (username,keyid,cb) => {
        if (keyid && keyid.length > 25) return cb({error: 'Invalid custom key identifier'})
        let encrypted_message = Crypto.AES.encrypt(username + ':oneloveipfs_login',Keys.AESKey).toString()
        let avalonGetAccPromise = new Promise((resolve,reject) => {
            Avalon.getAccount(username,(e,acc) => {
                if (e) return reject(e)
                resolve(acc)
            })
        })
        try {
            let avalonAcc = await avalonGetAccPromise
            let pubKey
            if (keyid) {
                // Custom key
                for (let i = 0; i < avalonAcc.keys.length; i++) 
                    if (avalonAcc.keys[i].id == keyid && avalonAcc.keys[i].types.includes(4))
                        pubKey = avalonAcc.keys[i].pub
                if (!pubKey)
                    return cb({error: 'Custom key identifier not found'})
            } else
                pubKey = avalonAcc.pub // Master key
            
            Avalon.encrypt(pubKey,encrypted_message,Keys.wifAvalonMessage,(err,encrypted) => {
                if (err) return cb(err)
                cb(null,encrypted)
            })
        } catch (e) {
            cb(e)
        }
    },
    generateJWT: (user,cb) => {
        // Generate access token to be sent as response
        let timeNow = Date.now()
        JWT.sign({
            user: user,
            app: Config.tokenApp,
            iat: timeNow / 1000,
            exp: (timeNow / 1000) + Config.tokenExpiry
        },Keys.JWTKey,(err,token) => {
            if (err) return cb('Error generating access token: ' + err)
            cb(null,token)
        })
    },
    verifyAuth: (access_token,needscredits,cb) => {
        if (!access_token) return cb('Missing access token')
        JWT.verify(access_token,Keys.JWTKey,(err,result) => {
            if (err != null)
                cb('Login error: ' + err)
            else if (Config.whitelistEnabled === true) {
                if (!whitelist.includes(result.user))
                    return cb('Looks like you do not have access to the uploader!')
                if (Config.Shawp.Enabled && needscredits) {
                    let daysRemaining = Shawp.getDaysRemaining(result.user)
                    if (daysRemaining.days === 0 && daysRemaining.needs)
                        cb('Insufficient hosting credits, needs additional ' + Math.ceil(daysRemaining.needs) + ' GBdays.')
                    else
                        cb(null,result)
                } else cb(null,result)
            }
        })
    },
    scAuth: (access_token,needscredits,cb) => {
        if (!access_token) return cb('Missing access token')
        let scapi = SteemConnect.Initialize({ accessToken: access_token })
        scapi.me((err,result) => {
            if (err) return cb(err)
            if (!whitelist.includes(result.account.name))
                return cb('Looks like you do not have access to the uploader!')
            if (Config.Shawp.Enabled && needscredits) {
                let daysRemaining = Shawp.getDaysRemaining(result.user)
                if (daysRemaining.days === 0 && daysRemaining.needs)
                    cb('Insufficient hosting credits, needs additional ' + Math.ceil(daysRemaining.needs) + ' GBdays.')
                else
                    cb(null,result.account.name)
            } else cb(null,result.account.name)
        })
    },
    authenticate: (access_token,keychain,needscredits,cb) => {
        if (Config.whitelistEnabled && !access_token) return cb('Missing API auth credentials')
        if (keychain === 'true') {
            auth.verifyAuth(access_token,needscredits,(err,result) => {
                if (err) return cb(err)
                else return cb(null,result.user)
            })
        } else {
            auth.scAuth(access_token,needscredits,(err,user) => {
                if (err) return cb(err)
                else return cb(null,user)
            })
        }
    },
    decryptMessage: (message,cb) => {
        let decrypted = Crypto.AES.decrypt(message,Keys.AESKey).toString(Crypto.enc.Utf8).split(':')
        cb(decrypted)
    },
    invalidHiveUsername: (username) => {
        return Hive.utils.validateAccountName(username)
    },
    whitelist: () => {return whitelist},
    whitelistAdd: (username,cb) => {
        if (!whitelist.includes(username)) {
            whitelist.push(username)
            fs.writeFile('whitelist.txt',whitelist.join('\n'),() => {
                cb()
            })
        } else cb()
    },
    webhookAuth: (token,cb) => {
        // For custom webhooks
        bcrypt.compare(token,Keys.customwebhooktoken,(err,result) => {
            if (err) cb(err)
            else cb(null,result)
        })
    },
    stopWatchingOnWhitelist: () => {
        // For unit testing only
        whitelistWatcher.close()
    }
}

module.exports = auth