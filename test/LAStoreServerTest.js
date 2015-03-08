var request = require("request");
var should = require("should");
var spawn = require("child_process").spawn;
var Promise = require("es6-promise").Promise;
var fs = require('fs');
var sqlite3 = require("sqlite3").verbose();
var rimraf = require("rimraf");

var port = 44988;
var serverNode;


function sendRequest(method,url,body){
	return new Promise(function(resolve,reject){
		request({url:"http://localhost:"+port+url, method:method,body:body,json:true},function(error, response, body){
			if(error !== null){
				reject(error);
			}

			console.log("Response: ",error,body)
			resolve(body);

		});
	});
}
describe("LAStoreServer", function () {
	before (function (done) {
		console.log("Running server:",port);
		serverNode = spawn("node", ["LAStoreServer.js","-p", port], {stdio: "inherit"});
		setTimeout(function(){done(); },1000);
	});

	after(function (done) {
		serverNode.kill();
		done();
	});

	it("should listen on given port", function (done) {
		sendRequest("GET","/",{}).then(function(result){
			console.log(result);
			try{
				result.should.equal("Cannot GET /\n");
				done();
			}catch(e){
				done(e);
			}
		},function(error){
			done(error);
		})
	});

	function cleanUpUser(db,id){
		return new Promise(function(resolve,reject){
			try{
				if(id.length<40 || id.match(/^[A-z0-9]+$/) === null){
					console.log("Could not perfom cleanup of created folder for user: "+id)
					return;
				}
				rimraf.sync("/srv/LAHelper/logs/"+id,function(error){
					console.log("Cleaned up: "+id,error);
				});

				db.run("DELETE FROM user WHERE userId=$id",{$id:id},function(result){
					resolve();
				});
			}catch(e){
				console.log("ERROR in cleanup: ",e);
				resolve();
			}
		})
	}

	function createUser(db){
		return new Promise(function(resolve,reject){

			var id;
			sendRequest("POST","/client",{}).then(function(result){
				id = result;
				console.log("Got result: ",result);
				try{
					result.length.should.equal(40);
					// Check folder exits
					fs.existsSync("/srv/LAHelper/logs/"+id).should.equal(true);

					//Check DB populated
					db.get("SELECT userId,name FROM user WHERE userId= $id",{$id:id},function(error,rows){

						if(rows === undefined || rows.userId=== undefined || rows.userId.length === 0){
							reject("ERROR: No user row found: "+rows.length+" "+rows.toString);
						}else{
							resolve(id);
						}

					});
				}catch(e){
					reject(e);
				}
			},function(error){
				reject(error);
			})
		});
	}

	it("should be able to create a client", function (done) {
		var db = new sqlite3.Database("/srv/LAStore/dbFile.db");
		var id;
		after(function(done){cleanUpUser(db,id).then(function(result){done();});})
		createUser(db).then(function(_id){id = _id;done()},function(error){done(error);})
	});

	it("should be able to set client name", function (done) {
		var db = new sqlite3.Database("/srv/LAStore/dbFile.db");
		var id;
		after(function(done){cleanUpUser(db,id).then(function(result){done();});})
		createUser(db).then(function(_id){
			id = _id;
			sendRequest("POST","/client/name",{name:"test",clientId:id}).then(function(result){
				//Check DB populated
				db.get("SELECT userId,name FROM user WHERE userId= $id",{$id:id},function(error,rows){

					if(rows === undefined || rows.userId=== undefined || rows.name.length === 0 || rows.name !== "test"){
						done("ERROR: Name not set: "+rows.length+" "+rows.toString);
					}else{
						done();
					}
			});
			});
		},function(error){done(error);})
	});


	it("should be able to set client participating", function (done) {
		var db = new sqlite3.Database("/srv/LAStore/dbFile.db");
		var id;
		after(function(done){cleanUpUser(db,id).then(function(result){done();});})
		createUser(db).then(function(_id){
			id = _id;
			sendRequest("POST","/client/participating",{participating:"true",clientId:id}).then(function(result){
				//Check DB populated
				db.get("SELECT userId,name,participating FROM user WHERE userId= $id",{$id:id},function(error,rows){

					if(rows === undefined || rows.userId=== undefined || rows.participating.length === 0 || rows.participating!== "true"){
						done("ERROR: Name not set: "+rows.length+" "+rows.toString);
					}else{
						done();
					}
			});
			});
		},function(error){done(error);})
	});

});
