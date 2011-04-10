var sys = require('sys');
var ndns = require('../lib/ndns');
var redis = require('../lib/redis');

var server = ndns.createServer('udp4');

var debug;
var debugLevel = parseInt(process.env.NODE_DEBUG, 16);
if(debugLevel & 0x4) {
    debug = function (x) { sys.error('redis: ' + x); };
} else {
    debug = function () { };
}

var outgoing = [];

var type = null, mbulklen = null, bulklen = null;
var mbulk = [], data = "";

var db = redis.createClient(6379, "127.0.0.1");
db.onCommandType = function (commandType) {
    debug('db.onCommandType');
    type = commandType;
};
db.onMBulkLength = function (len) {
    debug('db.onMBulkLength');
    mbulklen = len;
};
db.onBulkLength = function (len) {
    debug('db.onBulkLength');
    bulklen = len;
};
db.onData = function (b, start, end) {
    debug('db.onData');
    data += b.toString("ascii", start, end);
};
db.onDataEnd = function () {
    debug('db.onDataEnd');
    debug('data: ' + data);
    if (mbulklen) {
	mbulk.push(data);
	if (mbulk.length == 5) {
	    var res = outgoing[0];
	    res.addRR(mbulk[0], mbulk[1], mbulk[2], mbulk[3], mbulk[4]);
	    res.header.ancount++;
	    while (mbulk.length) mbulk.pop();
	}
    }
    data = "";
    bulklen = null;
};
db.onMBulkEnd = function () {
    debug('db.onMBulkEnd');
    var res = outgoing.shift();
    if (res.header.ancount == 0) {
	res.header.rcode = ndns.ns_rcode.nxdomain;
    }
    res.send();
    mbulklen = null;
};

server.on("request", function(req, res) {
    var key = "";

    for (var i = 0; i < req.q.length; i++) {
	res.q.add(req.q[i]);
	key += req.q[i].name + "," + req.q[i].type.toString() + "," + req.q[i].class.toString();
    }

    res.setHeader(req.header);
    res.header.qr = 1;
    res.header.aa = 1;
    res.header.rd = 0;
    res.header.ra = 0;

    if (key.length) {
	outgoing.push(res);
	db.query("lrange", key, 0, -1);
    } else {
	// nxdomain
	res.header.rcode = ndns.ns_rcode.nxdomain;
	res.send();
    }
});
server.bind(5353);
