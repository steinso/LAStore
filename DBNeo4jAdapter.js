"use strict";
/**
 *
 *  DB "Schema"
 *  User -> Repo -> File -> FileStates -> Marker
 *  FileState -> Category
 *  Repo -> RepoState -> FileState
 *
 * Marker: {Type:"error",}
 */
var neo4j= require("neo4j");
var CypherMergeQuery = require("./CypherMergeQuery.js");

var db = new neo4j.GraphDatabase("http://localhost:7474");

var DBNeo4jAdapter = function(){

	function addStates(userId,states,callBack){
		var index = 0;
		var iterator = function(error,result){
			console.log("err: ",error," res:",result);
			if(index<states.length){
				console.log(addState(userId,states[index++],iterator));
			}else{
				callBack();
			}

		};
		iterator(null,null);
	}

	function addState(userId, state,callback){
		var query = new CypherMergeQuery();
		var userRef = query.addNode("User",{clientId: "stein"});

		var repoParams = {
			commitSha: state.commitSha,
			commitMsg: state.commitMsg,
			time: state.time
		};

		var stateRef = query.addNode("RepoState",repoParams);
		var repoRef = query.addNode("Repo",{});

		query.addRelation(userRef,"HAS_REPO",repoRef);
		query.addRelation(repoRef,"HAS_REPO_STATE",stateRef);

		state.files.forEach(function(file){

			var fileParams = {name: file.name};
			var fileStateParams = {
				numberOfMarkers: file.numberOfMarkers,
				numberOfLines: file.numberOfLines,
				numberOfFailedTests: file.numberOfFailedTests
			};

			var fileRef = query.addNode("File", fileParams);
			var fileStateRef = query.addNode("FileState",fileStateParams);

			query.addRelation(stateRef,"HAS_FILE",fileRef);
			query.addRelation(stateRef,"HAS_FILE_STATE",fileStateRef);
			query.addRelation(fileRef,"HAS_FILE_STATE",fileStateRef);
		});

		var queryObj = query.getQuery();

		db.cypher({query: queryObj.query, params: queryObj.params},function(error,result){
			callback(error,result);
		});
		// Not needed, just used for testing atm to validate queries
		return queryObj.query;
	}


	function getFileStates(clientId,filepath){
		return new Promise(function(resolve,reject){

			var params = {clientId: clientId};
			var query = "MATCH (:User {clientId:{clientId}}) -[:HAS_REPO]-> (:Repo) -[:HAS_File]->(:File {path:filepath})-[:HAS_FILE_STATE]->(s:FileState)-[:HAS_FILE_STATE]-(r:RepoState) RETURN s, r.time";

			db.cypher({query: query, params: params},function(error,result){
				if(error !== null){
					reject(error);
				}else{
					resolve(result);
				}
			});
		});
	}

	function getFiles(user){

	}

	// TODO: Not sure how tests should fit in the graph
	// 		Category should not depend on "test" as it is too general
	function addCategory(name,tests){
		var params = {categoryName: name};
		var query = "MATCH (c:Category {name:{categoryName}})";
		tests.forEach(function(test,index){
			var id = "t"+index;
			var part = ", ("+id+":Test {name: {"+id+"Name})";
			query+= part;
			params[id+"Name"] = test.name;
		});


		tests.forEach(function(test,index){
			var id = "t"+index;
			query += " MERGE (c) -[:HAS_TEST]-> ("+id+")";
		});

		return query;
	}

	var __forTesting ={
		get db () {return db;},
		set db (url) {
			db = new neo4j.GraphDatabase(url);
		},
	};

	return {
		addState: addState,
		addStates: addStates,
		getFileStates: getFileStates,
		addCategory: addCategory,
		__forTesting:__forTesting
	};
};


//var c = ad.addCategory("Oving1",[{name:"test1"},{name:"test2"}]);
/*
var request = require("request");

function requestRepoStates(repo,callBack){

	request("http://192.168.1.158:50809/timeLapse/"+repo, function (error, response, body) {
		if (!error && response.statusCode === 200) {
			var info = JSON.parse(body);
			console.log(ad.addStates("stein",info,callBack));
		}
	});
}
*/

module.exports = DBNeo4jAdapter;
