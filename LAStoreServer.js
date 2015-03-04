"use strict";

var express = require("express");
var bodyParser = require("body-parser");
var Promise = require("es6-promise");
var app = express();
var MetadataBroker = require("./MetadataBroker.js");
var validateRequest = require("./RequestValidator.js").validateRequest;

var DatabaseHandler = require('./DatabaseHandler.js');
var db = new DatabaseHandler('dbFile.db');

app.use(bodyParser.raw({limit:"1mb"}));

app.get("/client/:nickname",function(req,res){
	var nickname = req.params.nickname;
	db.getIdFromClientName(nickname).then(function(clientId){
		res.send(clientId);

	},function(error){
		res.send("ERROR: "+error);
	})});

app.post("/files", function(req, res){

});

var MetaDataRequest = {
	filename: "",
	clientId: ""
};

app.get("/fileMetadata", function(req, res){
	var request = JSON.parse(req.body.toString());

	if(!validateRequest(request,MetaDataRequest)){
		res.send("ERROR: Request misformed");
	}

	var metadataBroker = new MetadataBroker();
	metadataBroker.getMetadata(request.filename,request.clientId).then(function(response){
		res.send(response);
	},function(error){
		res.send("ERROR: "+error);
	});


});


var port = 50812;
app.listen(port, function(){
    console.log("LAStore server listening on port "+port);
});
