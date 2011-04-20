var dnsapi = require("./dns-api"),
    net = require('net'),
    punycode = require('./punycode'),
    server_name = "domains hosted at dns.kreata.ee";

var templates = {
    not_found: "% This Whois Server contains information on\r\n% "+server_name+"\r\n\r\n% ERROR:404: no entries found\r\n%\r\n% No entries found.",
    error_msg: "% This Whois Server contains information on\r\n% "+server_name+"\r\n\r\n% ERROR:500: {errname}\r\n%\r\n% {error}",
    found: "% This Whois Server contains information on\r\n% "+server_name+"\r\n\r\n"+
            "domain:     {domain}\r\n"+
            "registered: {created}\r\n"+
            "changed:    {updated}\r\n\r\n% Registrant:\r\n"+
            "name:       {owner}\r\n"+
            "e-mail:     {email}\r\n\r\n% Nameservers:\r\n{ns}"
}

var server = net.createServer(function (socket) {
    socket.on("data", function(data){
        var search_term = data.toString("ascii").trim();
        whois(search_term, function(err, response){
            if(err){
                return socket.end(templates.error_msg.
                    replace("{errname}", (err.name || "Error")).
                    replace("{error}", (err.message || err)));
            }
            socket.end(response);
        });
    });
});

function whois(search_term, callback){
    search_term = search_term && search_term.trim() || "";
    dnsapi.zones.find(search_term,function(err, zone){
        if(err){
            return callback(err);
        }
        if(zone){
            var ns = [],
                owner = zone.whois && zone.whois.fname+" "+zone.whois.lname || zone.owner,
                email = zone.whois && zone.whois.email || "Not Disclosed";
            if(zone.records && zone.records.NS){
                for(var i=0; i<zone.records.NS.length; i++){
                    if(zone.records.NS[i].name=="@" || zone.records.NS[i].name==zone._id){
                        ns.push("nserver:    "+(zone.records.NS[i].value && zone.records.NS[i].value[0] || ""));
                    } 
                }
            }
            ns = ns.length?ns.join("\r\n"):"% No namservers set";
            callback(null, templates.found.
                replace("{domain}", punycode.ToASCII(zone._id)).
                replace("{owner}", owner).
                replace("{created}", format_date(zone.created)).
                replace("{updated}", format_date(zone.updated)).
                replace("{email}", email).
                replace("{ns}", ns));
        }else{
            callback(null, templates.not_found);
        }
    });
}

module.exports = {
    start: function(){
        server.listen(43);
        console.log("Starting WHOIS server on port 43");
    },
    request: function(search_term, callback){
       whois(search_term, callback);
    }
}

function format_date(date){
    date = date || new Date();
    var year = date.getFullYear(),
        month = date.getMonth() + 1,
        day = date.getDate(),
        hour = date.getHours(),
        minute = date.getMinutes(),
        second = date.getSeconds();
    return (day<10?"0":"")+day+"."+(month<10?"0":"")+month+"."+year+" "+(hour<10?"0":"")+hour+":"+(minute<10?"0":"")+minute+":"+(second<10?"0":"")+second;
}