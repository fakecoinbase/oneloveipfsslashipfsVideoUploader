# Config file guide

#### General settings
* `IPFS_API_PORT`: Specify port that IPFS daemon listens to for IPFS API calls.
* `HTTP_PORT`: Specify port to listen to HTTP requests.
* `whitelistEnabled`: When set to false, whitelist checks will be ignored.
* `UsageLogs`: When set to true, disk usage data by Steem accounts will be logged.
* `tokenExpiry`: Speficy time in ms of access token expiry from time of issuance.
* `admins`: Array of Hive accounts which have access to administrator APIs. May also act as `encoderAccounts` but with admin privileges.
* `encoderAccounts`: Array of Hive accounts that may be used by encoding servers. These accounts do not have admin privileges.

#### Client configuration
* `gateway`: IPFS gateway domain to use as default gateway overwrite on DTube embed player.
* `hivesignerEnabled`: Set to true to enable HiveSigner authentication.
* `HiveSignerApp`: Specify the app name of your HiveSigner application.
* `callbackURL`: Specify the uploader page URL (https://yourdomain.com/upload) where the URL must be listed in HiveSigner application settings.
* `tusdEndpoint`: tusd HTTP endpoint for resumable file uploads.

#### Skynet
* `enabled`: When set to true, Skynet upload support is enabled.
* `portalUrl`: `siad` API endpoint for uploading to Skynet.
* `portalUploadPath`: Skynet upload API call. Do not change unless you know what you're doing.
* `portalFileFieldname`: Skynet upload form data fieldname. Do not change unless you know what you're doing.

#### tusd settings
* `tusdUploadDir`: Directory where `tusd` uploads are saved to.
* `socketTimeout`: Timeout (in ms) where sockets will be cleared from register if upload ID is not being processed.

#### WooCommerce settings
* `WooCommerceEnabled`: When set to true, WooCommerce API will be used to enable additional functionalities (e.g. disk usage quota, bot sync through webhook etc.)
* `WooCommerceConfig`: Configuration for WooCommerce REST API. Full documentation on API configuration can be viewed [here](https://www.npmjs.com/package/woocommerce-api#setup). Note: It is recommended to use `wc/v1` as other versions may not work with subscriptions.
* `WooCommerceSettings`: Configuration for subscription tiers and referrals. Only applicable for tiered subscription model.

###### Subscription tiers
* `wcpid`: Product ID on WooCommerce product website for subscription tier.
* `name`: Subscription plan name, which will be shown in user's account details page.
* `price`: Subscription cost per month.
* `quota`: Total allocated quota for subscription tier.

###### Referrals
* `quotaBonus`: Bonus quota allocated for each customer referred.
* `maxBonus`: Maximum possible bonus allocation for referrals per referrer.

#### Shawp
* `Enabled`: When set to true, pay-per-use pricing model is used instead.
* `DefaultUSDRate`: Hosting cost in USD for 1GB of files in 24 hours.
* `HiveAPI`: Hive RPC endpoint URL. It is recommended to run your own `hived` node to accept payments. Low memory node with `block_api` is sufficient. Not your node, not you rules.
* `SteemAPI`: Steem RPC endpoint URL.
* `HiveReceiver`: Hive account to be used for receiving payments.
* `SteemReceiver`: Steem account to be used for receiving payments.

#### Unit tests settings

These values do not affect the functionality of the app in production.
* `hashType`: Specify hash types in an array to run database unit tests with.
* `user`: Specify Steem username to run unit tests with.