
var assert = require("assert");
var Adapter = require("../DBNeo4jAdapter.js");
var Promise = require("es6-promise").Promise;
var _ = require('lodash');

var RepoStates = [
	{
		commitSha:"34554345fdsfsdf435",
		commitMsg:"Test commit",
		time: 1000000,
		files: [
			{
				name:"Test.java",
				numberOfMarkers: 5,
				numberOfLines: 34,
				numberOfFailedTests: 3
			},
			{
				name:"TestTest.java",
				numberOfMarkers: 3,
				numberOfLines: 340,
				numberOfFailedTests: 0
			}
		]
	},
	{
		commitSha:"sdfuiy783ydfus87sd",
		commitMsg:"Test commit",
		time: 1000100,
		files: [
			{
				name:"Test.java",
				numberOfMarkers: 3,
				numberOfLines: 54,
				numberOfFailedTests: 2
			},
			{
				name:"TestTest.java",
				numberOfMarkers: 0,
				numberOfLines: 340,
				numberOfFailedTests: 0
			}
		]
	}
]

describe("BDNeo4JAdapter", function(){

	describe("addState", function(){

		it("be able to add a state", function(done){
			var adapter = new Adapter();
			var db = adapter.__forTesting.db;
			var state = RepoStates[0];
			var query = "MATCH (n:User {clientId: 'stein'}) -[r:HAS_REPO]-> (re:Repo) -[r2:HAS_FILE]-> (f:File {name: 'TestTest.java'})-[:HAS_FILE_STATE]-> (s1:FileState {numberOfMarkers: 3, numberOfLines: 340, numberOfFailedTests: 0}) MATCH (n)-[r]->(re)-[r3:HAS_FILE]->(f2:File {name: 'Test.java'}) -[:HAS_FILE_STATE]->(s2:FileState {numberOfLines: 34, numberOfFailedTests: 3, numberOfMarkers: 5}) MATCH (re)-[:HAS_REPO_STATE]-> (rs:RepoState)-[:HAS_FILE_STATE]->(s1) MATCH (re) -[:HAS_REPO_STATE]-> (rs)-[:HAS_FILE_STATE]-> (s2) RETURN n,re,f,f2,s1,s2,rs";
			var params = {}

			adapter.addState('stein',state).then(function(result){
				db.cypher({query:query,params:params},function(error,result){
					console.log("Result: ",result);

					if(error !== null){
						done(error);
						return;
					}

					if(result.length === 1){
						done();
						return;
					}else{
						done("Unexpected result");
					}

				})
			},function(error){
				done(error);
			})
		})
	})

	describe("getFileStates", function(){

		it("should return correct states", function(done){

			var adapter = new Adapter();
			var db = adapter.__forTesting.db;

			var fileStates = [
				{
					time: 100000,
					numberOfMarkers: 10,
					numberOfLines: 100,
					numberOfFailedTests: 5
				}
			];

			var populateDB = function(states){
				var user = "test";	
				var path = "/var/test/file.java";
			};

			var request = {
				required1: "this is my request",
				required2: "this is somethinf else"
			};

			var returnedFileStates = adapter.getFileStates("/path/to/File","user").then(function(states){
				assert.equal(states,fileStates);
				done();
				console.log(states);
			},function(error){
				console.log("Error:",error)
			})

		});
	});

	describe("getRepoStateList", function(done){

		it("should return correct repoStates", function(done){
			var adapter = new Adapter();
			var db = adapter.__forTesting.db;
			console.log("Checking repo states");

			//Populate DB
			adapter.addStates('stein',RepoStates).then(function(){
				console.log("DB Populated");

				adapter.getRepoStateList('stein').then(function(stateList){
					var expectedStateHashes = RepoStates.map(function(state){return state.commitSha;})
					var stateHashes = stateList.map(function(state){ return state.commitSha;})

					console.log("Got repoState list",stateList)
					console.log("Got commit list",stateHashes)
					console.log("Expected repoState list",expectedStateHashes)

					console.log("Diff: ",_.difference(expectedStateHashes,stateHashes))

					if(_.difference(expectedStateHashes,stateHashes).length != 0 || _.difference(stateHashes,expectedStateHashes).length != 0){
						done(error+" "+stateHashes+" -> "+expectedStateHashes);
						return;
					} 
					done();

				},function(error){
					done(error);
				})

			},function(error){
				done(error);
			})

		});
	});
});

