
var CypherMergeQuery = function(){
	var nodes = [];
	var relationShips = [];
	var refCount = 0;
	var paramCount = 0;
	var allParams = {};

	function createNode(node,params){
		var nodeRef = "n"+refCount++;
		nodes.push({node: node,ref: nodeRef,params: params,type:"CREATE"});
		return nodeRef;
	}

	function addNode(node,params){
		var nodeRef = "n"+refCount++;
		nodes.push({node: node,ref: nodeRef,params: params,type:"MERGE"});
		return nodeRef;
	}

	function getReference(){
		return "r"+refCount++;
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
			return node.type+" ("+node.ref+":"+node.node+" {"+params+"})";
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


module.exports = CypherMergeQuery;
