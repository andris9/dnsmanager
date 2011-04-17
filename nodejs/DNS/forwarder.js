var dnsapi = require("./dns-api"),
    utillib = require("util");

// check if a forward is needed or run callback
module.exports = function(req, res, callback){
    
    var hostname = req.headers.host,
        ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.connection.socket.remoteAddress;
    
    // resolve WEBFWD records
    dnsapi.resolve(hostname, "WEBFWD", ip, function(err, records){
        if(records){
            // use first web forwarder
            for(var i=0; i<records.answer.length; i++){
                if(records.answer[i].record.type=="WEBFWD"){
                    req.resume();
                    res.setHeader("Location","http://"+records.answer[i].record.value[0] + req.url);
                    res.writeHead(302);
                    res.end();
                    return;
                }
            }
        }
        callback(null, true);
    });
    
}