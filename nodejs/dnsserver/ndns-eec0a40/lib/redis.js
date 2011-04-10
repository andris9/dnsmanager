var sys = require('sys');

var debug;
var debugLevel = parseInt(process.env.NODE_DEBUG, 16);
if(debugLevel & 0x4) {
    debug = function (x) { sys.error('nredis: ' + x); };
} else {
    debug = function () { };
}

var net = require('net');
var events = require('events');
var Buffer = require('buffer').Buffer;

var FreeList = require('freelist').FreeList;

var parsers = new FreeList('parsers', 1000, function () {
    var parser = new Parser();

    parser.onCommandType = function () {
	parser.socket.onCommandType.apply(this, arguments);
    };
    parser.onMBulkLength = function () {
	parser.socket.onMBulkLength.apply(this, arguments);
    };
    parser.onBulkLength = function () {
	parser.socket.onBulkLength.apply(this, arguments);
    };
    parser.onData = function () {
	parser.socket.onData.apply(this, arguments);
    };
    parser.onDataEnd = function () {
	parser.socket.onDataEnd.apply(this, arguments);
    };
    parser.onMBulkEnd = function () {
	parser.socket.onMBulkEnd.apply(this, arguments);
    };

    return parser;
});

var sym = 0;
function Symbol (string) {
    this.sym = sym++;
    this.string = string;
}

Symbol.prototype.toString = function () {
    return this.string;
};

function Counter () {
    this.value = 0;
    this.negative = false;
};
exports.Counter = Counter;

Counter.prototype.base = 10;

Counter.prototype.read = function (c) {
    if (c >= 48 && c <= 57) { // >= '0' && <= '9'
	this.value *= this.base;
	this.value += (c - 48);
    } else if (c == 45) { // '-'
	this.negative = true;
    }
};

Counter.prototype.reinitialize = function () {
    Counter.call(this);
};

Counter.prototype.getValue = function () {
    return this.negative ? -1 : this.value;
};

function Parser () {
    this.commandType = null;
    this.parseState = this.parseState_command;
    this.parseError = null;

    this.commandStart = 0;

    this.onCommandType = null;
    this.onBulkLength = null;
    this.onData = null;
    this.onDataEnd = null;

    this._counter = new Counter();
    this.datalen = null;
    this.mbulklen = null;
}
exports.Parser = Parser;

Parser.prototype.commandType_error = new Symbol("error");
Parser.prototype.commandType_singleline = new Symbol("single line");
Parser.prototype.commandType_bulk = new Symbol("bulk");
Parser.prototype.commandType_mbulk = new Symbol("multibulk");
Parser.prototype.commandType_integer = new Symbol("integer");

Parser.prototype.parseState_command = new Symbol("command");
Parser.prototype.parseState_bulk = new Symbol("bulk");
Parser.prototype.parseState_bulkdata = new Symbol("bulkdata");
Parser.prototype.parseState_mbulk = new Symbol("mbulk");
Parser.prototype.parseState_line = new Symbol("line");
Parser.prototype.parseState_r = new Symbol("r");
Parser.prototype.parseState_n = new Symbol("n");

Parser.prototype.reinitialize = function () {
    this.commandType = null;
    this.parseState = this.parseState_command;
    this.parseError = null;

    this.commandStart = 0;

    this._counter.reinitialize();
    this.datalen = null;
    this.mbulklen = null;
};

Parser.prototype.parse = function (b, start, end) {
    if (this.parseError)
	return;
    var i = start, c = 0;
    if (start > end)
	throw new Error ("start should < end");
    if (end > b.length)
	throw new Error ("end extends beyond buffer");
    this.commandStart = i;
    for (i = start; i < end; i++) {
	if (this.datalen) {
	    --this.datalen;
	    continue;
	}
	c = b[i];
	switch(this.parseState) {
	case this.parseState_command:
	    switch (c) {
	    case 45: // -
		this.commandType = this.commandType_error;
		this.parseState = this.parseState_line;
		break;
	    case 43: // +
		this.commandType = this.commandType_singleline;
		this.parseState = this.parseState_line;
		break;
	    case 36: // $
		this.commandType = this.commandType_bulk;
		this.parseState = this.parseState_bulk;
		break;
	    case 42: // *
		this.commandType = this.commandType_mbulk;
		this.parseState = this.parseState_mbulk;
		break;
	    case 58: // :
		this.commandType = this.commandType_integer;
		this.parseState = this.parseState_line;
		break;
	    default:
		this.parseError = true;
		return;
	    }
	    this.onCommandType (this.commandType);
	    this.commandStart = i + 1;
	    break;
	case this.parseState_mbulk:
	case this.parseState_bulk:
	    if (c != 13) {
		this._counter.read(c);
	    } else {
		if (this.mbulklen > 0) {
		    --this.mbulklen;
		}
		this.parseState = this.parseState_n;
	    }
	    break;
	case this.parseState_bulkdata:
	    if (this.datalen == 0) {
		if (i > this.commandStart)
		    this.onData(b, this.commandStart, i);
		this.onDataEnd();
		this.parseState = this.parseState_n;

		if (this.mbulklen == 0) {
		    this.onMBulkEnd();
		    this.mbulklen = null;
		}
	    } else {
		--this.datalen;
	    }
	    break;
	case this.parseState_mbulk:
	    if (c != 13) {
		this._counter.read(c);
	    } else {
		this.parseState = this.parseState_n;
	    }
	    break;
	case this.parseState_line:
	    if (c == 13) { // \r
		if (i > this.commandStart)
		    this.onData (b, this.commandStart, i);
		this.onDataEnd();
		this.parseState = this.parseState_n;
	    }
	    break;
	case this.parseState_r:
	    if (c != 13) { // \r
		this.parseError = true;
		return;
	    }
	    this.parseState = this.parseState_n;
	    break;
	case this.parseState_n:
	    if (c != 10) { // \n
		this.parseError = true;
		return;
	    }
	    switch (this.commandType) {
	    case this.commandType_mbulk:
		this.mbulklen = this._counter.getValue();
		this.onMBulkLength(this.mbulklen);
		this._counter.reinitialize();

		if (this.mbulklen == 0) {
		    this.onMBulkEnd();
		    this.mbulklen = null;
		}

		this.parseState = this.parseState_command;
		break;
	    case this.commandType_bulk:
		if (this.datalen == null) {
		    this.datalen = this._counter.getValue();
		    this.onBulkLength(this.datalen);
		    this._counter.reinitialize();
		    this.commandStart = i + 1;

		    if (this.datalen == -1) {
			this.parseState = this.parseState_command;
			this.datalen = null;
		    } else {
			this.parseState = this.parseState_bulkdata;
		    }
		} else {
		    this.datalen = null;
		    this.parseState = this.parseState_command;
		}
		break;
	    case this.commandType_error:
	    case this.commandType_singleline:
	    case this.commandType_integer:
		this.parseState = this.parseState_command;
	    }
	    break;
	}
    }
    switch (this.parseState) {
    case this.parseState_command:
    case this.parseState_bulk:
	break;
    case this.parseState_bulkdata:
    case this.parseState_line:
	if (i > this.commandStart)
	    this.onData (b, this.commandStart, i);
	break;
    case this.parseState_mbulk:
    case this.parseState_r:
    case this.parseState_n:
	break;
    }
};

