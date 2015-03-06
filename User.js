var fs = require('fs');
var crypto = require('crypto');
var FileOrganizer = require('./FileOrganizer.js')();
var User = function(){
	
	var create = function(){
		var clientId = _generateRandomClientId();
		FileOrganizer.createFileStorage(clientId);
		return clientId;
	};

	var _generateRandomClientId = function(){
		var hash = crypto.createHash('sha1'); 
		hash.update(Date.now()+" "+Math.random()*1000);
		var clientId = hash.digest('hex');
		return clientId;
	};


	return{
		create:create
	};
};




module.exports = User;
