const Config = require('./config.json')
const db = require('./dbManager')
const hive = require('@hiveio/hive-js')
const steem = require('steem')
const coinbase = require('coinbase-commerce-node')
const fs = require('fs')
const axios = require('axios')
const Scheduler = require('node-schedule')
  
hive.api.setOptions({url: Config.Shawp.HiveAPI, useAppbaseApi: true })
steem.api.setOptions({ url: Config.Shawp.SteemAPI, useAppbaseApi: true })

hive.config.set('uri', Config.Shawp.HiveAPI)
hive.config.set('alternative_api_endpoints', [])

let Customers = JSON.parse(fs.readFileSync('db/shawp/users.json'))
let RefillHistory = JSON.parse(fs.readFileSync('db/shawp/refills.json'))
let ConsumeHistory = JSON.parse(fs.readFileSync('db/shawp/consumes.json'))

let headBlockHive
let headBlockSteem

let coinbaseClient = coinbase.Client
let coinbaseCharge = coinbase.resources.Charge
let coinbaseWebhook = coinbase.Webhook
if (Config.Shawp.Coinbase.enabled)
    coinbaseClient.init(Config.CoinbaseCommerce.APIKey)

let Shawp = {
    init: (network) => {
        // Stream transactions from blockchain
        if (network) console.log('Keeping alive for',network)
        if (!Config.Shawp.Enabled) return
        if (Config.Shawp.HiveReceiver && (!network || network === 'hive')) hive.api.streamTransactions('irreversible',(err,tx) => {
            if (err) return console.log('Hive tx stream error',err)
            let transaction = tx
            if (transaction.transaction_num == 0) headBlockHive = transaction.block_num
            if (transaction && transaction.operations && transaction.operations[0][0] === 'transfer' && transaction.operations[0][1].to === Config.Shawp.HiveReceiver) {
                let tx = transaction.operations[0][1]
                console.log(tx)
                if (tx.amount.endsWith('HIVE')) {
                    let amt = parseFloat(tx.amount.replace(' HIVE',''))
                    Shawp.ExchangeRate(Shawp.coins.Hive,amt,(e,usd) => {
                        if (e) return console.log(e)
                        let receiver = tx.from
                        let memo = tx.memo.toLowerCase()
                        if (memo !== '' && !memo.startsWith('to: @')) return // Memo must be empty or begin with "to: @"
                        if (memo && memo.startsWith('to: @')) {
                            let otheruser = memo.replace('to: @','')
                            if (hive.utils.validateAccountName(otheruser) == null) receiver = otheruser
                        }
                        Shawp.Refill(tx.from,receiver,'all',Shawp.methods.Hive,tx.amount,usd)
                        Shawp.WriteRefillHistory()
                        Shawp.WriteUserDB()
                        console.log('Refilled $' + usd + ' to @' + receiver + ' successfully')
                    })
                } else if (tx.amount.endsWith('HBD')) {
                    let amt = parseFloat(tx.amount.replace(' HBD',''))
                    Shawp.ExchangeRate(Shawp.coins.HiveDollars,amt,(e,usd) => {
                        if (e) return console.log(e)
                        let receiver = tx.from
                        let memo = tx.memo.toLowerCase()
                        if (memo !== '' && !memo.startsWith('to: @')) return // Memo must be empty or begin with "to: @"
                        if (memo && memo.startsWith('to: @')) {
                            let otheruser = memo.replace('to: @','')
                            if (hive.utils.validateAccountName(otheruser) == null) receiver = otheruser
                        }
                        Shawp.Refill(tx.from,receiver,'all',Shawp.methods.Hive,tx.amount,usd)
                        Shawp.WriteRefillHistory()
                        Shawp.WriteUserDB()
                        console.log('Refilled $' + usd + ' to @' + receiver + ' successfully')
                    })
                }
            }
        })
        
        if (Config.Shawp.SteemReceiver && (!network || network === 'steem')) steem.api.streamTransactions('irreversible',(err,tx) => {
            if (err) return console.log('Steem tx stream error',err)
            let transaction = tx
            if (transaction.transaction_num == 0) headBlockSteem = transaction.block_num
            if (transaction.operations[0][0] === 'transfer' && transaction.operations[0][1].to === Config.Shawp.SteemReceiver) {
                let tx = transaction.operations[0][1]
                if (tx.amount.endsWith('STEEM')) {
                    let amt = parseFloat(tx.amount.replace(' STEEM',''))
                    Shawp.ExchangeRate(Shawp.coins.Steem,amt,(e,usd) => {
                        if (e) return console.log(e)
                        let receiver = tx.from
                        let memo = tx.memo.toLowerCase()
                        if (memo !== '' && !memo.startsWith('to: @')) return // Memo must be empty or begin with "to: @"
                        if (memo && memo.startsWith('to: @')) {
                            let otheruser = memo.replace('to: @','')
                            if (steem.utils.validateAccountName(otheruser) == null) receiver = otheruser
                        }
                        Shawp.Refill(tx.from,receiver,'all',Shawp.methods.Steem,tx.amount,usd)
                        Shawp.WriteRefillHistory()
                        Shawp.WriteUserDB()
                        console.log('Refilled $' + usd + ' to @' + receiver + ' successfully')
                    })
                } else if (tx.amount.endsWith('SBD')) {
                    let amt = parseFloat(tx.amount.replace(' SBD',''))
                    Shawp.ExchangeRate(Shawp.coins.SteemDollars,amt,(e,usd) => {
                        if (e) return console.log(e)
                        let receiver = tx.from
                        let memo = tx.memo.toLowerCase()
                        if (memo !== '' && !memo.startsWith('to: @')) return // Memo must be empty or begin with "to: @"
                        if (memo && memo.startsWith('to: @')) {
                            let otheruser = memo.replace('to: @','')
                            if (steem.utils.validateAccountName(otheruser) == null) receiver = otheruser
                        }
                        Shawp.Refill(tx.from,receiver,'all',Shawp.methods.Steem,tx.amount,usd)
                        Shawp.WriteRefillHistory()
                        Shawp.WriteUserDB()
                        console.log('Refilled $' + usd + ' to @' + receiver + ' successfully')
                    })
                }
            }
        })

        if (!network) {
            Scheduler.scheduleJob('0 0 * * *',() => {
                Shawp.Consume()
                Shawp.WriteConsumeHistory()
                Shawp.WriteUserDB()
                console.log('Daily consumption completed successfully')
            })

            Scheduler.scheduleJob('* * * * *',() => {
                hive.api.getDynamicGlobalProperties((e,r) => {
                    if (!e && Math.abs(r.head_block_number - headBlockHive) > 100) 
                        Shawp.init('hive') // keep alive
                })

                steem.api.getDynamicGlobalProperties((e,r) => {
                    if (!e && Math.abs(r.head_block_number - headBlockSteem) > 100) 
                        Shawp.init('steem') // keep alive
                })
            })
        }
    },
    AddUser: (username,network) => {
        let fullusername = username
        if (network && network != 'all') fullusername += '@' + network
        if (Customers[fullusername]) return
        Customers[fullusername] = {
            rate: Config.Shawp.DefaultUSDRate,
            balance: 0,
            joinedSince: new Date().getTime()
        }
        require('./authManager').whitelistAdd(username,network,() => {})
    },
    User: (fullusername) => {
        let username,network
        if (fullusername.split('@').length == 2) {
            username = fullusername.split('@')[0]
            network = fullusername.split('@')[1]
        } else username = fullusername
        if (!Customers[username]) return {}
        let totalusage = db.getTotalUsage(username,network)
        let res = JSON.parse(JSON.stringify(Customers[fullusername]))
        res.usage = totalusage
        let daysRemaining = Shawp.getDaysRemaining(username)
        res.daysremaining = daysRemaining.days
        if (daysRemaining.needs) res.needs = daysRemaining.needs

        // Usage breakdown
        res.usagedetails = db.getUsage(username,network)

        return res
    },
    UserExists: (fullusername) => {
        if (!Customers[fullusername]) return false
        else return true
    },
    ExchangeRate: (coin,amount,cb) => {
        switch (coin) {
            case 0:
                // DTC payments coming soon
                break
            case 1:
                axios.get('https://api.coingecko.com/api/v3/coins/hive?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false').then((response) => {
                    cb(null,response.data.market_data.current_price.usd * amount)
                }).catch((e) => cb(e))
                break
            case 2:
                axios.get('https://api.coingecko.com/api/v3/coins/hive_dollar?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false').then((response) => {
                    cb(null,response.data.market_data.current_price.usd * amount)
                }).catch((e) => cb(e))
                break
            case 3:
                axios.get('https://api.coingecko.com/api/v3/coins/steem?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false').then((response) => {
                    cb(null,response.data.market_data.current_price.usd * amount)
                }).catch((e) => cb(e))
                break
            case 4:
                axios.get('https://api.coingecko.com/api/v3/coins/steem-dollars?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false').then((response) => {
                    cb(null,response.data.market_data.current_price.usd * amount)
                }).catch((e) => cb(e))
                break
            default:
                return cb({ error: 'invalid coin' })
        }
    },
    CoinbaseCharge: (username,network,usdAmt,cb,cbUrl,cancelUrl) => {
        let chargeData = {
            name: Config.CoinbaseCommerce.ProductName,
            description: 'Account refill for @' + username,
            metadata: {
                customer_username: username,
                network: network
            },
            pricing_type: 'fixed_price',
            local_price: {
                amount: usdAmt,
                currency: 'USD'
            },
            redirect_url: cbUrl || Config.CoinbaseCommerce.RedirectURL,
            cancel_url: cancelUrl || Config.CoinbaseCommerce.CancelURL
        }

        coinbaseCharge.create(chargeData,(e,response) => {
            console.log(e,response)
            if (e)
                return cb(e)
            else
                return cb(null,response)
        })
    },
    CoinbaseWebhookVerify: (request,cb) => {
        try {
            coinbaseWebhook.verifySigHeader(request.rawBody,request.headers['x-cc-webhook-signature'],Config.CoinbaseCommerce.WebhookSecret)
            cb(true)
        } catch {
            cb(false)
        }
    },
    Refill: (from,username,network,method,rawAmt,usdAmt) => {
        let fullusername = username
        if (network && network != 'all') fullusername += '@' + network
        if (!Customers[fullusername]) Shawp.AddUser(username,network)

        let newCredits = Math.floor(usdAmt / Customers[fullusername].rate * 100000000) / 100000000
        Customers[fullusername].balance += newCredits

        if (!RefillHistory[fullusername])
            RefillHistory[fullusername] = []
        
        RefillHistory[fullusername].unshift({
            from: from,
            method: method,
            rawAmt: rawAmt,
            usdAmt: usdAmt,
            credits: newCredits
        })
    },
    Consume: () => {
        let datetoday = new Date()
        let daynow = datetoday.getDate()
        let monthnow = datetoday.getMonth()
        let yearnow = datetoday.getFullYear()
        for (user in Customers) {
            let usage = db.getTotalUsage(user)
            let gbdays = Math.round(usage / 1073741824 * 100000000) / 100000000
            Customers[user].balance -= gbdays

            if (!ConsumeHistory[user]) ConsumeHistory[user] = []
            if (gbdays > 0) ConsumeHistory[user].unshift([daynow + '/' + monthnow + '/' + yearnow,gbdays])
        }
    },
    getRefillHistory: (username,network,start,count) => {
        let fullusername = username
        if (network && network != 'all') fullusername += '@' + network
        return RefillHistory[fullusername].slice(start,start+count)
    },
    getConsumeHistory: (username,network,start,count) => {
        let fullusername = username
        if (network && network != 'all') fullusername += '@' + network
        return ConsumeHistory[fullusername].slice(start,start+count)
    },
    getDaysRemaining: (username,network) => {
        let fullusername = username
        if (network && network != 'all') fullusername += '@' + network
        let usage = db.getTotalUsage(username,network)
        if (usage <= 0 || !Customers[fullusername])
            return { days: -1 }
        else if (Customers[fullusername].balance <= 0 && !Config.admins.includes(username))
            return { days: 0, needs: usage/1073741824 - Customers[fullusername].balance }
        let days = Math.floor(Customers[fullusername].balance / usage * 1073741824)
        if (days == 0 && !Config.admins.includes(username))
            return { days: days, needs: usage/1073741824 - Customers[fullusername].balance }
        else if (days == 0 && Config.admins.includes(username))
            return { days: -2 }
        else
            return { days: days }
    },
    setRate: (fullusername,usdRate) => {
        if (!Customers[fullusername]) return
        Customers[fullusername].rate = usdRate
    },
    WriteUserDB: () => {
        fs.writeFile('db/shawp/users.json',JSON.stringify(Customers),(e) => {
            if (e) console.log('Error saving user database: ' + err)
        })
    },
    WriteRefillHistory: () => {
        fs.writeFile('db/shawp/refills.json',JSON.stringify(RefillHistory),(e) => {
            if (e) console.log('Error saving refill database: ' + err)
        })
    },
    WriteConsumeHistory: () => {
        fs.writeFile('db/shawp/consumes.json',JSON.stringify(ConsumeHistory),(e) => {
            if (e) console.log('Error saving refill database: ' + err)
        })
    },
    coins: {
        // Native
        DTC: 0,
        Hive: 1,
        HiveDollars: 2,
        Steem: 3,
        SteemDollars: 4,

        // Coinbase commerce
        // TODO: Add support for running own node. Not your node, not your rules.
        BTC: 5,
        ETH: 6,
        LTC: 7,
        BCH: 8,
        DAI: 9,
        USDC: 10
    },
    methods: {
        DTC: 0,
        Hive: 1,
        Steem: 2,
        Coupon: 3, // through promo/wc orders
        Referral: 4, // not sure
        System: 5,
        Coinbase: 6
    }
}

module.exports = Shawp