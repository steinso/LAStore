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


	function addStates(userId,states){
		return new Promise(function(resolve, reject){

			var index = 0;
			var onError = function(error){
				console.log("Error adding states: ",error);
				iterator();
			}

			var iterator = function(){
				if(index<states.length){
					addState(userId,states[index++]).then(iterator,onError);
				}else{
					resolve();
				}

			};
			iterator();
		})
	}

	function addState(userId, state,callback){
		return new Promise(function(resolve, reject){
			console.log("ADding state");

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

				query.addRelation(repoRef,"HAS_FILE",fileRef);
				query.addRelation(stateRef,"HAS_FILE_STATE",fileStateRef);
				query.addRelation(fileRef,"HAS_FILE_STATE",fileStateRef);
			});

			var queryObj = query.getQuery();
			console.log(queryObj.query);

			db.cypher({query: queryObj.query, params: queryObj.params},function(error,result){
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
