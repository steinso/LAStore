"use strict";

//Load environment variables from .env file
require('dotenv').load();

var express = require("express");
var bodyParser = require("body-parser");
var morgan = require("morgan");
var Promise = require("es6-promise");
var app = express();
var MetadataBroker = require("./MetadataBroker.js");
var Client = require('./Client.js')();

var DatabaseHandler = require('./DatabaseHandler.js');
var FileOrganizer= require('./FileOrganizer.js');
FileOrganizer = FileOrganizer();
var db = new DatabaseHandler('dbFile.db');
var Log = require("./Logger.js");
var argv = require('minimist')(process.argv.slice(2));
var GitBroker = require("./GitBroker.js");
var AnalysisDb = require("./DBNeo4jAdapter.js");
var ClientStateAnalyzer = require("./ClientStateAnalyzer.js");
var _ = require("lodash");
var request = require("request");
var Timer = require("./Timer.js");
var type = require("typed");

var PORT = argv.p || argv.port || process.env.PORT;
var REPO_PATH = process.env.REPO_PATH;
var analysisDb = new AnalysisDb(process.env.DB_URL);

app.use(bodyParser.json({limit: "1mb"}));
app.use(morgan(":date[iso] ms: :response-time status: :status :method :url  "));


app.use(function(req, res, next){
	try{
		var typeName = "";
		var reqObj = {};
		var url = req.url.split("?")[0] || req.url;

		switch(req.method){
			case "GET":
				typeName = "/api/get" + url;
				reqObj = req.query;
			break;

			case "POST":
				typeName = "/api/post" + url;
				reqObj = req.body;
			break;

			default:
				console.log("Non-recognisable request method: ", req.method);
				next();
				return;
		}

		if(type.exists(typeName)){
			type.check(typeName, reqObj);

		}else{
			console.log("REQ VALIDATION IGNORED: No type specification for /api/get" + req.url);
		}

		next();
	}catch(e){
		console.log("Request mismatch: ",typeName,reqObj);
		res.status(420).send();
	}
});

app.post("/client",function(req,res){
	var clientId = Client.create();
	var log = new Log("Create client "+clientId);
	log.print();
	res.send(clientId);
});

app.post("/client/name",function(req,res){
	var name = req.body.name;
	var clientId = req.body.clientId;
	var log = new Log(clientId,"SetName request: "+name);

	Client.setName(clientId,name).then(function(name){

		var reply = {'status': 'OK', 'name': name};
		res.send(JSON.stringify(reply));
		log.print();

	},function(error){

		var reply = {'status': 'OK', 'error': error};
		res.send(JSON.stringify(reply));
		log.print();
	})

});

type.add("/api/post/client/participating",{
	clientId: "String",
	participating: "Any"
});

app.post("/client/participating",function(req,res){
	var params = req.body;
	var clientId = params.clientId;
	var value = params.participating;
	var log = new Log(clientId,"Participating: "+value);

	Client.setParticipating(clientId,value).then(function(){
		log.debug("Paricipating set to: "+value);
		var response = {status: "OK"};
		res.send(JSON.stringify(response));
		log.print();
	},function(error){
		var response = {status: "OK",error:error};
		log.error("Participating not set: "+error);
		res.send(JSON.stringify(response));
		log.print();
	});
});

app.get("/client/participating",function(req,res){

});
/*
type.add("/api/get/client",{
	name: "String",
	age: "String"
});
*/

app.get("/client/:nickname",function(req,res){

	var nickname = req.params.nickname;
	var log = new Log("Unknown","Getting id for nick: "+nickname);
	var allowedNamePattern = /^[A-z0-9_]+$/;
	var validName = (nickname.match(allowedNamePattern) !== null && nickname.match(allowedNamePattern).length > 0);

	if(!validName){
		var err = {error: "Invalid name"};
		res.send(JSON.stringify(err));
		log.error("Invalid name");
		log.print();
		return;
	}

	db.getIdFromClientName(nickname).then(function(clientId){
		var response = {id: clientId};
		res.send(JSON.stringify(response));
		log.debug("Id found: "+clientId);
		log.print()

	},function(error){
		var err = {error: error};
		res.send(JSON.stringify(err));
		log.error(error);
		log.print()
	});
});



