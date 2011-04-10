var ndns = require ('./ndns-eec0a40/lib/ndns'),
    fs = require("fs"),
    util = require("util"),
    dnslib = require("/var/www/node/modules/dns");

process.on('uncaughtException',function(err){
    console.log("Catastrophic failure!");
    console.log(err.message);
    console.log(err.trace);
});

dnslib.DNSApi.db.openDB(function(){});

var server = ndns.createServer('udp4'),
    ns_c = ndns.ns_c,
    ns_t = ndns.ns_t,
    reqnr = 0;
    
server.on("request", function(req, res) {
    //log(util.inspect(req, false, 7));
    console.log("request #"+(++reqnr));
    
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
        var data = req.q[req_i++];
        handleDomain(data, function(err, records){
            res.q.add(data);
            
            if(err){
                res.header.rcode = ndns.ns_rcode.servfail;
                res.send();
                return;
            }
            
            if(!records){
                res.header.rcode = ndns.ns_rcode.nxdomain;
                res.send();
                return;
            }
            
            for(var i=0; i<records.answer.length; i++){
                res.addRR.apply(res,records.answer[i]);
                res.header.ancount += 1;
                res.header.aa += 1;
            }
            
            for(var i=0; i<records.authority.length; i++){
                res.addRR.apply(res,records.authority[i]);
                res.header.nscount += 1;
                res.header.aa += 1;
            }
            
            for(var i=0; i<records.additional.length; i++){
                res.addRR.apply(res,records.additional[i]);
                res.header.nscount += 1;
                res.header.ar += 1;
            }
            
            if(req.q.length>=i){
                if(!records.answer.length){
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

function handleDomain(data, callback){
    dnslib.DNSApi.findDomain(data.name,function(err, domain){
        if(err){
            return callback(err);
        }
        if(!domain || !domain.records){
            return callback(err, false);
        }
        
        var records = {
            answer:[],
            authority:[],
            additional: []
        }, found = false, wildcard, temp, ns_pointer = false;
        
        if(data.typeName=="A" || data.typeName=="ANY"){
            found = false;
            if(domain.records["A"] && domain.records["A"].length){
                for(var i=0, len=domain.records["A"].length; i<len; i++){
                    if(domain.records["A"][i].name == data.name){
                        records.answer.push([data.name, 600, ns_c["in"], ns_t.a, domain.records["A"][i].value]);
                        found = true;
                        if(!ns_pointer){
                            ns_pointer=data.name;
                        }
                    }
                }
            }
            if(!found && domain.records["CNAME"] && domain.records["CNAME"].length){
                wildcard = "*."+domain._id;
                found = false;
                temp = false;
                for(var i=0, len=domain.records["CNAME"].length; i<len; i++){
                    if(domain.records["CNAME"][i].name == data.name){
                        records.answer.push([data.name, 600, ns_c["in"], ns_t.cname, domain.records["CNAME"][i].value]);
                        if(!ns_pointer){
                            ns_pointer = domain.records["CNAME"][i].value;
                        }
                        found = true;
                    }
                    if(domain.records["CNAME"][i].name==wildcard){
                        temp = domain.records["CNAME"][i];
                    }
                }
                if(!found && temp){
                    records.answer.push([data.name, 600, ns_c["in"], ns_t.cname, temp.value]);
                    ns_pointer = temp.value;
                }
                if(domain.records["A"] && domain.records["A"].length){
                    for(var i=0, len=domain.records["A"].length; i<len; i++){
                        if(domain.records["A"][i].name == ns_pointer){
                            records.answer.push([ns_pointer, 600, ns_c["in"], ns_t.a, domain.records["A"][i].value]);
                        }
                    }
                }
            }
        }
        
        if(data.typeName=="CNAME"){
            if(domain.records["CNAME"] && domain.records["CNAME"].length){
                wildcard = "*."+domain._id;
                found = false;
                temp = false;
                for(var i=0, len=domain.records["CNAME"].length; i<len; i++){
                    if(domain.records["CNAME"][i].name == ns_pointer){
                        records.answer.push([data.name, 600, ns_c["in"], ns_t.cname, domain.records["CNAME"][i].value]);
                        if(!ns_pointer){
                            ns_pointer = domain.records["CNAME"][i].value;
                        }
                        found = true;
                    }
                    if(domain.records["CNAME"][i].name==wildcard){
                        temp = domain.records["CNAME"][i];
                    }
                }
                if(!found && temp){
                    records.answer.push([data.name, 600, ns_c["in"], ns_t.cname, temp.value]);
                    ns_pointer = temp.value;
                }
                if(domain.records["A"] && domain.records["A"].length){
                    for(var i=0, len=domain.records["A"].length; i<len; i++){
                        if(domain.records["A"][i].name == ns_pointer){
                            records.answer.push([ns_pointer, 600, ns_c["in"], ns_t.a, domain.records["A"][i].value]);
                        }
                    }
                }
            }
        }
        
        if(!ns_pointer)ns_pointer = data.name;
        
        if(data.typeName=="MX" || data.typeName=="ANY"){
            found = false;
            if(domain.records["MX"] && domain.records["MX"].length){
                for(var i=0, len=domain.records["MX"].length; i<len; i++){
                    if(domain.records["MX"][i].name == data.name){
                        records.answer.push([data.name, 600, ns_c["in"], ns_t.mx, parseInt(domain.records["MX"][i].priority,10), domain.records["MX"][i].value]);
                        found = true;
                    }
                }
            }
        }
        
        if(domain.records["NS"] && domain.records["NS"].length){
            for(var i=0, len=domain.records["NS"].length; i<len; i++){
                if(domain.records["NS"][i].name == ns_pointer){
                    if(data.typeName=="NS" || data.typeName=="ANY"){
                        records.answer.push([ns_pointer, 600, ns_c["in"], ns_t.ns, domain.records["NS"][i].value]);
                    }else{
                        records.authority.push([ns_pointer, 600, ns_c["in"], ns_t.ns, domain.records["NS"][i].value]);
                    }
                }
            }
        }
        
        callback(null, records);
    });
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

/*
var curdate = new Date(),
        curyear = curdate.getFullYear(),
        curmonth = curdate.getMonth()+1,
        curday = curdate.getDate(),
        curhours = curdate.getHours(),
        curminutes = curdate.getMinutes(),
        curseconds = curdate.getSeconds(),
        soa_serial;
    
    if(curmonth<10)curmonth = "0"+curmonth;
    if(curday<10)curday = "0"+curday;
    if(curhours<10)curhours = "0"+curhours;
    if(curminutes<10)curminutes = "0"+curminutes;
    if(curseconds<10)curseconds = "0"+curseconds;
    soa_serial = ""+curyear+curmonth+curday+curhours+curminutes+curseconds;
    */
    
    /*
        var ndomain = req.q[i].name.substr(0,4)=="www."?req.q[i].name.substr(4):req.q[i].name;
        // CNAME
        if(req.q[i].name.substr(0,4)=="www." || req.q[i].typeName=="CNAME" || req.q[i].typeName=="ANY"){
            res.addRR("www."+ndomain, 600, ns_c["in"], ns_t.cname, ndomain);
            res.header.ancount += 1;
            res.header.aa += 1;
        }
        
        // A
        if(req.q[i].typeName=="A" || req.q[i].typeName=="ANY"){
            res.addRR(ndomain, 600, ns_c["in"], ns_t.a, "217.146.67.114");
            res.header.ancount += 1;
            res.header.aa += 1;
        }
        
        // MX
        if(req.q[i].typeName=="MX" || req.q[i].typeName=="ANY"){
            res.addRR(ndomain, 600, ns_c["in"], ns_t.mx, 10, "aspmx.l.google.com");
            res.addRR(ndomain, 600, ns_c["in"], ns_t.mx, 20, "alt1.aspmx.l.google.com");
            res.addRR(ndomain, 600, ns_c["in"], ns_t.mx, 30, "alt2.aspmx.l.google.com");
            res.header.ancount += 3;
            res.header.aa += 3;
        }
        
        // SOA
        //ns.elion.ee. hostmaster.elion.ee. 2011032400 28800 7200 604800 86400
        if(req.q[i].typeName=="SOA" || req.q[i].typeName=="ANY"){
            res.addRR(ndomain, 600, ns_c["in"], ns_t.soa, "ns11.node.ee", "andris.node.ee", soa_serial, "600", "600", "600", "600");
            res.header.ancount += 1;
            res.header.aa += 1;
        }
        
        // NS
        res.addRR(ndomain, 600, ns_c["in"], ns_t.ns, "ns11.node.ee");
        res.addRR(ndomain, 600, ns_c["in"], ns_t.ns, "ns22.node.ee");
        if(req.q[i].typeName=="NS"){
            res.header.ancount += 2;
        }else{
            res.header.nscount += 2;
        }
        res.header.aa += 2;
        
        // NS
        res.addRR("ns11.node.ee", 600, ns_c["in"], ns_t.a, "217.146.67.114");
        res.header.arcount += 1;
        res.header.aa += 1;
    }
    //console.log("\n\nRESPONSE:\n");
    //console.log(res);
    //res.header.rcode = ndns.ns_rcode.nxdomain;
    res.send();
    */