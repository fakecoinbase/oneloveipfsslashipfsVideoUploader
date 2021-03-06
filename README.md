[![Build Status](https://travis-ci.org/oneloveipfs/ipfsVideoUploader.svg?branch=master)](https://travis-ci.org/oneloveipfs/ipfsVideoUploader)
[![OneLoveDTube channel on Discord](https://img.shields.io/discord/418646135725359104.svg?logo=discord)](https://discord.gg/Sc4utKr)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

# IPFS Video Uploader

This is an alternative IPFS uploader to upload videos onto DTube. Includes a basic web UI.

### Dependencies required

* `npm` command line tools
* `ffmpeg`, `imagemagick` and `bc` for sprite generation
* `go-ipfs` with a running daemon
* `tusd` running daemon, which can be installed and configured [here](https://github.com/oneloveipfs/ipfsVideoUploader/blob/master/docs/ResumableUploads.md#server-installation).

### Additional requirements

* A HiveSigner application (if HiveSigner authentication is used)
* A domain name for HTTPS, plus SSL certificate for that domain installed
* A running `siad` node for Skynet upload support.

# Installation

1. Clone this repository by typing `git clone https://github.com/oneloveipfs/ipfsVideoUploader.git` in a terminal window.

2. Install all required node modules. `cd ipfsVideoUploader && npm install`

3. Copy the example config file. `cp config_example.json config.json`

4. Configure uploader by modifying `config.json` file. If you need help with the configuration, view the documentation [here](https://github.com/oneloveipfs/ipfsVideoUploader/blob/master/docs/ConfigDocs.md)

5. Run `npm run keygen` to generate encryption and auth keys for Hive Keychain support. Then backup the contents of `.auth.json` file in a safe place.

6. If `whitelistEnabled` is set to `true`, add some Hive accounts to the whitelist by modifying [whitelist.txt](https://github.com/oneloveipfs/ipfsVideoUploader/blob/master/whitelist.txt). (one line per Hive user)

7. Run the app by typing `npm start`. Your app will listen to ports you specify in `config.json` file.

All uploaded files (through non-resumable upload APIs) will be saved in the `uploaded` folder within the repo. Image files (for Hive and Steem article body) will be saved in the `imguploads` folder. As for resumable uploads, you may define the directory in `config.json` file as well as the `tusd` daemon startup arguments.

# Supported file formats

IPFS works the best for videos with .mp4, therefore only mp4 files will be supported at this moment. Both .jpg and .png file formats are supported for thumbnail uploads.

# RESTful HTTP API & IPSync

API calls for authentication, file uploads, hashes and usage data are documented [here](https://github.com/oneloveipfs/ipfsVideoUploader/blob/master/docs/APIDocs.md). Resumable video upload API documentation may be found [here](https://github.com/oneloveipfs/ipfsVideoUploader/blob/master/docs/ResumableUploads.md).

# How to contribute?

If you found any ways to improve on the code, or found any bugs, feel free to create a pull request on the GitHub repository. You can also contact me on Discord `techcoderx#7481` if you have any enquiries.