var ndns = require ('./ndns-eec0a40/lib/ndns'),
    fs = require("fs"),
    util = require("util"),
    dnsapi = require("./dns-api"),
    punycode = require("./punycode");

var hostname = "www2.sms-publisher.com";

console.log("Searching for "+hostname);
dnsapi.db.openDB(function(){
    console.log("DB opened....");
    dnsapi.zones.find(hostname, function(err, zone){
        
        console.log(util.inspect(dnsapi.resolver.dig_records("A", hostname,"EE",zone), false, 7));
    
    });
});
