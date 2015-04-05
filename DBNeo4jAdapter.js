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
				var timeOfLastUpdate = 0;

				timer.start();

				var queries = states.map(function(state){
					// Store timestamp of last processed state
					if(timeOfLastUpdate<state.time){
						timeOfLastUpdate = state.time;
					}

					// States with 0 files, contains no interesting state information
					if(state.files.length === 0){return;}

					return generateQueryForState(clientId,state);
				});

				// Since we skip states with empty files, they show up as undefined in the array
				queries = queries.filter(function(query){return query !== undefined;})

				//Update time of last update
			
				var timeQuery = "MATCH (u:User {clientId:{clientId}}) -[:HAS_REPO]-> (r:Repo) SET r.timeOfLastUpdate = {timeOfLastUpdate}";
				var params = {
					timeOfLastUpdate: timeOfLastUpdate,
					clientId:clientId
				};

				queries.push({query:timeQuery,params:params,lean:true});

				debugger;
				db.cypher(queries, function(error,result){
					debugger;
					if(error !== null){
						reject(error);
					}else{
						timer.stop();
						console.log("DB insertion: "+timer.getTotal());
						resolve();
					}

				});

			},function(error){
				console.log("Could not create user: "+error)
			})
		});
	}

	function generateQueryForState(clientId, state,callback){
			//console.log("ADding state");

			var repoStateParams = {
				commitSha: state.commitSha,
				commitMsg: state.commitMsg,
				time: state.time

			};
			var queryParams = {
				clientId: clientId,
				commitSha: state.commitSha,
				commitMsg: state.commitMsg,
				time: state.time
			};

			var query2 = "MERGE (u:User {clientId:{clientId}}) -[:HAS_REPO]-> (r:Repo) ";

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
				//query2 += " MERGE (rs)-[:HAS_FILE_STATE]-> ("+stateId+")"

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

			//query2 += " SET r.timeOfLastUpdate = {timeOfLastUpdate}";
			//queryParams['timeOfLastUpdate'] = state.time;

			return{query:query2,params:queryParams,lean:true}

			// Not needed, just used for testing atm to validate queries
			//return queryObj.query;
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
			var query = "CREATE (u:User {clientId:{clientId}}) CREATE (r:Repo {timeOfLastUpdate:{timeOfLastUpdate}}) CREATE (u)-[:HAS_REPO]->(r)";
			var params = {clientId:clientId,timeOfLastUpdate:0};

			db.cypher({query: query, params:params},function(error,result){

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

	function getTimeOfLastUpdate(clientId){
		return new Promise(function(resolve, reject){
			var params = {clientId: clientId};
			var query = "MATCH (:User {clientId:{clientId}}) -[:HAS_REPO]-> (repo:Repo) return repo";

			db.cypher({query: query, params: params},function(error,result){
				if(error !== null){
					reject(error);
				}else{

					var timeOfLastUpdate;
					if(result.length === 0){
						//TODO: Fix this, an exception whould be fired
						timeOfLastUpdate = 0;
					}else{

						timeOfLastUpdate = result[0].repo.properties.timeOfLastUpdate;
					}
					resolve(timeOfLastUpdate);
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
			var query = "Match (u:User {clientId:{clientId}})-[:HAS_REPO]->(r:Repo)-[:HAS_FILE]-> (file:File) -[:HAS_FILE_STATE]->(fileState:FileState) OPTIONAL MATCH (file) -[:IS_IN_CATEGORY]-(category:Category) return file,category,collect(fileState) as fileStates";

			db.cypher({query: query, params: params},function(error,result){
				if(error !== null){
					reject(error);
					return;
				}

				_convertRepoStates(result).then(function(result){
					resolve(result);
				},function(error){reject(error);});

			});
		});
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

			try{

			var files = dbOutPut.map(function(node){
				// Copy properties to new file structure
				//
				var fileStates = node.fileStates.map(function(fileState){
					return _.assign({},fileState.properties);
				});
				var category = null;

				if(node.category !== undefined && node.category !== null){
					category = _.assign({}, node.category.properties);
				}

				var file = { states: fileStates, category: category};
				file = _.assign(file,node.file.properties);

				return file;
			});

			resolve(files);

			}catch(e){
				reject(e);
			}
		});
	}

	var __forTesting ={
		get db () {return db;},
		set db (url) {
			db = new neo4j.GraphDatabase(url);
		},
	};

	return {
		addStates: addStates,
		getFileStates: getFileStates,
		getRepoStates: getRepoStates,
		getTimeOfLastUpdate:getTimeOfLastUpdate,
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
