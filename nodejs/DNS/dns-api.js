var mongo = require("mongodb"),
    punycode = require("./punycode"),
    ip2country = require("./IP/ip2country"),
    utillib = require("util"),
    crypto = require("crypto");

var default_ns = ["ns11.node.ee", "ns22.node.ee"],
    forward_host = "forwarder.node.ee";

module.exports = dnsapi = {
    
    allowed_types: ["A", "AAAA", "CNAME", "MX", "NS", "SRV", "WEBFWD"],
    
    credentials: {
        
        create: function(user_name, user_data, callback){
            user_name = (user_name || "").trim();
            if(!callback && typeof user_data == "function"){
                callback = user_data;
                user_data = false;
            }
            user_data = user_data || {};
            if(!user_name){
                return callback(new Error("Username not specified"));
            }
            this.get(user_name, function(err, user){
                if(user){
                    return callback(new Error("Username already exists"));
                }
                var secret = sha1(Date.now()+user_name);
                dnsapi.db.openCollection("credentials", function(err, collection){
                    collection.insert({
                        _id: user_name,
                        secret: secret,
                        data: user_data
                    });
                });
                callback(null, {
                    user: user_name,
                    secret: secret
                });
            });
            
        },
        
        get: function(user_name, callback){
            user_name = (user_name || "").trim();
            dnsapi.db.openCollection("credentials", function(err, collection){
                if(err){
                    return callback(err);
                }
                collection.find({_id: user_name}, function(err, cursor){
                    if(err){
                        return callback(err);
                    }
                    cursor.toArray(function(err, users) {
                        return callback(null, users && users[0]);
                    });
                });
            });
        },
        
        verify: function(user_name, secret, domain_name){
            
        }
    },
    
    zones: {

        add: function(zone_name, owner, options, callback){
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());

            options = options || {};

            if(zone_name.match(/[^\w\.\-\*@\u0081-\uFFFF]/)){
                return callback(new Error("Invalid characters in name"));
            }

            this.find(zone_name, (function(err, zone){
                if(err){
                    return callback(err);
                }
                
                if(zone){
                    if(zone._id==zone_name || zone.owner != owner){
                        return callback(new Error("This domain name is already listed in the system"));
                    }
                }
                
                if(options.default_ip && (options.default_ip = options.default_ip.trim()) && !options.default_ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)){
                    return callback(new Error("Invalid IP address"));
                }
                
                var records = {
                    _gen: 2,
                    NS: [
                        {
                            name: "@",
                            ttl: 600,
                            id: 1,
                            value: [default_ns[0]],
                            frozen: true
                        },
                        {
                            name: "@",
                            ttl: 600,
                            id: 2,
                            value: [default_ns[1]],
                            frozen: true
                        }
                    ]
                };
                
                if(options.default_ip){
                    // main A record
                    records["A"] = records["A"] || [];
                    records["A"].push({
                        name: "@",
                        ttl: 60,
                        id: ++records._gen,
                        value: [options.default_ip]
                    });
                    // www CNAME record
                    records["CNAME"] = records["CNAME"] || [];
                    records["CNAME"].push({
                        name: "www",
                        ttl: 60,
                        id: ++records._gen,
                        value: ["@"]
                    });
                }
                
                if(options.use_ga_mx){
                    var mx_servers = [
                        ["aspmx.l.google.com", 10],
                        ["alt1.aspmx.l.google.com", 20],
                        ["alt2.aspmx.l.google.com", 20],
                        ["aspmx2.googlemail.com", 30],
                        ["aspmx3.googlemail.com", 30],
                        ["aspmx4.googlemail.com", 30],
                        ["aspmx5.googlemail.com", 30]
                    ];
                    records["MX"] = records["MX"] || [];
                    for(var i=0; i<mx_servers.length; i++){
                        records["MX"].push({
                            name: "@",
                            ttl: 60,
                            id: ++records._gen,
                            value: mx_servers[i]
                        });
                    }
                }
                
                dnsapi.db.openCollection("zones", function(err, collection){
                    collection.insert({
                            _id: zone_name,
                            owner: owner,
                            created: new Date(),
                            updated: new Date(),
                            whois:{
                                fname: options.fname || "",
                                lname: options.lname || "",
                                email: options.email || ""
                            },
                            records: records
                        }, function(err, docs){
                            if(err){
                                return callback(err);
                            }
                            callback(null, true);
                        }
                    );
                });
                
            }).bind(this));
        },
        
        get: function(zone_name, callback){
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());
            dnsapi.db.openCollection("zones", function(err, collection){
                collection.find({_id: zone_name}, function(err, cursor) {
                    if(err){
                        return callback(err);
                    }
                    
                    cursor.toArray(function(err, zones){
                        if(err){
                            return callback(err);
                        }
                        callback(null, zones && zones[0] || false);
                   });
                });
            });
        },
        
        remove: function(zone_name, owner, callback){
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());
            dnsapi.db.openCollection("zones", function(err, collection){
                collection.findAndModify({_id: zone_name, owner: owner}, [], {},{remove: true}, function(err, zone){
                    if(err){
                        return callback(err);
                    }
                    callback(null, zone);
                });
            });
        },
        
        list: function(owner, callback){
            var zones = [];
            dnsapi.db.openCollection("zones", function(err, collection){
                if(err){
                    return callback(err);
                }
                collection.find({owner: owner}, {_id: 1, created: 1, updated:1 }, {sort: "_id"}, function(err, cursor) {
                    if(err){
                        return callback(err);
                    }
                    
                    cursor.toArray(callback);
                    
                });
            });
        },
        
        find: function(hostname, callback){
            this.get(hostname, (function(err, zone){
                if(err){
                    return callback(err);
                }
                if(zone){
                    return callback(null, zone);
                }
                var parts = hostname.split(".");
                parts.shift();
                if(parts.length){
                    return this.find(parts.join("."), callback);
                }else{
                    return callback(null, false);
                }
            }).bind(this));
        }
    },
    
    records: {
       list: function(zone_name, owner, callback){
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());
            dnsapi.db.openCollection("zones", function(err, collection){
                if(err){
                    return callback(err);
                }
                collection.find({_id: zone_name, owner: owner}, function(err, cursor) {
                    if(err){
                        return callback(err);
                    }
                    
                    cursor.toArray(function(err, zones){
                        if(err){
                            return callback(err);
                        }
                        var zone = zones && zones[0] || false,
                            records = zone && zone.records || {};
                       callback(null, zone && records);
                   });
                });
            });
        },
        
        save: function(zone_name, owner, records, callback){
            dnsapi.db.openCollection("zones", function(err, collection){
                if(err){
                    return callback(err);
                }
                collection.findAndModify({_id: zone_name, owner: owner}, [], {$set:{records:records, updated: new Date()}},{}, function(err, zone){
                    if(err){
                        return callback(err);
                    }
                    callback(null, zone && true || false);
                });
            });
        },
        
        update: function(zone_name, owner, id, options, callback){
            options = options || {};
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());
            
            var name = options.name || "",
                ttl = Math.abs(Number(options.ttl) || 600),
                value = options.value || "",
                countries = options.countries || false;
                
            name = punycode.ToUnicode(name);
            
            var record = normalizeRecord(name, zone_name, value);
            if(!record || !name){
                return callback(new Error("Invalid name"));
            }
            
            if(name.charAt(0)!="/" || name.charAt(name.length-1)!="/"){
                if(name.match(/[^\w\.\-\*@\u0081-\uFFFF]/)){
                    return callback(new Error("Invalid characters in name"));
                }
            }
            
            record.ttl = ttl;
            
            if(countries){
                record.countries = countries;
                record.priority += 2;
            }
            
            record.id = Number(id);
            
            // TODO: vaja määrata tüüp, et saaks kontrollida A, AAAA jne vastavust
            
            this.list(zone_name, owner, (function(err, records){
                if(err){
                    return callback(err);
                }
                if(!records){
                    return callback(null, false);
                }
                
                if(!records._gen){
                    records._gen = record.id;
                }

                var keys = Object.keys(records), type;
                for(var j=0; j<keys.length; j++){
                    if(Array.isArray(records[keys[j]])){
                        type = keys[j];
                        
                        for(var i=0, len = records[type].length; i<len; i++){
                            if(records[type][i].id==record.id){
                                records[type][i] = record;
                                records[type] = records[type].sort(function(a,b){
                                    return (a.priority || 0) - (b.priority || 0);
                                });
                                return this.save(zone_name, owner, records, callback);
                            }
                        }
                   }
                }
                callback(null, false);
                
            }).bind(this));
        },
        
        remove: function(zone_name, owner, id, callback){
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());
            
            this.list(zone_name, owner, (function(err, records){
                if(err){
                    return callback(err);
                }
                if(!records){
                    return callback(null, false);
                }

                var keys = Object.keys(records), type;
                for(var j=0; j<keys.length; j++){
                    if(Array.isArray(records[keys[j]])){
                        type = keys[j];
                        for(var i=0, len = records[type].length; i<len; i++){
                            if(records[type][i].id == Number(id)){
                                if(records[type][i].frozen){
                                    return callback(new Error("This record can not be removed "+JSON.stringify(records[type][i])));
                                }
                                records[type].splice(i,1);
                                return this.save(zone_name, owner, records, callback);
                            }
                        }
                    }
                }
                callback(null, false);
                
            }).bind(this));
        },
        
        add: function(zone_name, owner, options, callback){
            options = options || {};
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());
            
            var name = punycode.ToUnicode(options.name || ""),
                type = (options.type || "").trim().toUpperCase(),
                ttl = Math.abs(Number(options.ttl) || 600),
                value = options.value || "",
                countries = options.countries || false;
            
            if(dnsapi.allowed_types.indexOf(type)<0){
                return callback(new Error("Invalid type"));
            }
            
            var record = normalizeRecord(name, zone_name, value);
            if(!record || !name){
                return callback(new Error("Invalid name"));
            }
            
            if(name.charAt(0)!="/" || name.charAt(name.length-1)!="/"){
                if(name.match(/[^\w\.\-\*@\u0081-\uFFFF]/)){
                    return callback(new Error("Invalid characters in name"));
                }
            }
            
            if(type=="A"){
                if(!record.value[0].match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)){
                    return callback(new Error("Invalid IP address"));
                }
            }
            
            if(type=="AAAA"){
                if(!record.value[0].match(/^(?:[a-f0-9]{0,4}:){4,}[a-f0-9]{0,4}$/)){
                    return callback(new Error("Invalid IPv6 address"));
                }
                var parts, needed;
                if(record.value[0].indexOf("::")>=0){
                    parts = record.value[0].split(":"),
                    needed = 8-parts.length;
                    record.value[0] = record.value[0].replace("::", Array(needed+2).join(":0")+":");
                }
                // zero pad left
                parts = record.value[0].split(":");
                for(var i=0; i<8; i++){
                    parts[i] = Array(4 - parts[i].length + 1).join("0") + parts[i];
                }
                record.value[0] = parts.join(":");
            }

            record.value[0] = record.value[0].replace("@", zone_name);

            if(countries){
                record.countries = countries;
                record.priority += 2;
            }
            
            record.ttl = ttl;
            
            this.list(zone_name, owner, (function(err, records){
                if(err){
                    return callback(err);
                }
                if(!records){
                    return callback(null, false);
                }

                if(!records._gen){
                    record.id = records._gen = 1;
                }else{
                    record.id = ++records._gen;
                }

                if(!records[type]){
                    records[type] = [];
                }
                
                records[type].push(record);
                records[type] = records[type].sort(function(a,b){
                    return (a.priority || 0) - (b.priority || 0);
                });
                this.save(zone_name, owner, records, callback);
            }).bind(this));
        }
    },
    
    resolve: function(hostname, type, req_ip, callback){
        
        hostname = punycode.ToUnicode(hostname.trim().toLowerCase());
        
        this.zones.find(hostname, (function(err, zone){
            if(err){
                return callback(err);
            }
            
            var response = {
                hostname: zone._id,
                answer: [],
                authority: [],
                additional:[]
            }
            
            if(!zone){
                return callback(null, response);
            }
            
            if(("."+hostname).substr(-(zone._id.length+1))=="."+zone._id){
                hostname = hostname.substr(0, hostname.length - zone._id.length - 1);
                if(!hostname){
                    hostname = "@";
                }
            }
    
            ip2country.resolve(req_ip, (function(err, country){
                if(err){
                    return callback(err);
                }
                this.resolver.records(hostname, zone, type, country, response, callback);
            }).bind(this));
            
        }).bind(this));
    },
    
    resolver: {
        
        records: function(hostname, zone, type, country, response, callback){
            var data, ns_pointer = hostname;
            
            if(!zone.records){
                return callback(null, false);
            }
            
            // A
            data = this.dig_records("A", hostname, country, zone);
            if(data.length){
                if(type=="A" || type=="ANY"){
                    response.answer = response.answer.concat(data);
                }
            }
            
            // CNAME
            if(type=="CNAME"){
                data = this.dig_records("CNAME", hostname, country, zone);
                if(data.length){
                    response.answer = response.answer.concat(data);
                }
            }
            
            // WEBFWD
            data = this.dig_records("WEBFWD", hostname, country, zone, false);
            if(data.length){
                if(type!="WEBFWD"){
                    data.forEach(function(record){
                        record.record.type = "CNAME";
                        record.record.value[0] = forward_host; 
                    });
                }
                response.answer = response.answer.concat(data);
            }
            
            // AAAA
            if(type=="AAAA" || type=="ANY"){
                data = this.dig_records("AAAA", hostname, country, zone);
                if(data.length){
                    response.answer = response.answer.concat(data);
                }
            }
            
            // MX
            if(type=="MX" || type=="ANY"){
                data = this.dig_records("MX", hostname, country, zone);
                if(data.length){
                    response.answer = response.answer.concat(data);
                }
            }
            
            // SRV
            if(type=="SRV" || type=="ANY"){
                data = this.dig_records("SRV", hostname, country, zone);
                if(data.length){
                    response.answer = response.answer.concat(data);
                }
            }
            
            // NS
            // use last A record if available instead of hostname
            if(response.answer.length && response.answer[response.answer.length-1].record.type == "A"){
                 ns_pointer = response.answer[response.answer.length-1].hostname || hostname;
            }
            if(ns_pointer || type=="ANY" || type=="NS"){
                data = this.dig_records("NS", ns_pointer, country, zone, true);
                if(data.length){
                    if(type=="NS" || type=="ANY"){
                        response.answer = response.answer.concat(data);
                    }else{
                        response.authority = response.authority.concat(data);
                    }
                }
            }
            
            callback(null, response);
        },
        
        dig_records: function(type, hostname, country, zone, skip_digging, hop_count){
            var response = [], record, re, value, matches, records = zone.records, hop_host;

            if(!hop_count)hop_count = 0;

            hostname = this.check_internal(hostname, zone) || hostname;
            if(!hostname)return response;

            for(var i=0, len = records[type] && records[type].length || 0; i<len; i++){
                
                record = records[type][i];
                record.type = type;
                
                // skip if disabled
                if(record.disabled)continue;
                
                // skip if not in allowed countries
                if(record.countries && record.countries.indexOf(country)<0){
                    continue;
                }
                
                // if direct match, include
                if(record.name == hostname){
                    response.push({hostname: hostname, record: record});
                }
                
                // if regexp, include first
                if(record.regexp && !response.length){
                    try{
                        re = new RegExp(record.regexp);
                    }catch(E){
                        // on error skip
                        continue;
                    }
                    if(matches = hostname.match(re)){
                        if(record.value[0].match("\\$")){
                            record.value[0] = hostname.replace(re, record.value[0]);
                        }
                        record.regex = true;
                        response.push({hostname: hostname, record: record});
                    }
                }
            }
            
            // keep away from eternal loop, allow 5 hops
            if(hop_count>5){
                return response;
            }
            
            if(!response.length && type!="CNAME" && type!="WEBFWD"){
                response = this.dig_records("CNAME", hostname, country, zone, skip_digging, hop_count+1);
            }else if(!skip_digging){
                for(var i=0, len=response.length;i<len;i++){
                    if(["NS","CNAME","MX"].indexOf(response[i].record.type)>=0){
                        if(hop_host = this.check_internal(response[i].record.value[0], zone)){
                            response = response.concat(this.dig_records("A", hop_host, country, zone, false, hop_count+1));
                        }
                    }
                }
            }
            
            return response;
        },
        
        check_internal: function(hostname, zone){
            if(("."+hostname).substr(-(zone._id.length+1))=="."+zone._id){
                hostname = hostname.substr(0, hostname.length - zone._id.length - 1);
                if(!hostname){
                    hostname = "@";
                }
                return hostname;
            }
            return hostname=="@"?"@":false;
        }
        
    },
    
    db: {
        server: new mongo.Db(
            "dns", // db collection_name 
            new mongo.Server(
                "localhost", // server 
                mongo.Connection.DEFAULT_PORT, //port
                {auto_reconnect: true}
            )
        ),
    
        db_connection: false,
    
        openDB: function(callback){
            this.server.open((function(err, db){
                if(err){
                    return callback(err);
                }
                this.db_connection = db;
                callback(null, this.db_connection);
            }).bind(this));
        },
    
        openCollection: function(collection_name, callback, err){
            if(err){
                return callback(err);
            }
            if(this.db_connection){
                this.db_connection.createCollection(collection_name, (function(err, collection){
                    if(err){
                        return callback(err);
                    }
                    callback(null, collection)
                }).bind(this));
            }else{
                this.openDB(this.openCollection.bind(this, collection_name, callback));
            }
        },
        
        closeDB: function(){
            if(this.db_connection){
                this.db_connection.close();
            }
            ip2country.client.end();
        }
    }
}

