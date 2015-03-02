"use strict";

var express = require("express");
var app = express();


app.post("/storeFiles", function(req, res){

});


var port = 50812;
app.listen(port, function(){
    console.log("LAProcessor server listening on port "+port);
});
