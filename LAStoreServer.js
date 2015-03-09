"use strict";

var express = require("express");
var bodyParser = require("body-parser");
var Promise = require("es6-promise");
var app = express();
var MetadataBroker = require("./MetadataBroker.js");
var validateRequest = require("./RequestValidator.js").validateRequest;
var User = require('./User.js')();

var DatabaseHandler = require('./DatabaseHandler.js');
var FileOrganizer= require('./FileOrganizer.js');
FileOrganizer = FileOrganizer();
var db = new DatabaseHandler('dbFile.db');
var Log = require("./Logger.js");
var argv = require('minimist')(process.argv.slice(2));

var PORT = argv.p || argv.port || "50812";

app.use(bodyParser.json({limit:"1mb"}));

app.post("/client",function(req,res){
	var clientId = User.create();	
	var log = new Log("Create client "+clientId);
	log.print();
	db.insertUser(clientId);
	res.send(clientId);
});

app.post("/client/name",function(req,res){
	var allowedNamePattern = /^[A-z0-9_]+$/;
	console.log("Got",req.body);
	var info = req.body;
	var name = info.name;
	var clientId = info.clientId;

	var log = new Log("SetName request: "+name,clientId);

	var validName = (name.match(allowedNamePattern) !== null
				&& name.match(allowedNamePattern).length > 0);
	
	function onSuccess (){
		var reply = {'status': 'OK', 'fulfilled': validName};
		res.send(JSON.stringify(reply));
		log.print();
	}

	function onError (error){
		var reply = {'status': 'OK', 'error': error};
		res.send(JSON.stringify(reply));
		log.print();
	}

	if(validName){
		log.debug("Name valid, setting in DB");
		db.setClientName(clientId,name).then(onSuccess,onError);
	}else{
		//Set empty if name is illegal
		log.debug("Name invalid, setting 0");
		db.setClientName(clientId,"").then(onSuccess,onError);
	}

});

var setClientParticipatingRequest = {
	clientId: "",
	participating: false 
};

app.post("/client/participating",function(req,res){
	var params = req.body;

	if(!validateRequest(params,setClientParticipatingRequest)){
		var err = {error: "Request misformed"};
		res.send(JSON.stringify(err));
	}
	var clientId = params.clientId;
	var value = params.participating;

	var log = new Log(clientId,"Participating: "+value);
	var hasBeenSet = false;

	if(value === "false" || value === "true" || value === false || value === true)	{
		db.setClientParticipating(clientId,value).then(function(){

			hasBeenSet = true;
			log.debug("Paricipating set: "+hasBeenSet);

			var response = {status: "OK"};
			res.send(JSON.stringify(response));
			log.print();

		},function(error){
			var response = {status: "OK",error:error};
			res.send(JSON.stringify(response));
			log.print();
		});
	}else{
		var response = {status: "OK"};
		res.send(JSON.stringify(response));
		log.print();
	}

});

app.get("/client/participating",function(req,res){
	
})

app.get("/client/:nickname",function(req,res){
	var nickname = req.params.nickname;
	db.getIdFromClientName(nickname).then(function(clientId){
		var response = {id: clientId};
		res.send(JSON.stringify(response));

	},function(error){
		var err = {error: error};
		res.send(JSON.stringify(err));
	});
});

var setErrorLogRequest= {
	clientId: "",
	log: ""
};

app.post("/errorLog",function(req,res){
	var params = req.body;
	if(!validateRequest(params,setErrorLogRequest)){
		var err = {error: "Request misformed"};
		res.send(JSON.stringify(err));
	}

	db.insertApplicationLog(params.clientId,"error",params.log);
});

var setEventLogRequest= {
	clientId: "",
	log: ""
};

app.post("/eventLog",function(req,res){
	var params = req.body;
	if(!validateRequest(params,setErrorLogRequest)){
		var err = {error: "Request misformed"};
		res.send(JSON.stringify(err));
	}

	db.insertApplicationLog(params.clientId,"log",params.log);
	var response = {status:"OK"};
	res.send(JSON.stringify(response));
});

var setFile = {
	clientId: "",
	files: []
};

app.post("/file", function(req, res){

	var log = new Log(clientId,"File request");
	var params = req.body;
	if(!validateRequest(params,setFile)){
		var err = {error: "Request misformed"};
		res.send(JSON.stringify(err));
	}
	var clientId = params.clientId;
	var files= params.files;

	files.map(function(file){
		log.debug(createFileRepresentation(file));
	});

	log.print();
	FileOrganizer.store(files,clientId);

	var response = {status:"OK"};
	res.send(JSON.stringify(response));
});

function createFileRepresentation(file){
	var out = "";
	out += " { name: "+file.name;
	out += " ,path: "+file.path;
	out += " ,type: "+file.type;
	out += " ,typeOfChange: "+file.typeOfChange;
	if(file.fileContents !== undefined){
		out += "   ,fileContents: "+file.fileContents.substring(0,50).replace(/\n/g, " ")+'..';
	}
	out += "   }";

	return out;
}

var MetaDataRequest = {
	filename: "",
	clientId: ""
};

app.get("/fileMetadata", function(req, res){
	var params = req.body;

	if(!validateRequest(params,MetaDataRequest)){
		var err = {error: "Request misformed"};
		res.send(JSON.stringify(err));
	}

	var metadataBroker = new MetadataBroker();
	metadataBroker.getMetadata(params.filename,params.clientId).then(function(response){
		res.send(response);
	},function(error){
		var err = {error: error};
		res.send(JSON.stringify(err));
	});


});


app.listen(PORT, function(){
	console.log("LAStore server listening on port "+PORT);
});
