var DBNeo4jAdapter = require("./DBNeo4jAdapter.js");
var db = new DBNeo4jAdapter();

var MetadataBroker = function(){

	function getMetadata(filepath,clientId){
		return new Promise(function(resolve,reject){

			db.getFileStates(clientId, filepath).then(function(states){
				resolve(states);
			},function(error){
				reject(error);
			});
		});
	}

	return {
		getMetadata:getMetadata
	};

};

module.exports = MetadataBroker;
