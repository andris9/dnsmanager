var sys = require('sys');
var redis = require('../lib/redis');

var db = redis.createClient(6379, "127.0.0.1");

var data = "";

db.onCommandType = function (commandType) {
};
db.onMBulkLength = function (len) {
};
db.onBulkLength = function (len) {
};
db.onData = function (b, start, end) {
    data += b.toString("ascii", start, end);
};
db.onDataEnd = function () {
    var info = {};
    data.split("\r\n").map(function (line) { return line.split(":"); });
    data.split("\r\n").forEach(function (line) {
	var keyval = line.split(":");
	if (keyval.length == 2) {
	    info[keyval[0]] = keyval[1];
	}
    });
    sys.puts('INFO: ' + sys.inspect(info));
    data = "";
    datalen = null;
    db.end();
};
db.onMBulkEnd = function () {
};

db.query("info");
