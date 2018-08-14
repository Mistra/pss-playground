const WebSocket = require('ws')

hexToString = hex => {
    hex = hex.toString()
    let str = '';
    for (let i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

stringToHex = str => {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
        hex += '' + str.charCodeAt(i).toString(16);
    }
    return '0x' + hex;
}

waitfor = n => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve('resolved');
        }, n * 1000);
    });
}

const defaultPeer = {
    name: "", // human readable name
    addr: "", // swarm address
    pk: "", // public key
    topic: "", // topic subbed
    conn: null, // succesfully opened websocket
}


let id = 0
let fifo = []
let topic = null
const ws1 = new WebSocket("ws://localhost:8546")
const ws2 = new WebSocket("ws://localhost:8547")

let p1 = Object.create(defaultPeer)
let p2 = Object.create(defaultPeer)

const getConn = ws => new Promise(resolve => ws.onopen = () => resolve(ws))

const onMsg = peer => m => {
    msg = JSON.parse(m.data);

    switch (fifo[msg.id]) {
        case "pss_baseAddr": {
            peer.addr = msg.result
            console.log(peer.name, "updates addr with:", peer.addr)
        } break
        case "pss_getPublicKey": {
            peer.pk = msg.result
            console.log(peer.name, "updates pk with:", peer.pk)
        } break
        case "pss_setTopic": {
            topic = msg.result
            console.log("topic updated:", topic)
        } break
        case "pss_topicSubscribe": {
            peer.topic = msg.result
            console.log(peer.name, "subbed as:", peer.topic)
        } break
        default: {
            if (msg.method == "pss_subscription") {
                console.log(peer.name, "received message:", hexToString(msg.params.result.Msg))
            } else {
                //console.log("reaced default:", msg)
            }
        }
    }
    //console.log(msg)
}

// warning
// possible but very unlikely racing condition
send = (peer, command, params) => {
    fifo[id] = command
    peer.conn.send('{"jsonrpc":"2.0","id":' + id++ + ',"method":"' + command + '","params":' + params + '}')
}

let main = async () => {
    ws1.onmessage = onMsg(p1)
    ws2.onmessage = onMsg(p2)

    p1.name = "peer1"
    p2.name = "peer2"

    p1.conn = await getConn(ws1)
    p2.conn = await getConn(ws2)

    send(p1, "pss_baseAddr", "null")
    send(p1, "pss_getPublicKey", "null")

    send(p2, "pss_baseAddr", "null")
    send(p2, "pss_getPublicKey", "null")

    // set global topic
    fifo[id] = "setTopic"
    p2.conn.send('{"jsonrpc":"2.0","id":' + id++ + ',"method":"' + "pss_stringToTopic" + '","params":["test"]}')

    await waitfor(1)

    p1.conn.send('{"jsonrpc":"2.0","id":' + id++ + ',"method":"' + "pss_setPeerPublicKey" + '","params":["' + p2.pk + '","' + topic + '","' + p2.addr + '"]}')
    //p2.conn.send('{"jsonrpc":"2.0","id":' + id++ + ',"method":"' + "pss_setPeerPublicKey" + '","params":["' + p1.pk + '","' + topic + '","' + p1.addr + '"]}')

    await waitfor(1)

    //fifo[id] = "topicSubscribe"
    //p1.conn.send('{"jsonrpc":"2.0","id":' + id++ + ',"method":"' + "pss_subscribe" + '","params":["receive","' + topic + '"]}')
    fifo[id] = "topicSubscribe"
    p2.conn.send('{"jsonrpc":"2.0","id":' + id++ + ',"method":"' + "pss_subscribe" + '","params":["receive","' + topic + '"]}')

    await waitfor(1)

    let message = "Hello people of the world!"
    p1.conn.send('{"jsonrpc":"2.0","id":' + id++ + ',"method":"' + "pss_sendAsym" + '","params":["' + p2.pk + '","' + topic + '","' + stringToHex(message) + '"]}')
    console.log(p1.name, "sent message:", message)

    await waitfor(4)

    p1.conn.close()
    p2.conn.close()

}

main()
