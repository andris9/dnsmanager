
var https = require('https'),
    http = require('http'),
    fs = require('fs'),
    config = require("./config"),
    static_handler = require("./static"),
    punycode = require("./modules/punycode"),
    start_dns_server = require("./DNS/dns-server"),
    start_whois_server = require("./DNS/whois-server"),
    dns_api = require("./dnshandler");

process.on('uncaughtException',function(err){
    try{
        console.log("Unexpected Error\n"+err.message+"\n"+err.stack);
        log("error", "["+Date()+"] Unexpected Error "+err.message);
   }catch(E){
        console.log("Catastrophic failure!")
    }
});

http.createServer(webserver).listen(80, HTTP_Ready);
start_dns_server();
start_whois_server();

function HTTP_Ready(err){
    if(err){
        return console.log("Error setting up listener on port 80\n"+err.message);
    }
    console.log("Listening on port 80");
    https.createServer(config.certificates, webserver).listen(443, HTTPS_Ready);
}

function HTTPS_Ready(err){
    if(err){
        return console.log("Error setting up listener on port 443\n"+err.message);
    }
    process.setgid("node");
    process.setuid("node");
    
    console.log("Listening on port 443");
    log("access"," ["+Date()+"] Server started");
}

function redirect(req, res){
    
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.connection.socket.remoteAddress;
    
    if(config.deny.url.indexOf(req.url)>=0 || config.deny.ip.indexOf(ip)>=0){
        res.writeHead(410);
        res.end();
        return;
    }
    
    log("access","["+Date()+"] 302 to "+ip+" from "+req.url);
    res.setHeader("Location","https://node.ee"+req.url);
    res.writeHead(302);
    res.end();
}

function webserver(req, res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.connection.socket.remoteAddress;
    
    if(config.deny.url.indexOf(req.url)>=0 || config.deny.ip.indexOf(ip)>=0){
        res.writeHead(410);
        res.end();
        return;
    }
    
    if(req.url.match(/^\/api\/dns/)){
        log("access","["+Date()+"] 200 to "+ip+" from "+req.url);
        return dns_api(req, res);
    }
    
    if(req.url=="/dnsmanager"){
        req.url = "/dnsmanager.html";
    }
    
    if(req.url=="/"){
        log("access","["+Date()+"] 200 to "+ip+" from "+req.url);
        res.setHeader("Content-type","text/html; charset=utf-8");
        res.writeHead(200);
        res.end("<!doctype html><html><head><title>"+(punycode.ToUnicode(req.headers.host) || "node.ee")+"</title><meta charset=\"utf-8\"><style type=\"text/css\">body{font-family: Helvetica, Arial, Sans-serif;}</style></head><body><p>hi!</p><p><b>"+(punycode.ToUnicode(req.headers.host) || "node.ee")+"</b> is a <a href=\"http://nodejs.org\">node.js</a> instance ("+process.version+", "+process.getuid()+":"+process.getgid()+")</p></body></html>");
        return;
    }
    
    if(!req.url.match(/\.\./)){
        static_handler.serve(req, res, config.directories["static"]+req.url, function(err){
            if(err){
                return log("error","["+Date()+"] 404 to "+ip+" from "+req.url);
            }
            log("access","["+Date()+"] 200 to "+ip+" from "+req.url);
        });
        return;
    }else{
        log("error","["+Date()+"] 404 to "+ip+" from "+req.url);
        res.writeHead(404);
        res.end("not found\n");
        return;
    }
    
}

function log(type, message){
    fs.open(config.directories.logs+'/'+type+'.log', 'a', function(err, fd){
        if(err){
            return console.log("Could not open log file :S\n"+err.message);
        }
        var buf = new Buffer(message.trim()+"\n","utf-8");
        fs.write(fd, buf, 0, buf.length, null, function(err, written){
            if(err){
                console.log("Failed to write to log file :S\n"+err.message);
            }
            fs.close(fd);
        });
    });
}