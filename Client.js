var fs = require('fs');
var crypto = require('crypto');
var FileOrganizer = require('./FileOrganizer.js')();
var DatabaseHandler = require('./DatabaseHandler.js');
var db = new DatabaseHandler('dbFile.db');
var Promise = require("es6-promise").Promise;

var Client = function(){

	var allowedNamePattern = /^[A-z0-9_]+$/;

	var create = function(){
		var clientId = _generateRandomClientId();
		FileOrganizer.createFileStorage(clientId);
		db.insertClient(clientId);
		return clientId;
	};

	var setName = function(clientId,name){
		return new Promise(function(resolve, reject){

			var validName = (name.match(allowedNamePattern) !== null
							 && name.match(allowedNamePattern).length > 0);

							 function onSuccess (){ resolve(name); }
							 function onError (error){ reject(error); }

							 if(validName){
								 db.setClientName(clientId,name).then(onSuccess,onError);
							 }else{
								 //Set empty if name is illegal
								 db.setClientName(clientId,"").then(onSuccess,onError);
							 }
		})
	}

	var setParticipating = function(clientId,value){
		return new Promise(function(resolve, reject){
			var hasBeenSet = false;

			if(value === "false" || value === "true" || value === false || value === true)	{
				db.setClientParticipating(clientId,value).then(function(){
					resolve(value);
				},function(error){
					reject(error);
				});
			}else{
				reject("Participation value not recognised:"+value);
			}
		})
	}

	var _generateRandomClientId = function(){
		var hash = crypto.createHash('sha1'); 
		hash.update(Date.now()+" "+Math.random()*1000);
		var clientId = hash.digest('hex');
		return clientId;
	};


	return{
		create:create,
		setParticipating:setParticipating,
		setName:setName
	};
};




module.exports = Client;
