var redis = require("redis");
        
/**
 * import(callback) -> undefined
 * - callback (Function): callback function
 * 
 * Imports IP data to Redis
 **/
module.exports = function(callback){
    var client = redis.createClient()
    
    console.log("Start import...");

    var ip_ranges = require("./all"),
        i=ip_ranges.length;
    
    console.log("Data loaded...");
    
    setInterval(function(){
        console.log("Rows left "+i);
    }, 10*1000);
    
    function addeach(){
        var row = ip_ranges[--i];
        client.zadd("iptable", Number(row[0]), row[1]+":"+row[2], function(err, res){
            if(err){
                return callback(err);
            }
            if(i){
                process.nextTick(addeach);
            }else{
                console.log("Ready!");
                client && client.end();
                callback(null, true);
            }
        });
    }
    
    client.del("iptable", function(err, res){
        if(err){
            client && client.end();
            return callback(err);
        }
        console.log("Cleaned table, starting inserts...");
        addeach();    
    });
}

