var dnsapi = require("./dns-api"),
    net = require('net'),
    server_name = "bookweed.com subdomains";

var templates = {
    not_found: "% This Whois Server contains information on\r\n% "+server_name+"\r\n\r\n%ERROR:101: no entries found\r\n%\r\n% No entries found.",
    found: "% This Whois Server contains information on\r\n% "+server_name+"\r\n\r\ndomain: {domain}\r\nowner: {owner}\r\ncreated: {created}"
}


var server = net.createServer(function (socket) {
    socket.on("data", function(data){
        var search_term = data.toString("ascii").trim();
        dnsapi.zones.find(search_term,function(err, zone){
            if(zone){
                socket.end(templates.found.replace("{domain}", zone._id).replace("{owner}", zone.owner).replace("{created}", zone.created));
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