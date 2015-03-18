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
var db = new neo4j.GraphDatabase("http://localhost:7474");
var Timer = require("./Timer.js");
var _ = require("lodash");


/**
 *
 *
 * States without contex are meant as workspace states, or commits in a git context
 */
var DBNeo4jAdapter = function(){

	var neoTimer = Timer.create("NeoTimer");

	function addStates(clientId,states){
		return new Promise(function(resolve, reject){
			var timer = Timer.create("AddDBState");

			_createUserIfNotExist(clientId).then(function(){

				var index = 0;
				var onError = function(error){
					console.log("Error adding states: ",error);
					iterator();
				}

				var iterator = function(){
					timer.stop();
					if(index<states.length){
						timer.start();
						addState(clientId,states[index++]).then(iterator,onError);
					}else{
						console.log("AVG insertion time: ",timer.average()," Last:",timer.getLast()," Total: ",timer.getTotal());
						console.log("AVG Neo insertion time: ",neoTimer.average()," Last:",neoTimer.getLast(), "Total: ",neoTimer.getTotal());
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
			//console.log("ADding state");

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
				var fileParams = {
					name: file.name,
					contentName: file.contentName,
					packageName: file.packageName,
					type: file.type
				};

				var stateParams = {
					numberOfMarkers:  file.numberOfMarkers,
					numberOfLines:  file.numberOfLines,
					numberOfFailedTests:  file.numberOfFailedTests,
					time: state.time
				}

				query2 += " MERGE (r)-[:HAS_FILE]-> ("+fileId+":File {"+_generateQueryParams(fileId,fileParams,queryParams)+"})";
				query2 += " MERGE ("+fileId+")-[:HAS_FILE_STATE]-> ("+stateId+":FileState {"+_generateQueryParams(stateId,stateParams,queryParams)+"})"
				query2 += " MERGE (rs)-[:HAS_FILE_STATE]-> ("+stateId+")"

				//Add category relations
				file.categories.forEach(function(category,index){
					var catId = fileId + "c"+index; 
					var categoryParams = {
						name: category.name,
						type: category.type
					};

					query2 += " MERGE ("+catId+":Category {"+_generateQueryParams(catId,categoryParams,queryParams)+"}) MERGE ("+fileId+")-[:IS_IN_CATEGORY]->("+catId+")"
				});

			});

			var queryObj = query.getQuery();
			//console.log(query2);

			neoTimer.start();
			db.cypher({query: query2, params: queryParams},function(error,result){
				neoTimer.stop();
				//console.log("Query performed",error,result);
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

	function _generateQueryParams(id,params,collection){
		var queryParams = [];

		var keys = Object.keys(params);
		keys.forEach(function(param){
			collection[id+param] = params[param];
			queryParams.push(param+":{"+id+param+"}");
		})

		return queryParams.join(", ");

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

					resolve(_convertRepoStateList(result));
				}
			});
		})
	}

	function _convertRepoStateList(repoStates){
		return repoStates.map(function(state){
			return state.s.properties;
		})
	}

	function getRepoStates(clientId){
		return new Promise(function(resolve, reject){

			var params = {clientId: clientId};
			var query = "Match (u:User {clientId:{clientId}})-[:HAS_REPO]->(r:Repo)-[:HAS_REPO_STATE]-> (state:RepoState) -[:HAS_FILE_STATE]->(fileState:FileState)<-[:HAS_FILE_STATE]-(file:File) OPTIONAL MATCH (f) -[:IS_IN_CATEGORY]-(category:Category) return state,file,fileState,category";

			db.cypher({query: query, params: params},function(error,result){
				if(error !== null){
					reject(error);
					return;
				}

				_convertRepoStates(result).then(function(result){
					resolve(result);
				},function(error){reject(error);});

			});
		})
	}

	function _repoStatesConverter(){

		/**
		 * From: [Node] where Node contains (FileState,File,State,Category); "Row" from database
		 * To : [file] -> file:[states:[],name,etc,category], state{numberOfLines,numberOfMarkers,etc}
		 */
		var fileIndex  = {};
		var recordedFileStates = [];

		function addFileState(file,fileState,state,category){
			if(fileIndex[file._id] === undefined){
				var categoryObj = null;
				if(category !== undefined && category !== null){
					categoryObj = _.assign({},category.properties);
				}

				var fileObj= { states:[],category:categoryObj}
				_.assign(fileObj,file.properties);
				fileIndex[file._id] = fileObj;
			}

			if(recordedFileStates.indexOf(fileState._id)>=0){
				return;
			}


			var fileStateObj = {};
			_.assign(fileStateObj,fileState.properties);
			fileIndex[file._id].states.push(fileStateObj);
			recordedFileStates.push(fileState._id);
		}

		function getConvertedStructure(){
			var output = [];
			var fileIds = Object.keys(fileIndex);
			fileIds.forEach(function(id){
				output.push(fileIndex[id]);
			})

			return output;
		}
		return {addFileState:addFileState,getConvertedStructure:getConvertedStructure}
	}

	function _convertRepoStates(dbOutPut){
		return new Promise(function(resolve, reject){
			var states = [];
			var converter = new _repoStatesConverter(); 

			dbOutPut.forEach(function(node){

				converter.addFileState(node.file,node.fileState,node.state,node.category);
				
			})

			resolve(converter.getConvertedStructure());

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
		getRepoStates: getRepoStates,
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
