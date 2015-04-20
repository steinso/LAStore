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

	function addTests(clientId, tests){
		return new Promise(function(resolve, reject){

			var timer = Timer.create("AddDBTests");
			timer.start();

			var queries = tests.map(function(test){
				var params = {
					clientId: clientId,
					contentName: test.contentName,
					packageName: test.packageName,
					type: "class", // A test is always for a class
					time: test.time,
					methodName: test.methodName,
					result: test.result
				};

				var query = "MATCH (u:User {clientId:{clientId}})-[r1:HAS_REPO]-(r:Repo)-[r2:HAS_FILE]-(f:File {contentName: {contentName}, packageName: {packageName}, type:{type}})-[r3:HAS_FILE_STATE]-(fs:FileState) ";
				query += " WHERE fs.time < {time} AND f.type = 'class' ";
				query += " WITH fs ORDER BY fs.time DESC LIMIT 1 ";
				query += " MERGE (fs)-[:HAS_TEST]->(t:Test {time:{time},className:{contentName},packageNa:{packageName},methodName:{methodName},result:{result} })";

				return {query: query, params: params, lean: true};
			});

			db.cypher(queries, function(error,result){
					if(error !== null){
						reject(error);
					}else{
						timer.stop();
						console.log("DB test insertion: "+timer.getTotal());
						resolve();
					}

				});
		});
	}

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

				db.cypher(queries, function(error,result){
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
					numberOfMarkers: file.numberOfMarkers,
					numberOfLines: file.numberOfLines,
					numberOfFailedTests: file.numberOfFailedTests,
					time: state.time
				};

				query2 += " MERGE (r)-[:HAS_FILE]-> ("+fileId+":File {"+_generateQueryParams(fileId,fileParams,queryParams)+"})";
				query2 += " MERGE ("+fileId+")-[:HAS_FILE_STATE]-> ("+stateId+":FileState {"+_generateQueryParams(stateId,stateParams,queryParams)+"})"
				//query2 += " MERGE (rs)-[:HAS_FILE_STATE]-> ("+stateId+")"

				//Add category relations
				file.categories.forEach(function(category, index){
					var catId = fileId + "c" + index;
					var categoryParams = {
						name: category.name,
						type: category.type
					};

					query2 += " MERGE ("+catId+":Category {"+_generateQueryParams(catId,categoryParams,queryParams)+"}) MERGE ("+fileId+")-[:IS_IN_CATEGORY]->("+catId+")";
				});

				//Add marker relations
				file.markers.forEach(function(marker, index){
					var markerId = stateId + "m"+index;
					var markerParams = {
						category: marker.categoryId || -1,
						categoryName: marker.categoryName || "undefined",
						lineNumber: marker.lineNumber || -1,
						priority: marker.priority || -1,
						message: marker.message || "",
						charStart: marker.charStart || 1
					};

					var catId = stateId+"mc"+index;
					var categoryParams = {
						categoryName: marker.categoryName || "undefined",
						category:marker.categoryId || -1
					}

					query2 += " MERGE ("+stateId+") -[:HAS_MARKER]-> ("+markerId+":Marker {"+_generateQueryParams(markerId,markerParams,queryParams)+"})";
					query2 += " MERGE ("+catId+":MarkerType {"+_generateQueryParams(catId,categoryParams,queryParams)+"})";
					query2 += " MERGE ("+markerId+") -[:IS_OF_TYPE]-> ("+catId+")";
				});

			});

			//query2 += " SET r.timeOfLastUpdate = {timeOfLastUpdate}";
			//queryParams['timeOfLastUpdate'] = state.time;

			return{query: query2,params: queryParams,lean: true}

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
			var query = "Match (u:User {clientId:{clientId}})-[:HAS_REPO]->(r:Repo)-[:HAS_FILE]-> (file:File) -[:HAS_FILE_STATE]->(fileState:FileState) OPTIONAL MATCH (file) -[:IS_IN_CATEGORY]-(category:Category) OPTIONAL MATCH (fileState)-[:HAS_TEST]->(test:Test) return file,category,collect(fileState) as fileStates,collect(test) as tests";

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

	function getMarkerTypes(){
		return new Promise(function(resolve, reject){

			var query = "Match (markerType:MarkerType)<-[r:IS_OF_TYPE]-(m:Marker) return markerType, count(r) as occurences, collect(m.message) as messages ORDER BY occurences DESC";

			db.cypher({query: query}, function(error, result){
				if(error !== null){
					reject(error);
					return;
				}

				var markerTypes = result.map(function(row){

					// give count of most common messages
					var messages = {};
					row.messages.forEach(function(msg){
						if(messages[msg] === undefined){
							messages[msg] = 0;
						}
						messages[msg]++;
					});

					var markerType = {
						category: row.markerType.properties.category,
						occurences: row.occurences,
						messages: messages
					};

					return markerType;
				});

				resolve(markerTypes);
			});
		});
	}


	function getMarkerTypesByCategory(){
		return new Promise(function(resolve, reject){

			var query = "Match (c:Category)<-[:IS_IN_CATEGORY]-(f:File)-[:HAS_FILE_STATE]->(fs:FileState)-[rm:HAS_MARKER]->(m:Marker)-[:IS_OF_TYPE]->(mt:MarkerType) return c as category,mt as markertype,count(rm) as occurences, collect(m.message) as messages ORDER BY category.name, occurences DESC";

			db.cypher({query: query}, function(error, result){
				if(error !== null){
					reject(error);
					return;
				}

				var markersByCategory = {};
				result.forEach(function(row){
					var categoryName = row.category.properties.name;
					if(markersByCategory[categoryName] === undefined){
						markersByCategory[categoryName] = [];
					}
					var category = markersByCategory[categoryName];


					// give count of most common messages
					var messages = {};
					row.messages.forEach(function(msg){
						if(messages[msg] === undefined){
							messages[msg] = 0;
						}
						messages[msg]++;
					});

					//Add info
					var markerType = row.markertype.properties.category;

					category.push({
						category: markerType,
						messages: messages,
						occurences: row.occurences
					});
				});

				resolve(markersByCategory);
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

				var tests = node.tests.map(function(test){
					return _.assign({},test.properties);
				});
				var category = null;

				if(node.category !== undefined && node.category !== null){
					category = _.assign({}, node.category.properties);
				}

				var file = { states: fileStates, tests: tests, category: category};
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
		}
	};

	return {
		addStates: addStates,
		addTests: addTests,
		getFileStates: getFileStates,
		getRepoStates: getRepoStates,
		getMarkerTypes: getMarkerTypes,
		getMarkerTypesByCategory: getMarkerTypesByCategory,
		getTimeOfLastUpdate: getTimeOfLastUpdate,
		addCategory: addCategory,
		__forTesting: __forTesting
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
