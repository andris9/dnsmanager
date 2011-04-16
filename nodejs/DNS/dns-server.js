var ndns = require ('./ndns-eec0a40/lib/ndns'),
    fs = require("fs"),
    util = require("util"),
    dnsapi = require("./dns-api"),
    punycode = require("./punycode");

dnsapi.db.openDB(function(){});

module.exports = function(){

    var server = ndns.createServer('udp4'),
        ns_c = ndns.ns_c,
        ns_t = ndns.ns_t,
        reqnr = 0;
    
    var tcount = 0,
        tsec = 60;
    
    setInterval(function(){
        var m = (tcount/tsec).toFixed(2);
        console.log(tcount+" requests in "+tsec+" seconds, total "+reqnr+", "+m+" req/s avg");
        tcount = 0;
    },tsec*1000);
    
    
    server.on("request", function(req, res) {
    
        reqnr++;
        tcount++;
        res.setHeader(req.header);
        res.header.qr = req.q.length;
        res.header.aa = 0;
        res.header.rd = 0;
        res.header.ra = 0;
        res.header.ancount = 0;
        res.header.arcount = 0;
        res.header.nscount = 0;
        
        var req_i=0;
        
        manageDomain();
        
        function manageDomain(){
            var data = req.q[req_i++], name, value;
            res.q.add(data);
            
            dnsapi.resolve(data.name, data.typeName, req.rinfo.address, function(err, records){
                
                records.answer && records.answer.forEach(function(record){
                    res.addRR.apply(res, getValue(records, record));
                    res.header.ancount += 1;
                    res.header.aa += 1;
                });
                
                records.authority && records.authority.forEach(function(record){
                    res.addRR.apply(res, getValue(records, record));
                    res.header.nscount += 1;
                    res.header.aa += 1;
                });
                
                records.additional && records.additional.forEach(function(record){
                    res.addRR.apply(res, getValue(records, record));
                    res.header.arcount += 1;
                    res.header.aa += 1;
                });
               
                if(req.q.length>=req_i){
                    if(!records.answer || !records.answer.length){
                        res.header.rcode = ndns.ns_rcode.nxdomain;
                    }
                    res.send();
                }else{
                    manageDomain();
                }
            });
        }    
        
    });
    server.bind(53);
    console.log("DNS server started on UDP port 53");
    
    function normalizeHost(name, hostname){
        if(name=="@" || !name){
            return hostname;
        }else{
            return name+"."+hostname;
        }
    }
    
    function getValue(records, record){
        var name, value;
        if(record.hostname=="@" || !record.hostname){
            name = records.hostname;
        }else{
            name = record.hostname+"."+records.hostname;
        }
                    
        switch(record.record.type){
            case "A":
            case "CNAME":
            case "NS":
                value = [punycode.ToASCII(record.record.value[0].replace("@", records.hostname) || "")];
                break;
            case "MX":
                value = [record.record.value[1] || 10, punycode.ToASCII(record.record.value[0].replace("@", records.hostname) || "")];
                break;
            case "SRV":
                value = [0, 0, record.record.value[1] || 10, punycode.ToASCII(record.record.value[0].replace("@", records.hostname) || "")];
                break;
        }
        //[data.name, 60, ns_c["in"], ns_t.a, domain.records["A"][i].value
        value.unshift(ns_t[record.record.type.toLowerCase()]);
        value.unshift(ns_c["in"]);
        value.unshift(record.record.ttl || 600);
        if(record.record.type!="SRV"){
            value.unshift(punycode.ToASCII(name));
        }else{
            // SRV records include _ symbols
            value.unshift(name);
        }
        return value;
    }
    
    function log(message){
        message = "["+Date()+"]\n"+message+"\n";
        fs.open('request.log', 'a', function(err, fd){
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

}