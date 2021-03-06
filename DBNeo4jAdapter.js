"use strict";
/**
 *
 *  DB "Schema"
 *  User -> Repo -> File -> FileStates -> Marker
 *  File -> Category
 *  FileState -> Test
 *
 */
var neo4j= require("neo4j");
var CypherMergeQuery = require("./CypherMergeQuery.js");
var Promise = require("es6-promise").Promise;
var Timer = require("./Timer.js");
var _ = require("lodash");


/**
 *
 *
 * States without context are meant as workspace states, or commits in a git context
 */
var DBNeo4jAdapter = function(url){

	var db = new neo4j.GraphDatabase(url);
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

				var query = "MATCH (u:User {clientId:{clientId}})-[r1:HAS_REPO]->(r:Repo)-[r2:HAS_FILE]->(f:File {contentName: {contentName}, packageName: {packageName}, type:{type}})-[r3:HAS_FILE_STATE]-(fs:FileState) ";
				query += " WHERE fs.time < {time} AND f.type = 'class' ";
				query += " WITH fs ORDER BY fs.time DESC LIMIT 1 ";
				query += " MERGE (fs)-[:HAS_TEST]->(t:Test {time:{time},className:{contentName},packageName:{packageName},methodName:{methodName},result:{result} })";

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

				// Skip test files
				if(file.contentName.substr(-4) === "Test"){
					console.log("Skipped file: ",file.contentName,file.packageName);
					return;
				}

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
		});

		return queryParams.join(", ");

	}

	function _createUserIfNotExist(clientId){
		return new Promise(function(resolve, reject){


			var query = "MATCH (u:User {clientId:{clientId}}) -[:HAS_REPO]-> (r:Repo) RETURN u,r";
			db.cypher({query: query, params: {clientId: clientId}},function(error,result){

				if(error !== null){
					reject(error);
					console.log("User error",error);
					return;
				}
				if(result.length<1){
					_createUser(clientId).then(function(){
						resolve();
					},function(error){reject(error);});
				}else{
					resolve();
					console.log("User exists");
				}
			});
		});
	}

	function _createUser(clientId){
		return new Promise(function(resolve, reject){
			var query = "CREATE (u:User {clientId:{clientId}}) CREATE (r:Repo {timeOfLastUpdate:{timeOfLastUpdate}}) CREATE (u)-[:HAS_REPO]->(r)";
			var params = {clientId: clientId, timeOfLastUpdate: 0};

			db.cypher({query: query, params: params}, function(error, result){

				if(error !== null){
					reject(error);
					return;
				}
				resolve();
			});
		});

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

	//function getAllClientsInCategory(name, type){
		//return new Promise(function(resolve,reject){
			//var query = "Match (c:Category {name: {name}, type:{type}})--(f:File)--(r:Repo)--(u:User) MATCH (f)--(fs:FileState)  return c as category,u as user,f as file, collect(fs) as fileStates";
			//var params = {name: name, type: type};
			//var aggregateCategory = {
				//states: [] 
			//};

			//db.cypher({query: query, params: params},function(error,result){
				//if(error !== null){
					//reject(error);
				//}else{
					//var users = _aggregateUsers(result);
					//resolve(users);
				//}
			//});
			//});
	/*}*/


	function getAllClientsInCategory(name, type){
		return new Promise(function(resolve,reject){
			//When we specify collections like this, we get them exactly like specified, so no need to extract properties other than the actual objects
			var query;
			query = "MATCH (c:Category {name: {name}, type:{type}})--(f:File)--(r:Repo)--(u:User)";
			query += " MATCH (f)--(fs:FileState)";
			query += " OPTIONAL MATCH (fs)--(t:Test)";
			query += " OPTIONAL MATCH (fs)--(m:Marker)";
			query += " WITH c,u,f,fs, {time: fs.time, numberOfLines: fs.numberOfLines, markers: collect(m), tests:collect(t)} as state ORDER BY fs.time ";
			query += " WITH c,u,f,collect(state) as states,{name: c.name, type: c.type} as category";
			query += " WITH u,{name: f.name, contentName: f.contentName, packageName:f.packageName, type: f.type, states: states, category: category} as file";
			query += " return {clientId: u.clientId, files: collect(file)} as user";

			var params = {name: name, type: type};

			db.cypher({query: query, params: params},function(error,result){
				if(error !== null){
					reject(error);
				}else{
					var userList = [];

					result.forEach(function(row){
						var user = row.user;
						user.files = _extractUserMarkerAndTestProperties(user.files);
						userList.push(user);
					});

					// Remove all users that only has files with less than 3 states
					userList = userList.filter(function(user){
						return user.files.some(function(file){return file.states.length > 2;});
					});

					resolve(userList);
				}
			});
			});
	}

	function _extractUserMarkerAndTestProperties(files){

			files.forEach(function(file){
				if(file.category === undefined){file.category = null;}
				if(file.category !== null && file.category.name == null && file.category.type == null){
					file.category = null;
				}
				file.states.forEach(function(state){
					state.markers = state.markers.map(function(marker){return marker.properties;});
					state.tests = state.tests.map(function(tests){return tests.properties;});
				});
			});

		return files;
	}

	function _aggregateUsers(rows){
		//Add extra fields, numberOfFailedTests 
		//

		var users = {};
	
		rows.forEach(function(row){
			var clientId = row.user.properties.clientId;
			if(users[clientId] === undefined){users[clientId] = [];}

			var file = {
				name: row.file.properties.name,
				packageName: row.file.properties.packageName,
				contentName: row.file.properties.contentName,
				type: row.file.properties.type
			};

			var fileStates = row.fileStates.map(function(fileState){
					return _.assign({},fileState.properties);
			});
			file.states = fileStates;
			users[clientId].push(file);
		});

		return users;
	}

	/*function _aggregateUsers(rows){*/
		//var users = {};
	
		//rows.forEach(function(row){
			//var clientId = row.user.properties.clientId;
			//if(users[clientId] === undefined){users[clientId] = [];}
			//var file = row.file.properties;

			//var fileStates = row.fileStates.map(function(fileState){
					//return _.assign({},fileState.properties);
			//});
			//file.states = fileStates;
			//users[clientId].push(file);
		//});

		//return users;
	/*}*/

	function getCategoryList(){
		return new Promise(function(resolve, reject){
			var query = "MATCH (u:Category) return u";

			db.cypher({query: query, params: {}},function(error,result){
				if(error !== null){
					reject(error);
				}else{

					var categoryList = result.map(function(category){
						return {
							name: category.u.properties.name,
							type: category.u.properties.type
						};
					});

					resolve(categoryList);
				}
			});
		});
	}


	function getClientList(){
		return new Promise(function(resolve, reject){
			var query = "MATCH (u:User) return u";

			db.cypher({query: query, params: {}},function(error,result){
				if(error !== null){
					reject(error);
				}else{

					var clientList = result.map(function(client){
						return client.u.properties.clientId;
					});

					resolve(clientList);
				}
			});
		});
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

	// Get a client
	function getRepoStates(clientId){
		return new Promise(function(resolve, reject){

			var params = {clientId: clientId};
			var query;
			query = "MATCH (u:User {clientId:{clientId}})-[:HAS_REPO]->(r:Repo)-[:HAS_FILE]-> (f:File) -[:HAS_FILE_STATE]->(fs:FileState)";
			query += " OPTIONAL MATCH (f) -[:IS_IN_CATEGORY]-(c:Category)";
			query += " OPTIONAL MATCH (fs)-[:HAS_TEST]->(t:Test)";
			query += " OPTIONAL MATCH (fs) --(m:Marker)";
			query += " WITH u,f,c, {time: fs.time, numberOfLines: fs.numberOfLines, markers: collect(m), tests:collect(t)} as state ORDER BY fs.time";
			query += " WITH c,u,f, collect(state) as states, {name: c.name, type: c.type} as category";
			query += " WITH u,{name: f.name, contentName: f.contentName, packageName:f.packageName, type: f.type, category: category, states: states} as file";
			query += " return {clientId: u.clientId, files: collect(file)} as user";

			db.cypher({query: query, params: params},function(error,result){
				if(error !== null){
					reject(error);
					return;
				}
				if(result[0] === undefined){
					reject("Client not found");
					return;
				}

				var user = result[0].user;

				user.files = _extractUserMarkerAndTestProperties(user.files);
				resolve(user);

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
						categoryName: row.markerType.properties.categoryName,
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
					var markerCategory = row.markertype.properties.category;
					var markerCategoryName = row.markertype.properties.categoryName;

					category.push({
						category: markerCategory,
						categoryName: markerCategoryName,
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
		getClientList: getClientList,
		getCategoryList: getCategoryList,
		getAllClientsInCategory: getAllClientsInCategory,
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