app.get("/client", function(req, res){

	analysisDb.getClientList().then(function(clientList){
		res.send(clientList);
	},function(error){
		res.send("ERROR: " + error);
	});
});

//type.add("/api/get/category/clients",{
	//name: "String",
	//type: "String"
//});

//app.get("/category/clients", function(req, res){

	//analysisDb.getClientList().then(function(clientList){
		//res.send(clientList);
	//},function(error){
		//res.send("ERROR: " + error);
	//});
/*});*/

app.post("/notify/repo/:clientId",function(req,res){
	var clientId = req.params.clientId;
	//Diff list of commits in GIT to lists of commits in DB
	console.log("Notification received for:"+clientId);
	var repoPath = REPO_PATH+clientId;
	var timer = Timer.create("notify");
	timer.start();

	analysisDb.getTimeOfLastUpdate(clientId).then(function(timeOfLastUpdate){

		timer.stop();
		console.log("Got time of last update in: ",timer.getLast());
		timer.start();

		GitBroker.getCommitsAfterTime(repoPath,timeOfLastUpdate).then(function(relevantCommits){
			timer.stop();
			console.log("Got commit list in: ",timer.getLast());
			timer.start();

			//Filter on times
			if(relevantCommits.length<1){
				var response = {status: "OK"};
				console.log("Total time spent: ", timer.getTotal());
				res.send(JSON.stringify(response));
				return;
			}
			var body = {commits:relevantCommits};
			request({url:"http://localhost:50811/process",method:"POST",body:body,json:true},function(error,response,body){
				var analyticCommits = body.states;
				var tests = body.tests;

				timer.stop();
				console.log("States processed in: ",timer.getLast());
				timer.start();
				analysisDb.addStates(clientId,analyticCommits).then(function(result){
					analysisDb.addTests(clientId,tests).then(function(result){

					timer.stop();
					console.log("Inserted states to Neo in: ",timer.getLast());
					timer.start();
					console.log("Total time spent: ", timer.getTotal());
					var response = {status: "OK", error: error};
					res.send(JSON.stringify(response));

				},function(error){
					var response = {status: "OK",error: error};
					console.log("ERROR getting states from db",error);
					res.send(JSON.stringify(response));
				});
			},function(error){
					var response = {status: "OK",error: error};
					console.log("ERROR getting states from db",error);
					res.send(JSON.stringify(response));
			});

		//	res.send(JSON.stringify(body));
			});
			
		},function(error){
			var response = {status:"OK",error:error};
			console.log("ERROR getting state list from db",error);
			res.send(JSON.stringify(response));
		},function(error){
			
			var response = {status:"OK",error:error};
			console.log("ERROR getting state list from db",error);
			res.send(JSON.stringify(response));
		},function(error){
			var response = {status:"OK",error:error};
			console.log("ERROR getting commit list from repo",error);
			res.send(JSON.stringify(response));
		});
	},function(error){
		var response = {status:"OK",error:error};
		console.log("ERROR getting commit list from repo",error);
		res.send(JSON.stringify(response));
	});
	// Then add difference to DB


});


type.add("/api/post/errorLog",{
	clientId: "String",
	log: "String"
});

app.post("/errorLog",function(req,res){
	var params = req.body;

	db.insertApplicationLog(params.clientId,"error",params.log);
	var response = {status:"OK"};
	res.send(JSON.stringify(response));
});

type.add("/api/post/eventLog", {
	clientId: "String",
	log: "String"
});

app.post("/eventLog",function(req,res){
	var params = req.body;

	db.insertApplicationLog(params.clientId,"log",params.log);
	var response = {status:"OK"};
	res.send(JSON.stringify(response));
});