function normalizeRecord(name, zone_name, value){
    name = (name || "").replace(/^[\s\.]+|[\s\.]+$/g,"").toLowerCase();

    if(!Array.isArray(value)){
        value = [value];
    }
    
    if(("."+name).substr(-(zone_name.length+1))=="."+zone_name){
        name = name.substr(0, name.length - zone_name.length - 1);
        if(!name){
            name = "@";
        }
    }
    
    if(String(value[0]).trim().toLowerCase() == zone_name){
        value[0] = "@";
    }
    
    var result = {name: name, value: value, priority: 3};
    if(name=="*"){
        result.regexp = "^((.*))$";
        result.priority = 9;
    }else if(name.length>1 && name.charAt(0)=="/" && name.charAt(name.length-1)=="/"){
        result.regexp = "("+name.substr(1, name.length-2)+")";
        result.priority = 5;
    }else if(name.indexOf("*")>=0){
        result.regexp = "^("+name.replace(/([-\.])/g, "\\$1").replace(/\*/g,"(.*?)")+")$";
        result.priority = 7;
    }
    
    if(result.regexp){
        try{
            new RegExp(result.regexp); // fails if invalid
        }catch(E){
            return false;
        }
    }
    
    return result;
}

function sha1(str){
    var c = crypto.createHash("sha1");
    c.update(str);
    return c.digest("base64");
}