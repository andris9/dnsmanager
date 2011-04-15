var mongo = require("mongodb"),
    punycode = require("./punycode"),
    ip2country = require("./IP/ip2country"),
    utillib = require("util");

module.exports = dnsapi = {
    
    allowed_types: ["A", "AAAA", "CNAME", "MX", "NS"],
    
    zones: {

        add: function(zone_name, owner, callback){
            zone_name = punycode.ToUnicode(zone_name.trim().toLowerCase());

            if(zone_name.match(/[^\w\.\-]/)){
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
                dnsapi.db.openCollection("zones", function(err, collection){
                    collection.insert({
                            _id: zone_name,
                            owner: owner,
                            created: new Date(),
                            updated: new Date()
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
                value = options.value || "",
                countries = options.countries || false;
                
            name = punycode.ToUnicode(name);
            
            var record = normalizeRecord(name, zone_name, value);
            if(!record || !name){
                return callback(new Error("Invalid name"));
            }
            
            if(name.charAt(0)!="/" || name.charAt(name.length-1)!="/"){
                if(name.match(/[^\w\.\-\*]/)){
                    return callback(new Error("Invalid characters in name"));
                }
            }
            
            record.ttl = ttl;
            
            if(countries){
                record.countries = countries;
                record.priority += 2;
            }
            
            record.id = Number(id);
            
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
            
            var name = punycode.ToUnicode(options.name || ""),
                type = (options.type || "").trim().toUpperCase(),
                ttl = Math.abs(Number(options.ttl) || 600),
                value = options.value || "",
                countries = options.countries || false;
            
            if(dnsapi.allowed_types.indexOf(type)<0){
                return callback(new Error("Invalid type"));
            }
            
            var record = normalizeRecord(name, zone_name, value);
            if(!record || !name){
                return callback(new Error("Invalid name"));
            }
            
            if(name.charAt(0)!="/" || name.charAt(name.length-1)!="/"){
                if(name.match(/[^\w\.\-\*]/)){
                    return callback(new Error("Invalid characters in name"));
                }
            }
            
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
            var data;
            
            if(!zone.records){
                return callback(null, false);
            }
            
            // A
            
            data = this.check_type("A", hostname, country, zone.records, true);
            if(data.length){
                if(type=="A" || type=="ANY"){
                    response.answer = response.answer.concat(data);
                }
            }
            if(data.length==1 && data[0].record.type=="CNAME"){
                data = this.check_type("A", data[0].record.value[0], country, zone.records, true);
                if(data.length && data[0].record.type=="A"){
                    if(type=="A" || type=="ANY"){
                        response.answer = response.answer.concat(data);
                    }
                    hostname = data[0].record.name;
                }
            }
            
            // CNAME
            if(type=="CNAME"){
                data = this.check_type("CNAME", hostname, country, zone.records, false);
                if(data.length){
                    response.answer = response.answer.concat(data);
                    // TODO: find A as well
                }
            }
            
            // NS
            data = this.check_type("NS", hostname, country, zone.records, false);
            if(data.length){
                if(type=="NS" || type=="ANY"){
                    response.answer = response.answer.concat(data);
                }else{
                    response.authority = response.authority.concat(data);
                }
            }
            
            // MX
            if(type=="MX" || type=="ANY"){
                data = this.check_type("MX", hostname, country, zone.records, type!="ANY");
                if(data.length){
                    response.answer = response.answer.concat(data);
                }
            }
            
            callback(null, response);
        },
        
        check_type: function(type, hostname, country, records, use_cname){
            
            var response = [], record, re, value, matches;
            if(!records[type]){
                if(!!use_cname){
                    return this.check_type("CNAME", hostname, country, records);
                }
                return response;
            }
            
            for(var i=0, len = records[type].length; i<len; i++){
                record = records[type][i];
                record.type = type;
                
                // skip if not in allowed countries
                if(record.countries && record.countries.indexOf(country)<0){
                    continue;
                }
                
                // if direct match, include
                if(record.name == hostname){
                    response.push({hostname: hostname, record: record});
                    // only 1st record for CNAME
                    if(type=="CNAME"){
                        return response;
                    }
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
                        response.push({hostname: hostname, record: record});
                        return response;
                    }
                }
            }
            
            if(!response.length && use_cname){
                return this.check_type("CNAME", hostname, country, records);
            }
            return response;
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




