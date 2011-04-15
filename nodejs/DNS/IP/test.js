var ip2country = require("./ip2country");

/* resolve and ouput country name for a test IP */

var ip = "195.50.209.246";

ip2country.resolve(ip, function(err, code){
    if(code){
        console.log(code+" - "+ip2country.countries[code]); // EE - Estonia
        ip2country.client.end();
    }
});