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
var Promise = require("es6-promise").Promise;
var db = new neo4j.GraphDatabase("http://192.168.59.103:7474");


/**
 *
 *
 * States without contex are meant as workspace states, or commits in a git context
 */
var DBNeo4jAdapter = function(){


	function addStates(clientId,states){
		return new Promise(function(resolve, reject){

			_createUserIfNotExist(clientId).then(function(){

				var index = 0;
				var onError = function(error){
					console.log("Error adding states: ",error);
					iterator();
				}

				var iterator = function(){
					if(index<states.length){
						addState(clientId,states[index++]).then(iterator,onError);
					}else{
						resolve();
					}

				};
				iterator();
			},function(error){
				console.log("Could not create user: "+error)
			})
		});
	}

	function addState(clientId, state,callback){
		return new Promise(function(resolve, reject){
			console.log("ADding state");

			var query = new CypherMergeQuery();
			var userRef = query.addNode("User",{clientId: clientId});

			var repoStateParams = {
				commitSha: state.commitSha,
				commitMsg: state.commitMsg,
				time: state.time

			};
			var queryParams = {
				clientId:clientId, 
				commitSha: state.commitSha,
				commitMsg: state.commitMsg,
				time: state.time
			}
			var query2 = "MERGE (u:User {clientId:{clientId}}) -[:HAS_REPO]-> (r:Repo) ";
			query2 += "MERGE (r) -[:HAS_REPO_STATE]-> (rs:RepoState {commitSha:{commitSha},commitMsg:{commitMsg},time:{time}})"

			state.files.forEach(function(file, index){

				var fileId = "f"+index;
				var stateId = "fs"+index;	
				queryParams[fileId+"name"] = file.name;
				queryParams[fileId+"contentName"] = file.contentName;
				queryParams[fileId+"packageName"] = file.packageName;
				queryParams[fileId+"type"] = file.type;

				queryParams[stateId+"numberOfMarkers"] =  file.numberOfMarkers;
				queryParams[stateId+"numberOfLines"] =  file.numberOfLines;
				queryParams[stateId+"numberOfFailedTests"] =  file.numberOfFailedTests
				queryParams[stateId+"time"] = state.time; 

				query2 += " MERGE (r)-[:HAS_FILE]-> ("+fileId+":File {name:{"+fileId+"name},contentName:{"+fileId+"contentName},packageName:{"+fileId+"packageName},type:{"+fileId+"type}})";

				query2 += " MERGE ("+fileId+")-[:HAS_FILE_STATE]-> ("+stateId+":FileState {numberOfMarkers:{"+stateId+"numberOfMarkers},numberOfLines:{"+stateId+"numberOfLines},numberOfFailedTests:{"+stateId+"numberOfFailedTests},time:{"+stateId+"time}})"
				query2 += " MERGE (rs)-[:HAS_FILE_STATE]-> ("+stateId+")"
			});

			var queryObj = query.getQuery();
			console.log(query2);

			db.cypher({query: query2, params: queryParams},function(error,result){
				console.log("Query performed",error,result);
				if(error !== null){
					reject(error);

				}else{
					resolve(result);
				}
			});

			// Not needed, just used for testing atm to validate queries
			//return queryObj.query;
		})
	}

	function _createUserIfNotExist(clientId){
		return new Promise(function(resolve, reject){
		
		
		var query = "MATCH (u:User {clientId:{clientId}}) -[:HAS_REPO]-> (r:Repo) RETURN u,r";
		db.cypher({query: query, params:{clientId:clientId}},function(error,result){

			if(error !== null){
				reject(error);
					console.log("User error",error);
				return;
			}
			if(result.length<1){
				_createUser(clientId).then(function(){
					resolve();
				},function(error){reject(error)});
			}else{
				resolve();
				console.log("User exists");
			}
		})
		})
	}

	function _createUser(clientId){
		return new Promise(function(resolve, reject){
			var query = "CREATE (u:User {clientId:{clientId}}) CREATE (r:Repo) CREATE (u)-[:HAS_REPO]->(r)";

			db.cypher({query: query, params:{clientId:clientId}},function(error,result){

			if(error !== null){
				reject(error);
				return;
			}
			resolve();
		})
		})
		
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

	function getRepoStateList(clientId){
		return new Promise(function(resolve, reject){
			var params = {clientId: clientId};
			var query = "MATCH (:User {clientId:{clientId}}) -[:HAS_REPO]-> (:Repo) -[:HAS_REPO_STATE]->(s:RepoState) RETURN s";

			db.cypher({query: query, params: params},function(error,result){
				if(error !== null){
					reject(error);
				}else{

					resolve(_convertRepoStates(result));
				}
			});
		})
	}

	function _convertRepoStates(repoStates){
		return repoStates.map(function(state){
			return state.s.properties;
		})
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
		getRepoStateList:getRepoStateList,
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
