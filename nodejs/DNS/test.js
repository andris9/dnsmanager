var ndns = require ('./ndns-eec0a40/lib/ndns'),
    fs = require("fs"),
    utillib = require("util"),
    dnsapi = require("./dns-api"),
    punycode = require("./punycode");

test2();

function test1(){
    var hostname = "www2.sms-publisher.com";
    
    console.log("Searching for "+hostname);
    dnsapi.db.openDB(function(){
        console.log("DB opened....");
        dnsapi.zones.find(hostname, function(err, zone){
            
            console.log(utillib.inspect(dnsapi.resolver.dig_records("A", hostname,"EE",zone), false, 7));
        
        });
    });
        
}


function test2(){
    var user = "andris";
    
    console.log("Generating secret for "+user);
    dnsapi.db.openDB(function(){
        console.log("DB opened....");
        dnsapi.credentials.create(user, function(err, user){
            
            console.log(utillib.inspect(arguments, false, 7));
        
        });
    });
        
}