"use strict";

var express = require("express");
var bodyParser = require("body-parser");
var Promise = require("es6-promise");
var app = express();
var MetadataBroker = require("./MetadataBroker.js");
var validateRequest = require("./RequestValidator.js").validateRequest;
var Client = require('./Client.js')();

var DatabaseHandler = require('./DatabaseHandler.js');
var FileOrganizer= require('./FileOrganizer.js');
FileOrganizer = FileOrganizer();
var db = new DatabaseHandler('dbFile.db');
var Log = require("./Logger.js");
var argv = require('minimist')(process.argv.slice(2));
var fs = require("fs");
var GitBroker = require("./GitBroker.js");
var AnalysisDb = require("./DBNeo4jAdapter.js");
var _ = require("lodash");
var request = require("request");
var Timer = require("./Timer.js");

var PORT = argv.p || argv.port || "50812";

app.use(bodyParser.json({limit:"1mb"}));

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

})

app.get("/client/:nickname",function(req,res){


	var nickname = req.params.nickname;
	var log = new Log("Unknown","Getting id for nick: "+nickname);
	var allowedNamePattern = /^[A-z0-9_]+$/;
	var validName = (nickname.match(allowedNamePattern) !== null && nickname.match(allowedNamePattern).length > 0);

	if(!validName){
		var err = {error: "Invalid name"};
		res.send(JSON.stringify(err));
		log.error("Invalid name");
		log.print()
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

	var path = "/srv/LAHelper/logs/";
	var clientList = [];
	fs.readdir(path, function(err, files){

		if(err){
			res.send("ERROR: " + err);
		}

		if(files !== null && files.length > 0){
			clientList = files.filter(function(file){
				return fs.statSync(path + file).isDirectory();
			});
		}

		res.send(clientList);
	});
});

app.post("/notify/repo/:clientId",function(req,res){
	var clientId = req.params.clientId;
	//Diff list of commits in GIT to lists of commits in DB
	console.log("Notification received for:"+clientId)
	var repoPath = "/srv/LAHelper/logs/"+clientId;
	var timer = Timer.create("notify");
	timer.start();
	GitBroker.getCommitListFromRepo(repoPath).then(function(commitList){

		var analysisDb = new AnalysisDb();
		analysisDb.getRepoStateList(clientId).then(function(stateList){
			
			stateList = stateList.map(function(state){return state.commitSha});
			var difference = _.difference(commitList,stateList);
			console.log(difference);

			if(difference.length<1){
				var response = {status:"OK"}
				res.send(JSON.stringify(response));
				return;
			}
			GitBroker.getCommitsFromRepo(repoPath,difference).then(function(commits){
				var body = {commits:commits};
				request({url:"http://localhost:50811/process",method:"POST",body:body,json:true},function(error,response,body){
					var analyticCommits = body;

					analysisDb.addStates(clientId,analyticCommits).then(function(result){

						timer.stop();
						console.log("Time spent: ", timer.getLast());
					});

					res.send(JSON.stringify(body));
				});
				var t = [];
			},function(error){
				console.log(error);
			});

			//res.send("OK");

		},function(error){
			var response = {status:"OK",error:error};
			res.send(JSON.stringify(response));
			console.log("ERROR getting state list from db",error);
		},function(error){
			
			var response = {status:"OK",error:error};
			res.send(JSON.stringify(response));
			console.log("ERROR getting state list from db",error);
		});
	},function(error){
		var response = {status:"OK",error:error};
		res.send(JSON.stringify(response));
		console.log("ERROR getting commit list from repo",error);
	});
	// Then add difference to DB


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
	var response = {status:"OK"};
	res.send(JSON.stringify(response));
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
	setTimeout(function(){
		console.log("Sending notify update");
		request({url:"http://localhost:"+PORT+"/notify/repo/"+clientId,body:{},json:true,method:"POST"},function(error,body,response){
			console.log("DB Notification sent")

		})
	},2000);

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
