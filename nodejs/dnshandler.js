var dnslib = require("./DNS/dns-api.js"),
    urllib = require("url");

module.exports = function(req, res){
    
    var data = "";
    req.on("data", function(chunk){
        data += chunk.toString("utf-8");
    });
    
    req.on("end", function(chunk){
        var url = urllib.parse(req.url, true);
        
        if(!url.query.user){
            return send(req, res, "Invalid user");
        }
        
        var payload = false;
        try{
            var payload = JSON.parse(data);
        }catch(E){}
        
        switch(url.pathname){
            case "/api/dns/list":
                list_domains(url.query.user, send.bind(this, req, res));
                break;
            case "/api/dns/add":
                add_domain(url.query.domain, url.query.user, send.bind(this, req, res));
                break;
            case "/api/dns/remove":
                remove_domain(url.query.domain, url.query.user, send.bind(this, req, res));
                break;
            case "/api/dns/records":
                list_records(url.query.domain, url.query.user, send.bind(this, req, res));
                break;
            case "/api/dns/update":
                add_record(url.query.domain, url.query.user, payload, send.bind(this, req, res));
                break;
            case "/api/dns/remove-record":
                remove_record(url.query.domain, url.query.user, url.query.rid, send.bind(this, req, res));
                break;
            default:
                send(req, res, "Unknown service");
        }        
    });
    
}


function list_domains(owner, callback){
    dnslib.zones.list(owner, callback);
}

function add_domain(domain_name, owner, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    dnslib.zones.add(domain_name, owner, callback);
}

function remove_domain(domain_name, owner, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    dnslib.zones.remove(domain_name, owner, callback);
}

function list_records(domain_name, owner, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    dnslib.records.list(domain_name, owner, callback);
}

function add_record(domain_name, owner, record, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    dnslib.records.add(domain_name, owner, record, callback);
}

function remove_record(domain_name, owner, rid, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    dnslib.records.remove(domain_name, owner, rid, callback);
}

function send(req, res, err, data){
    
    res.setHeader("Content-type","application/json; charset=utf-8");
    if(err){
        res.writeHead(200);
        res.end(JSON.stringify({"status": "error", "errormsg": err.message || err}));
        return;
    }
    res.writeHead(200);
    
    res.end(JSON.stringify({
        "status": "OK",
        "data": data
    }));

}