Parser.prototype.finish = function () {
    
};

function outgoingFlush (socket) {
    //var message = socket._outgoing[0];
    var message = socket;

    if (!message) return;

    var ret;

    while (message.output.length) {
	var data = message.output.shift();
	var encoding = message.outputEncodings.shift();

	ret = socket.write(data, encoding);
    }

    // if (ret) message.emit('drain');
};

function Client () {
    net.Stream.call(this);
    var self = this;

    var parser;

    function initParser () {
	if (!parser) parser = parsers.alloc();
	parser.reinitialize();
	parser.socket = self;
    };

    self.ondata = function (d, start, end) {
	debug('self.ondata');
	parser.parse(d, start, end);
	if (parser.parseError) {
	    self.destroy(new Error("syntax error"));
	} else {
	    
	}
    };

    this.on("connect", function () {
	debug('client connected');
	initParser();
	outgoingFlush(self);
    });

    self.onend = function () {
	if (parser) parser.finish();
	debug("self got end closing. readyState = " + self.readyState);
	self.end();
    };

    this.on("close", function (e) {
	if (e) return;

	// If there are more requests to handle, reconnect.
	// if (self._outgoing.length) {
	if (self.output.length) {
	    self._reconnect();
	} else if (parser) {
	    parsers.free(parser);
	    parser = null;
	}
    });

    this.output = [];
    this.outputEncodings = [];
    // this._outgoing = [];
};
sys.inherits(Client, net.Stream);
exports.Client = Client;

Client.prototype._reconnect = function () {
    if (this.readyState === "closed") {
	this.connect(this.port, this.host);
    }
};

Client.prototype._buffer = function (data, encoding) {
    // Buffer
    if (data.length === 0) return;

    var length = this.output.length;

    if (length === 0 || typeof (data) != 'string') {
	this.output.push(data);
	encoding = encoding || "ascii";
	this.outputEncodings.push(encoding);
	return false;
    }

    var lastEncoding = this.outputEncodings[length-1];
    var lastData = this.output[length - 1];

    if ((lastEncoding === encoding) ||
	(!encoding && data.constructor === lastData.constructor)) {
	this.output[length-1] = lastData + data;
	return false;
    }

    this.output.push(data);
    encoding = encoding || "ascii";
    this.outputEncodings.push(encoding);

    return false;
};

Client.prototype.buf = function (data, encoding) {
    if (typeof data !== "string"
	&& !Buffer.isBuffer(data)
	&& !Array.isArray(data)) {
	throw new TypeError("first argument must be a string, Array, or Buffer");
    }

    if (data.length === 0) return false;

    if (this.writable) {
	// There might be pending data in the this.output buffer
	while (this.output.length) {
	    if (!this.writable) {
		this._buffer(data, encoding);
		return false;
	    }
	    var c = this.output.shift();
	    var e = this.outputEncodings.shift();
	    this.write(c, e);
	}

	// Directly write to socket.
	return this.write(data, encoding);
    } else {
	this._buffer(data, encoding);
	return false;
    }

    return ret;
};

Client.prototype.query = function () {
    var query = "*" + arguments.length.toString() + "\r\n";
    for (var i = 0; i < arguments.length; i++) {
	var arg = arguments[i].toString();
	query += ("$" + Buffer.byteLength(arg, "utf8") + "\r\n" +
		  arg + "\r\n");
    }
    if (this.readyState === 'closed') this._reconnect();
    this.buf(query);
};

exports.createClient = function (port, host) {
    var c = new Client();
    c.port = port;
    c.host = host;
    return c;
};
