var DNSApi = require("./modules/dns.js").DNSApi,
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
                add_domain(url.query.user, url.query.domain, send.bind(this, req, res));
                break;
            case "/api/dns/remove":
                remove_domain(url.query.user, url.query.domain, send.bind(this, req, res));
                break;
            case "/api/dns/records":
                list_records(url.query.user, url.query.domain, send.bind(this, req, res));
                break;
            case "/api/dns/update":
                update_records(url.query.user, url.query.domain, payload, send.bind(this, req, res));
                break;
            default:
                send(req, res, "Unknown service");
        }        
    });
    
}


function list_domains(owner, callback){
    DNSApi.listDomains(owner, callback);
}

function add_domain(owner, domain_name, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    DNSApi.addDomain(owner, domain_name, callback);
}

function remove_domain(owner, domain_name, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    DNSApi.removeDomain(owner, domain_name, callback);
}

function list_records(owner, domain_name, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    DNSApi.listRecords(owner, domain_name, callback);
}

function update_records(owner, domain_name, records, callback){
    if(!domain_name){
        return callback("Domain name not specified");
    }
    DNSApi.updateRecords(owner, domain_name, records, callback);
}

function send(req, res, err, data){
    
    res.setHeader("Content-type","application/json; charset=utf-8");
    if(err){
        res.writeHead(500);
        res.end(JSON.stringify({"status": "error", "errormsg": err.message || err}));
        return;
    }
    res.writeHead(200);
    
    res.end(JSON.stringify({
        "status": "OK",
        "data": data
    }));

}