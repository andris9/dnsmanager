var dnsapi = require("./dns-api"),
    net = require('net'),
    punycode = require('./punycode'),
    server_name = "bookweed.com subdomains";

var templates = {
    not_found: "% This Whois Server contains information on\r\n% "+server_name+"\r\n\r\n%ERROR:101: no entries found\r\n%\r\n% No entries found.",
    found: "% This Whois Server contains information on\r\n% "+server_name+"\r\n\r\ndomain: {domain}\r\nregistered: {created}\r\nchanged: {updated}\r\n\r\n% Registrant:\r\nname: {owner}\r\ne-mail: Not Disclosed\r\n\r\n% Nameservers:\r\n{ns}"
}

var server = net.createServer(function (socket) {
    socket.on("data", function(data){
        var search_term = data.toString("ascii").trim();
        dnsapi.zones.find(search_term,function(err, zone){
            if(zone){
                var ns = [],
                    owner = zone.whois && zone.whois.fname+" "+zone.whois.lname || zone.owner;
                if(zone.records && zone.records.NS){
                    for(var i=0; i<zone.records.NS.length; i++){
                        ns.push("nserver: "+(zone.records.NS[i].value && zone.records.NS[i].value[0] || "")); 
                    }
                }
                ns = ns.length?ns.join("\r\n"):"% No namservers set";
                socket.end(templates.found.
                    replace("{domain}", punycode.ToASCII(zone._id)).
                    replace("{owner}", owner).
                    replace("{created}", zone.created).
                    replace("{updated}", zone.updated).
                    replace("{ns}", ns));
            }else{
                socket.end(templates.not_found);
            }
        });
    });
});

module.exports = function(){
    server.listen(43);
    console.log("Starting WHOIS server on port 43");
}