var notifyQueue = [];
function runNotifyQueue(){



};

type.add("/api/post/file", {
	clientId: "String",
	files: "Array<Any>"
});

app.post("/file", function(req, res){

	var log = new Log(clientId,"File request");
	var params = req.body;

	var clientId = params.clientId;
	var files= params.files;

	files.map(function(file){
		log.debug(createFileRepresentation(file));
	});

	log.print();
	FileOrganizer.store(files,clientId);

	if(notifyQueue.indexOf(clientId) === -1){
		notifyQueue.push(clientId);

		setTimeout(function(){
			notifyQueue.splice(notifyQueue.indexOf(clientId),1);
			request({url:"http://localhost:"+PORT+"/notify/repo/"+clientId,body:{},json:true,method:"POST"},function(error,body,response){
				console.log("DB Notification sent for client: ",clientId)
			});
		},2000);
	}
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

type.add("/api/post/fileMetadata", {
	filename: "String",
	clientId: "String"
});

app.get("/fileMetadata", function(req, res){
	var params = req.body;
	var metadataBroker = new MetadataBroker(process.env.DB_URL);
	metadataBroker.getMetadata(params.filename,params.clientId).then(function(response){
		res.send(response);
	},function(error){
		var err = {error: error};
		res.send(JSON.stringify(err));
	});
});

app.get("/repoStates/:clientId", function(req, res){
	var clientId = req.params.clientId;
	analysisDb.getRepoStates(clientId).then(function(client){
		client = ClientStateAnalyzer.process(client);

		res.send(client);

	},function(error){
		console.log("ERROR: Could not get repoStates: "+error);
	});
});

app.get("/markertypes/", function(req, res){
	analysisDb.getMarkerTypes().then(function(markers){
		res.send(markers);
	},function(error){
		console.log("ERROR: Could not get markerTypes: "+error);
	});
});

app.get("/markertypes/category/", function(req, res){

	analysisDb.getMarkerTypesByCategory().then(function(markers){
		res.send(markers);
	},function(error){
		console.log("ERROR: Could not get catmarkerTypes: "+error);
	});
});


type.add("/api/get/category/client", {
	name: "String",
	type: "String"
});

app.get("/category/client", function(req, res){
	var categoryType = req.query.type;
	var categoryName = req.query.name;

	analysisDb.getAllClientsInCategory(categoryName, categoryType).then(function(clientList){

		// Process each client
		clientList.map(function(client){
			return ClientStateAnalyzer.process(client);
		});

		res.send(clientList);
	},function(error){
		console.log("ERROR: Could not get clients in category: "+error);
		res.status(200).send();
	});
});


app.get("/category", function(req, res){

	analysisDb.getCategoryList().then(function(categories){
		res.send(categories);
	},function(error){
		console.log("ERROR: Could not get categories: "+error);
		res.status(200).send();
	});
});

type.add("/api/get/file",{
	clientId: "String",
	path: "String"
});

app.get("/file", function(req, res){
	GitBroker.getFile(REPO_PATH+req.query.clientId, req.query.path).then(function(commits){

		if(commits.length<1){ res.send({error:"No commits in file"});return; }

		var fileStates = commits.map(function(commit){
			return {
				sha: commit.sha,
				msg: commit.msg,
				time: commit.time,
				//fileDiff: commit.fileDiff,
				fileContents: commit.files[0].fileContents
			};
		});

		fileStates = _.sortBy(fileStates, 'time');
		var lastContents = fileStates[fileStates.length-1].fileContents;
		var classMatch = lastContents.match(/\s*public (?:class|interface) (\w+)/);
		var contentName = classMatch[1] || "Unkown";

		var file = {
			path: req.query.path,
			contentName: contentName,
			clientId: req.query.clientId,
			states: fileStates
		};

		res.send(file);
	}).catch(function(error){
		res.status(502).send({status:"error",msg:"Could not get file;"})
	});
});

app.listen(PORT, function(){
	console.log("LAStore server listening on port "+PORT);
});
