const tmi = require('tmi.js');
const { Client } = require('@elastic/elasticsearch')
const axios = require('axios').default
const client = new Client({
    node: process.env.ELASTICSEARCH_HOSTS || "http://localhost:9200"
})
const Twitch = new tmi.Client({
    channels: [process.argv[2]]
});
axios.defaults.baseURL = 'https://decapi.me/twitch'

var liveStatus = false
var videoId = 'NULL'
var currentTitle = 'NULL'
var queue = [];

(async () => {
    liveStatus = await checkLiveStatus(process.argv[2])
    videoId = await getLatestVideoId(process.argv[2])
    currentTitle = await getCurrentTitle(process.argv[2])
    console.log(liveStatus, videoId, currentTitle)
})();

Twitch.connect()

setInterval(async () => {
    liveStatus = await checkLiveStatus(process.argv[2])
    videoId = await getLatestVideoId(process.argv[2])
    currentTitle = await getCurrentTitle(process.argv[2])
}, 300 * 1000)

setInterval(async () => {
    if (liveStatus && queue.length > 0) {
        let operations = JSON.parse(JSON.stringify(queue))
        queue.splice(0)
        client.bulk({ refresh: false, body: operations })
            .then((bulkResponse) => {
                if (bulkResponse.error) {
                    const erroredDocuments = []
                    bulkResponse.items.forEach((action, i) => {
                        const operation = Object.keys(action)[0]
                        if (action[operation].error) {
                            erroredDocuments.push({
                                status: action[operation].status,
                                error: action[operation].error,
                                operation: operations[i * 2],
                                document: operations[i * 2 + 1]
                            })
                        }
                    })
                    console.log(`TwitchChat[${process.argv[2]}]`, erroredDocuments)
                }
            }).catch((err) => {
                console.error(`TwitchChat[${process.argv[2]}]`, err)
            })
    }
}, 30 * 1000)

Twitch.on('chat', (channel, userstate, message, self) => {
    queue.push(...generateBody(userstate, channel, new Date(), message))
});

Twitch.on('cheer', (channel, userstate, message) => {
    queue.push(...generateBody(userstate, channel, new Date(), message))
});

function generateBody(sender, chid, timestamp, msg) {
    return [{
        update: {
            _index: `twitch-${chid.toLowerCase().replace('#', '')}-${timestamp.getFullYear()}${("0" + (timestamp.getMonth() + 1)).slice(-2)}`,
            _id: `${sender['user-id']}_${chid.replace('#', '')}_${timestamp.getTime()}`
        }
    },
    {
        doc: {
            channelid: chid.replace('#', ''),
            title: currentTitle,
            videoid: videoId,
            displayname: sender['display-name'],
            username: sender['username'],
            userid: sender['user-id'],
            subscriber: sender['subscriber'],
            bits: 'bits' in sender ? sender['bits'] : 0,
            message: msg,
            timestamp: timestamp
        },
        doc_as_upsert: true
    }]
}

async function checkLiveStatus(channel) {
    let response = await axios.get('/uptime/' + channel).catch()
    if (!response) return false
    if (response.data.indexOf('offline') > 0) {
        return false
    } else {
        return true
    }
}

async function getLatestVideoId(channel) {
    let response = await axios.get('/vod_replay/' + channel).catch()
    if (!response) return 'NULL'
    if (response.data.indexOf('available') > 0) {
        return 'NULL'
    } else {
        return response.data.replace(/\?t=.*/, "")
    }
}

async function getCurrentTitle(channel) {
    let response = await axios.get('/status/' + channel).catch()
    if (!response) return 'NULL'
    if (response.data.length == 0) {
        return 'NULL'
    } else {
        return response.data
    }
}