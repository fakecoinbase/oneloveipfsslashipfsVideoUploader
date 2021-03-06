# Resumable Uploads API

`ipfsVideoUploader` uses [tus](https://tus.io) protocol for resumable video uploads, which handles chunked file uploads over HTTPS. The results of the file upload is stored in an upload register, which may be retrieved over `/uploadStat` Socket IO endpoint.

## Server installation

`tusd` server daemon may be installed by using a script (depending on OS) in the `scripts` folder.

#### macOS:
```
sudo ./scripts/tusd_macos_install.sh
```

#### Ubuntu:
```
sudo ./scripts/tusd_ubuntu_install.sh
```

#### To start `tusd`:
```
tusd -upload-dir /dir/to/upload/destination -hooks-http http://localhost:3000/uploadVideoResumable -hooks-enabled-events pre-create,post-finish
```
Replace `/dir/to/upload/destination` with the full path to folder for upload storage, and adjust `http://localhost:3000` accordingly depending on your `config.json` file.

## Usage

Depending on your client platform, you may find different implementations for tus resumable upload protocol [here](https://tus.io/implementations.html), and Socket IO [here](https://socket.io/docs).

OneLoveIPFS's production `tusd` upload endpoint may be reachable at `https://tusd.oneloved.tube/files`.

#### Upload JSON metadata:
* `access_token` *(required)*: Access token obtained in `/logincb` POST API or SteemConnect access token
* `keychain` *(optional)*: Set this to "true" (in string) if access token is obtained from `/logincb` POST API.
* `type` *(required)*: Upload type. Valid values: `videos`, `video240`, `video480`, `video720` and `video1080`.

#### Obtaining upload results

As `tusd` calls `onSuccess()` on the client right after when an upload is complete and before the `post-upload` webhook is called to process the upload, it is neccessary by design, to register the upload ID with the Socket IO endpoint in order to receive your upload results.

Upload ID registration may be done by emitting `registerid` to the `/uploadStat` endpoint with the following data (all values are in strings):

* `id` *(required)*: Resulting upload ID of the upload
* `type` *(required)*: Upload type, should be the same as the upload type specified in the upload JSON metadata. Valid values: `videos`, `video240`, `video480`, `video720` and `video1080`.
* `access_token` *(required)*: Access token obtained in `/logincb` POST API or SteemConnect access token. Should be the same as the access token specified in the upload JSON metadata. Must be generated by an admin account (or defined encoder accounts) if uploaded from encoding servers.
* `keychain` *(optional)*: Set this to "true" (in string) if access token is obtained from `/logincb` POST API. Should be the same as the `keychain` value specified in the upload JSON metadata.
* `encoderUser` *(optional)*: Hive username of video encoders. Encoding servers only.
* `encodingCost` *(optional)*: Cost of encoding in units to report. Encoding servers only.

In the case of uploading from encoding servers, `type` may not be `videos`.

## Schematics

![Resumable Upload Schematics.png](https://video.oneloveipfs.com/ipfs/QmUGZtd9aEEdadRUdXTqhDvrer3hUMptdVsVH8ybEGbQCi)

## Javascript example

HTML:
```
<script src="https://cdn.jsdelivr.net/npm/tus-js-client@latest/dist/tus.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.3.0/socket.io.js"></script>
```

Javascript:
```
// Socket IO connection for upload results
let uplStat = io.connect('/uploadStat')

// Listen for upload results
uplStat.on('result',(r) => {
    console.log(r)
})

// tus resumable file upload
let videoToUpload = document.getElementById('fileInput').files[0]
let videoUpload = new tus.Upload(videoToUpload[0], {
    endpoint: 'https://tusd.oneloved.tube/files',
    retryDelays: [0,3000,5000,10000,20000],
    parallelUploads: 10, // number of upload threads
    metadata: {
        access_token: 'your access token here',
        keychain: 'true',
        type: 'videos'
    },
    onError: (e) => {
        console.log('tus error',e)
    },
    onProgress: (bu,bt) => {
        let progressPercent = Math.round((bu / bt) * 100)
        console.log('Progress: ' + progressPercent + '%')
    },
    onSuccess: () => {
        let url = videoUpload.url.toString().split('/')
        console.log("Upload ID: " + url[url.length - 1]) // ID of upload
        uplStat.emit('registerid',{
            id: url[url.length - 1],
            type: 'videos',
            access_token: 'your access token here',
            keychain: 'true'
        })
    }
})

videoUpload.findPreviousUploads().then((p) => {
    if (p.length > 0)
        videoUpload.resumeFromPreviousUpload(p[0])
    videoUpload.start()
})
```

#### Result example:

For `videos` upload type:
```
{
    username: "techcoderx",
    type: "videos",
    ipfshash: "QmXEVRMFWJtGodYdcQQ5EEVJE7VTsq4rPcoBet4KLonF1r",
    spritehash: "QmTfsUT6aS2QXUoA9CSgTF9Lp4sFruRix29RjxznkQVCv1",
    duration: 666.967,
    filesize: 553986721
}
```

Other than `videos` upload type:
```
{
    username: "techcoderx",
    type: "video720",
    hash: "QmSGEj3j7i1YJtYmuAEKzNaKhifDiB41fdiDHjAeGSpMGe"
}
```