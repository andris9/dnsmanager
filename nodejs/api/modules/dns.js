var mongo = require("mongodb");

exports.DNSApi = {
    
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
        }
    },
    
    addDomain: function(owner, domain_name, callback){
        this.getDomain(domain_name, (function(err, domain){
            if(err){
                return callback(err);
            }
            if(domain){
                return callback(null, false);
            }
            this.db.openCollection("zones", (function(err, collection){
                collection.insert({
                        _id: domain_name,
                        owner: owner,
                        date: new Date()
                    }, function(err, docs){
                        if(err){
                            return callback(err);
                        }
                        callback(null, true);
                    }
                );
            }).bind(this));
            
        }).bind(this));
    },
    
    removeDomain: function(owner, domain_name, callback){
        this.db.openCollection("zones", (function(err, collection){
            collection.findAndModify({_id: domain_name, owner: owner}, [], {},{remove: true}, function(err, domain){
                if(err){
                    return callback(err);
                }
                callback(null, domain);
            })
        }).bind(this));
    },
    
    
    getDomain: function(domain_name, callback){
        this.db.openCollection("zones", (function(err, collection){
            collection.find({_id: domain_name}, (function(err, cursor) {
                if(err){
                    return callback(err);
                }
                
                cursor.toArray(function(err, domains){
                    if(err){
                        return callback(err);
                    }
                    callback(null, domains[0] || false);
               });
                
            }).bind(this));
        }).bind(this));
    },
    
    findOwnerDomain: function(domain_name, owner, callback){
        this.db.openCollection("zones", (function(err, collection){
            collection.find({_id: domain_name, owner:owner}, (function(err, cursor) {
                if(err){
                    return callback(err);
                }
                
                cursor.toArray(function(err, domains){
                    if(err){
                        return callback(err);
                    }
                    callback(null, domains[0] || false);
               });
                
            }).bind(this));
        }).bind(this));
    },
    
    
    findDomain: function(domain_name, callback){
        this.db.openCollection("zones", (function(err, collection){
            if(err){
                return callback(err);
            }
            
            var domain_parts = domain_name.split(".");
            
            var walk_domain = (function(){
                dname = domain_parts.join(".");
                collection.find({_id: dname}, (function(err, cursor) {
                    if(err){
                        return callback(err);
                    }
                    
                    cursor.toArray(function(err, domains){
                        if(err){
                            return callback(err);
                        }
                        if(domains && domains[0]){
                            return callback(null, domains[0]);
                        }
                        domain_parts.shift();
                        if(!domain_parts.length){
                            return callback(null, false);
                        }
                        walk_domain();
                   });
                    
                }).bind(this));
            }).bind(this);
            walk_domain();
            
        }).bind(this));
    },
    
    listRecords: function(owner, domain_name, callback){
        this.db.openCollection("zones", (function(err, collection){
            if(err){
                return callback(err);
            }
            collection.find({_id: domain_name, owner: owner}, (function(err, cursor) {
                if(err){
                    return callback(err);
                }
                
                cursor.toArray(function(err, domains){
                    if(err){
                        return callback(err);
                    }
                    console.log(domains && domains[0] && (domains[0].records || []) || false)
                    callback(null, domains && domains[0] && (domains[0].records || []) || false);
               });
                
            }).bind(this));
        }).bind(this));
    },
    
    updateRecords: function(owner, domain_name, records, callback){
        console.log(records)
        console.log(domain_name, owner)
        this.db.openCollection("zones", (function(err, collection){
            collection.findAndModify({_id: domain_name, owner: owner}, [], {$set:{records:records}},{}, function(err, domain){
                if(err){
                    return callback(err);
                }
                callback(null, domain);
            })
        }).bind(this));
    },
    
    listDomains: function(owner, callback){
        var domains = [];
        this.db.openCollection("zones", (function(err, collection){
            if(err){
                return callback(err);
            }
            collection.find({owner: owner}, {_id: 1}, {sort: "_id"}, (function(err, cursor) {
                if(err){
                    return callback(err);
                }
                
                cursor.toArray(callback);
                
            }).bind(this));
        }).bind(this));
    }
}

/*
exports.DNSApi.getDomain("test.andrisreinman.com", function(err, domain){
   console.log(err || domain);
   exports.DNSApi.db.closeDB(); 
});
*/

/*
exports.DNSApi.addDomain("andris", "ns1.node.ee", function(err, success){
    console.log(!err && success && "success!" || "ni :/");
    exports.DNSApi.db.closeDB();
});
*/
/*
exports.DNSApi.removeDomain("andris", "ns1.node.ee", function(err, domain){
    
    if(err){
        console.log("ERROR:\n"+(err.message || err));
        exports.DNSApi.db.closeDB();
        return;
    }
    
    console.log(domain && "Found match" || "No match");
    
    exports.DNSApi.listDomains("andris",function(err, domains){
        console.log(domains);
        exports.DNSApi.db.closeDB();
    });
    
});
*/
/*
exports.DNSApi.listDomains("andris",function(err, domains){
    console.log(domains);
    exports.DNSApi.db.closeDB();
});
*/