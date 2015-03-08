
var assert = require("assert");
var Adapter = require("../DBNeo4jAdapter.js");


describe("BDNeo4JAdapter", function(){
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
});

