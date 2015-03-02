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

var CypherMergeQuery = function(){
	var nodes = [];
	var relationShips = [];
	var refCount = 0;
	var paramCount = 0;
	var allParams = {};

	function addNode(node,params){
		var nodeRef = "n"+refCount++;
		nodes.push({node: node,ref: nodeRef,params: params});
		return nodeRef;
	}

	function addRelation(fromRef,type,toRef){
		relationShips.push({from: fromRef,type: type,to: toRef});
	}

	function getQuery(){

		var nodeQ = _getNodeQuery();
		var relationQ = _getRelationQuery();

		var query = nodeQ+" "+relationQ;

		return {
			query: query,
			params: allParams
		};
	}

	function _getNodeQuery(){
		var nodeQ = nodes.map(function(node){
			var params = _genParams(node.params);
			return "MERGE ("+node.ref+":"+node.node+" {"+params+"})";
		});
		return nodeQ.join(" ");
	}

	function _getRelationQuery(){

		var relationQ = relationShips.map(function(relation){
			return "MERGE ("+relation.from+") -[:"+relation.type+"]-> ("+relation.to+") ";
		});

		return relationQ.join(" ");
	}

	function _genParams(params){

		var paramNames = Object.keys(params);

		var queries = paramNames.map(function(param){
			var pid = "p"+paramCount++;
			allParams[pid] = params[param];
			return param+": {"+pid+"}";
		});

		return queries.join(",");
	}

	return {
		getQuery: getQuery,
		addNode: addNode,
		addRelation: addRelation
	};
};

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


	function getFileStates(user,path){

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


	return {
		addState: addState,
		addStates: addStates,
		getFileStates: getFileStates,
		addCategory: addCategory
	};
};

var ad = new DBNeo4jAdapter();

//var c = ad.addCategory("Oving1",[{name:"test1"},{name:"test2"}]);

var request = require("request");

function requestRepoStates(repo,callBack){

request("http://192.168.1.158:50809/timeLapse/"+repo, function (error, response, body) {
	if (!error && response.statusCode === 200) {
		var info = JSON.parse(body);
		console.log(ad.addStates("stein",info,callBack));
	}
});
}
