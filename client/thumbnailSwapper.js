// Load Avalon login
// let avalonUser = sessionStorage.getItem('OneLoveAvalonUser')
// let avalonKey = sessionStorage.getItem('OneLoveAvalonKey')

let steemPostToModify
let avalonPostToModify
let hivePostToModify
let selectedAuthor
let selectedPermlink

document.addEventListener('DOMContentLoaded', () => {
    let uploader = document.getElementById('uploadForm')
    let thumbnailSwapper = document.getElementById('thumbnailSwapper')
    let wcinfo = document.getElementById('wcinfo')
    let refiller = document.getElementById('refiller')

    document.getElementById('modeBtn').onclick = () => {
        if (document.getElementById("dropdownbox").style.display === 'block')
            document.getElementById("dropdownbox").style.display = 'none'
        else
            document.getElementById("dropdownbox").style.display = 'block'
    }

    document.getElementById('modeBtn').onmouseover = () => {
        document.getElementById('dropdownArrow').style.border = 'solid rgb(54,57,63)'
        document.getElementById('dropdownArrow').style.borderWidth = '0 3px 3px 0'
    }

    document.getElementById('modeBtn').onmouseleave = () => {
        document.getElementById('dropdownArrow').style.border = 'solid #ffffff'
        document.getElementById('dropdownArrow').style.borderWidth = '0 3px 3px 0'
    }

    document.getElementById('newUploadModeBtn').onclick = () => {
        uploader.style.display = 'block'
        thumbnailSwapper.style.display = 'none'
        wcinfo.style.display = 'none'
        refiller.style.display = 'none'
        document.getElementById("dropdownbox").style.display = 'none'
    }

    document.getElementById('snapSwapModeBtn').onclick = () => {
        uploader.style.display = 'none'
        thumbnailSwapper.style.display = 'block'
        wcinfo.style.display = 'none'
        refiller.style.display = 'none'
        document.getElementById("dropdownbox").style.display = 'none'
    }

    document.getElementById('subDetModeBtn').onclick = () => {
        uploader.style.display = 'none'
        thumbnailSwapper.style.display = 'none'
        wcinfo.style.display = 'block'
        refiller.style.display = 'none'
        document.getElementById("dropdownbox").style.display = 'none'
    }

    document.getElementById('refillCrModeBtn').onclick = () => {
        uploader.style.display = 'none'
        thumbnailSwapper.style.display = 'none'
        wcinfo.style.display = 'none'
        refiller.style.display = 'block'
        document.getElementById("dropdownbox").style.display = 'none'
    }

    document.getElementById('linkSubmitBtn').onclick = () => {
        let linkInput = document.getElementById('thumbnailSwapLink')
        if (!linkInput.value.startsWith('https://d.tube/#!/v/') && !linkInput.value.startsWith('https://d.tube/v/'))
            return alert('Link provided is not a valid d.tube video link.')
        let split = linkInput.value.replace('/#!','').replace('https://d.tube/v/','').split('/')
        if (split.length != 2)
            return alert('Link provided is an invalid d.tube video link format.')
        async.parallel({
            steem: (cb) => {
                steem.api.getContent(split[0],split[1],(err,res) => {
                    if (err) return cb(err)
                    cb(null,res)
                })
            },
            avalon: (cb) => {
                let success = false
                javalon.getContent(split[0],split[1],(err,res) => {
                    if (err && !success) return cb(err)
                    success = true
                    cb(null,res)
                })
            },
            hive: (cb) => {
                hivejs.api.getContent(split[0],split[1],(err,res) => {
                    if (err) return cb(err)
                    cb(null,res)
                })
            }
        },(errors,results) => {
            console.log(results)
            let isSteem = (results.steem && results.steem.author === split[0] && results.steem.permlink === split[1]) ? true : false
            let isHive = (results.hive && results.hive.author === split[0] && results.hive.permlink === split[1]) ? true : false
            if (results.avalon === undefined && (isSteem || isHive)) {
                // Valid Steem/Hive link
                if (results.steem.author !== steemUser && results.hive.author != username)
                    return alert('DTube video selected is not your video!')
                let jsonmeta
                if (isSteem) 
                    jsonmeta = JSON.parse(results.steem.json_metadata)
                else if (isHive)
                    jsonmeta = JSON.parse(results.hive.json_metadata)

                if (!jsonmeta.video)
                    return alert('Link provided is actually not a DTube video!')

                if (jsonmeta.video.info) {
                    // DTube 0.7 / 0.8
                    steemPostToModify = results.steem
                    selectedAuthor = split[0]
                    selectedPermlink = split[1]
                    document.getElementById('thumbnailSwapNoAvalon').style.display = 'none'

                    document.getElementById('currentSnap').innerHTML = '<img class="snapImgPreview" src="https://snap1.d.tube/ipfs/' + jsonmeta.video.info.snaphash + '">'
                    let resultHTMLToAppend2 = '<h4>Title: ' + results.steem.title + '<br><br>'
                    resultHTMLToAppend2 += 'Permlink: ' + split[1] + '<br><br>'
                    resultHTMLToAppend2 += 'Current thumbnail hash: ' + jsonmeta.video.info.snaphash + '</h4>'
                    document.getElementById('videoInfo').innerHTML = HtmlSanitizer.SanitizeHtml(resultHTMLToAppend2)
                    document.getElementById('newSnapField').style.display = 'block'
                    document.getElementById('swapSubmitBtn').style.display = 'block'
                } else if (jsonmeta.video.providerName !== 'IPFS' && jsonmeta.video.files && !jsonmeta.video.files.ipfs) {
                    // DTube 0.9+ non-IPFS uploads
                    return alert('DTube video selected must be an IPFS upload.')
                } else if (jsonmeta.video.ipfs || (jsonmeta.video.files && jsonmeta.video.files.ipfs)) {
                    // DTube 0.9+ IPFS uploads
                    if (isSteem) steemPostToModify = results.steem
                    if (isHive) hivePostToModify = results.hive
                    selectedAuthor = split[0]
                    selectedPermlink = split[1]

                    // Get associated post on Avalon blockchain
                    if (!avalonUser || !avalonKey) { 
                        document.getElementById('thumbnailSwapNoAvalon').style.display = 'block' 
                    } else {
                        for (let i = 0; i < jsonmeta.video.refs.length; i++) {
                            let ref = jsonmeta.video.refs[i].split('/')
                            if (ref[0] === 'dtc') javalon.getContent(ref[1],ref[2],(err,post) => {
                                if (err) return alert('Error while getting associated Avalon post: ' + JSON.stringify(err))
                                if (post.author !== avalonUser) {
                                    alert('Looks like you\'re logged in with an Avalon account that doesn\'nt correspond with the author of the associated Avalon post.')
                                } else {
                                    avalonPostToModify = post
                                }
                            })
                            else if (ref[0] === 'hive' && !isHive) hivejs.api.getContent(ref[1],ref[2],(err,post) => {
                                if (err) return alert('Error while getting associated Hive post: ' + JSON.stringify(err))
                                if (post.author !== username) {
                                    alert('Looks like you\'re logged in with a Hive account that doesn\'nt correspond with the author of the associated Hive post.')
                                } else {
                                    hivePostToModify = post
                                }
                            })
                            else if (ref[0] === 'steem' && !isSteem) steem.api.getContent(ref[1],ref[2],(err,post) => {
                                if (err) return alert('Error while getting associated Steem post: ' + JSON.stringify(err))
                                if (post.author !== steemUser) {
                                    alert('Looks like you\'re logged in with a Steem account that doesn\'nt correspond with the author of the associated Steem post.')
                                } else {
                                    steemPostToModify = post
                                }
                            })
                            break
                        }
                    }

                    let thumubnailHash
                    if (jsonmeta.video.ipfs && jsonmeta.video.ipfs.snaphash)
                        thumubnailHash = jsonmeta.video.ipfs.snaphash
                    else if (jsonmeta.video.files && jsonmeta.video.files.ipfs && jsonmeta.video.files.ipfs.img && (jsonmeta.video.files.ipfs.img[360] || jsonmeta.video.files.ipfs.img[118])) {
                        thumubnailHash = jsonmeta.video.files.ipfs.img[360] || jsonmeta.video.files.ipfs.img[118]
                    }

                    document.getElementById('currentSnap').innerHTML = '<img class="snapImgPreview" src="https://snap1.d.tube/ipfs/' + thumubnailHash + '">'
                    let resultHTMLToAppend2 = '<h4>Title: ' + (results.steem.title || results.hive.title) + '<br><br>'
                    resultHTMLToAppend2 += 'Permlink: ' + split[1] + '<br><br>'
                    resultHTMLToAppend2 += 'Current thumbnail hash: ' + thumubnailHash + '</h4>'
                    document.getElementById('videoInfo').innerHTML = HtmlSanitizer.SanitizeHtml(resultHTMLToAppend2)
                    document.getElementById('newSnapField').style.display = 'block'
                    document.getElementById('swapSubmitBtn').style.display = 'block'
                } else {
                    return alert('Failed to retrieve DTube video info.')
                }
            } else if (results.avalon && results.avalon.json) {
                // Valid Avalon link (DTube 0.9+)
                if (!avalonUser || !avalonKey)
                    return alert('You need to be logged in with your Avalon blockchain account to make thumbnail swaps of DTube videos posted onto Avalon.')
                if (results.avalon.author !== avalonUser)
                    return alert('Looks like this is not your DTube video! Please login again with the correct Avalon account that matches the author of this Avalon post.')
                if (results.avalon.json.providerName !== 'IPFS' && results.avalon.json.files && !results.avalon.json.files.ipfs)
                    return alert('DTube video selected must be an IPFS upload.')

                avalonPostToModify = results.avalon
                selectedAuthor = split[0]
                selectedPermlink = split[1]

                for (let i = 0; i < results.avalon.json.refs.length; i++) {
                    let ref = results.avalon.json.refs[i].split('/')
                    if (ref[0] === 'steem') steem.api.getContent(ref[1],ref[2],(err,post) => {
                        if (err) return alert('Error while getting associated Steem post: ' + JSON.stringify(err))
                        steemPostToModify = post
                        console.log(steemPostToModify)
                    })
                    else if (ref[0] === 'hive') hivejs.api.getContent(ref[1],ref[2],(err,post) => {
                        if (err) return alert('Error while getting associated Hive post: ' + JSON.stringify(err))
                        hivePostToModify = post
                    })
                }

                let thumubnailHash
                if (results.avalon.json.ipfs && results.avalon.json.ipfs.snaphash)
                    thumubnailHash = results.avalon.json.ipfs.snaphash
                else if (results.avalon.json.files && results.avalon.json.files.ipfs && results.avalon.json.files.ipfs.img && (results.avalon.json.files.ipfs.img[360] || results.avalon.json.files.ipfs.img[118])) {
                    thumubnailHash = results.avalon.json.files.ipfs.img[360] || results.avalon.json.files.ipfs.img[118]
                }

                document.getElementById('currentSnap').innerHTML = '<img class="snapImgPreview" src="https://snap1.d.tube/ipfs/' + thumubnailHash + '">'
                let resultHTMLToAppend2 = '<h4>Title: ' + results.avalon.json.title + '<br><br>'
                resultHTMLToAppend2 += 'Permlink: ' + split[1] + '<br><br>'
                resultHTMLToAppend2 += 'Current thumbnail hash: ' + thumubnailHash + '</h4>'
                document.getElementById('videoInfo').innerHTML = HtmlSanitizer.SanitizeHtml(resultHTMLToAppend2)
                document.getElementById('newSnapField').style.display = 'block'
                document.getElementById('swapSubmitBtn').style.display = 'block'
            } else if (errors) {
                // Error handling
                if (errors.steem)
                    return alert('Error retrieving video info from Steem: ' + errors.steem)
                if (errors.hive)
                    return alert('Error retrieving video info from Hive: ' + errors.hive)
                else if (errors.avalon == 'SyntaxError: Unexpected token N in JSON at position 0')
                    return alert('Invalid link provided.')
                else if (errors.avalon)
                    return alert('Error retrieving video info from Avalon: ' + errors.avalon)
                else
                    return alert('Unknown error while retrieving video info.')
            } else {
                return alert('Unknown error while retrieving video info.')
            }
        })
    }

    document.getElementById('swapSubmitBtn').onclick = () => {
        if (!steemPostToModify && !avalonPostToModify && !hivePostToModify)
            return alert('No video selected for thumbnail swap.')

        let newSnap = document.getElementById('newSnap').files
        if (newSnap.length == 0)
            return alert('Please upload a new replacement thumbnail!')

        let snapFormData = new FormData()
        snapFormData.append('image',newSnap[0])

        document.getElementById('linkSubmitBtn').disabled = true
        document.getElementById('thumbnailSwapLink').disabled = true
        document.getElementById('newSnap').disabled = true
        document.getElementById('swapSubmitBtn').disabled = true
        
        let contentType = {
            headers: {
                "content-type": "multipart/form-data"
            }
        }

        let call = '/uploadImage?type=thumbnails&access_token=' + Auth.token
        if (Auth.iskeychain !== 'true')
            call += '&scauth=true'
        axios.post(call,snapFormData,contentType).then(function(response) {
            let newSnapHash = response.data.imghash

            let snapSwapOps = {}
            if (steemPostToModify) snapSwapOps.steem = (cb) => {
                // Edit json_metadata
                let jsonmeta = JSON.parse(steemPostToModify.json_metadata)
                if (jsonmeta.video.info) {
                    // DTube 0.8
                    jsonmeta.video.info.snaphash = newSnapHash
                } else if (jsonmeta.video.ipfs) {
                    // DTube 0.9 - 0.9.3
                    jsonmeta.video.ipfs.snaphash = newSnapHash
                    jsonmeta.video.thumbnailUrl = 'https://snap1.d.tube/ipfs/' + newSnapHash
                } else {
                    // DTube 0.9.4+
                    jsonmeta.video.files.ipfs.img[118] = newSnapHash
                    jsonmeta.video.files.ipfs.img[360] = newSnapHash
                }
                jsonmeta.app = 'onelovedtube/1.0'

                // Edit Steem article body
                let oldSnapLink = steemPostToModify.body.match(/\bhttps?:\/\/\S+/gi)[1].replace('\'></a></center><hr>','')
                let editedBody = steemPostToModify.body.replace(oldSnapLink,'https://ipfs.io/ipfs/' + newSnapHash)
                console.log(editedBody)

                let tx = [
                    [ 'comment', {
                            parent_author: steemPostToModify.parent_author,
                            parent_permlink: steemPostToModify.parent_permlink,
                            author: steemPostToModify.author,
                            permlink: steemPostToModify.permlink,
                            title: steemPostToModify.title,
                            body: editedBody,
                            json_metadata: JSON.stringify(jsonmeta),
                        }
                    ]
                ]

                if (steemUser) {
                    // Broadcast with Steem Keychain
                    steem_keychain.requestBroadcast(steemUser,tx,'Posting',(response) => {
                        if (response.error) {
                            cb(response.error)
                        } else {
                            cb(null,response)
                        }
                    })
                } // Add SteemLogin support?
                reenableSnapSwapFields()
            }

            if (hivePostToModify) snapSwapOps.hive = (cb) => {
                // Edit json_metadata
                let jsonmeta = JSON.parse(hivePostToModify.json_metadata)
                if (jsonmeta.video.info) {
                    // DTube 0.8
                    jsonmeta.video.info.snaphash = newSnapHash
                } else if (jsonmeta.video.ipfs) {
                    // DTube 0.9 - 0.9.3
                    jsonmeta.video.ipfs.snaphash = newSnapHash
                    jsonmeta.video.thumbnailUrl = 'https://snap1.d.tube/ipfs/' + newSnapHash
                } else {
                    // DTube 0.9.4+
                    jsonmeta.video.files.ipfs.img[118] = newSnapHash
                    jsonmeta.video.files.ipfs.img[360] = newSnapHash
                }
                jsonmeta.app = 'onelovedtube/1.0'

                // Edit Steem article body
                let oldSnapLink = steemPostToModify.body.match(/\bhttps?:\/\/\S+/gi)[1].replace('\'></a></center><hr>','')
                let editedBody = steemPostToModify.body.replace(oldSnapLink,'https://ipfs.io/ipfs/' + newSnapHash)
                console.log(editedBody)

                let tx = [
                    [ 'comment', {
                            parent_author: hivePostToModify.parent_author,
                            parent_permlink: hivePostToModify.parent_permlink,
                            author: hivePostToModify.author,
                            permlink: hivePostToModify.permlink,
                            title: hivePostToModify.title,
                            body: editedBody,
                            json_metadata: JSON.stringify(jsonmeta),
                        }
                    ]
                ]

                if (Auth.iskeychain === 'true') {
                    // Broadcast with Hive Keychain
                    hive_keychain.requestBroadcast(username,tx,'Posting',(response) => {
                        if (response.error) {
                            cb(response.error)
                        } else {
                            cb(null,response)
                        }
                    })
                } else {
                    // Broadcast with HiveSigner
                    let hiveapi2 = new hivesigner.Client({ 
                        accessToken: Auth.token,
                        app: config.HiveSignerApp,
                        callbackURL: config.callbackURL,
                        scope: ['comment','comment_options']
                    })
                    hiveapi2.broadcast(tx,(error) => {
                        if (error) {
                            cb('HiveSigner error: ' + error)
                        } else {
                            cb(null,'HiveSigner broadcast success!')
                        }
                    })
                }
                reenableSnapSwapFields()
            }

            if (avalonPostToModify) snapSwapOps.avalon = (cb) => {
                let jsonAvalon = avalonPostToModify.json
                if (jsonAvalon.ipfs) {
                    jsonAvalon.thumbnailUrl = 'https://snap1.d.tube/ipfs/' + newSnapHash
                    jsonAvalon.ipfs.snaphash = newSnapHash
                } else {
                    jsonAvalon.files.ipfs.img[118] = newSnapHash
                    jsonAvalon.files.ipfs.img[360] = newSnapHash
                }
                jsonAvalon.app = 'onelovedtube/1.0'

                let avalonSwapTx = {
                    type: 4,
                    data: {
                        link: avalonPostToModify.link,
                        json: jsonAvalon,
                        vt: 1,
                        tag: avalonPostToModify.votes[0].tag
                    }
                }

                try {
                    let signedSwapTx = javalon.sign(avalonKey,avalonUser,avalonSwapTx)
                    javalon.sendTransaction(signedSwapTx,(err,result) => {
                        if (err) return cb('Avalon error: ' + err)
                        cb(null,result)
                    })
                } catch (e) {
                    cb('Avalon error: ' + e)
                }
            }

            async.parallel(snapSwapOps,(errors,results) => {
                if (errors) {
                    console.log(errors)
                    if (errors.steem && errors.avalon && errors.hive) {
                        alert('Failed to broadcast thumbnail changes onto the blockchains. Check your browser console for error details. The IPFS hash of your new thumbnail is ' + newSnapHash + '.')
                        reenableSnapSwapFields()
                    } else if (errors.steem) {
                        alert('Failed to broadcast thumbnail changes onto Steem blockchain. You will be redirected to the DTube watch page. Error details: ' + JSON.stringify(errors))
                        window.location.assign('https://d.tube/#!/v/' + selectedAuthor + '/' + selectedPermlink)
                    } else if (errors.avalon) {
                        alert('Failed to broadcast thumbnail changes onto Avalon blockchain. You will be redirected to the DTube watch page. Error details: ' + JSON.stringify(errors))
                        window.location.assign('https://d.tube/#!/v/' + selectedAuthor + '/' + selectedPermlink)
                    } else if (errors.hive) {
                        alert('Failed to broadcast thumbnail changes onto Hive blockchain. You will be redirected to the DTube watch page. Error details: ' + JSON.stringify(errors))
                        window.location.assign('https://d.tube/#!/v/' + selectedAuthor + '/' + selectedPermlink)
                    } else {
                        alert('Unknown error occured while broadcasting thumbnail changes. Check your browser console for error details. The IPFS hash of your new thumbnail is ' + newSnapHash + '.')
                        reenableSnapSwapFields()
                    }
                } else {
                    alert('Thumbnail changes broadcasted successfully! You will be redirected to the DTube watch page.')
                    window.location.assign('https://d.tube/#!/v/' + selectedAuthor + '/' + selectedPermlink)
                }
            })
        }).catch(function(err) {
            // if (err.response.data.error)
            //     alert('Upload error: ' + err.response.data.error)
            // else
            console.log(err)
                //alert('Upload error: ' + err)
            reenableSnapSwapFields()
        })
    }
})

// Close the dropdown menu if the user clicks outside of it
window.onclick = (event) => {
    if(!event.target.matches('#modeBtn') && !event.target.matches('#headerMenu') && !event.target.matches('.dropdownArrow'))
        document.getElementById('dropdownbox').style.display = 'none'
}

function reenableSnapSwapFields() {
    const toEnable = ['linkSubmitBtn','thumbnailSwapLink','newSnap','swapSubmitBtn']
    for (let i = 0; i < toEnable.length; i++) document.getElementById(toEnable[i]).disabled = false
}