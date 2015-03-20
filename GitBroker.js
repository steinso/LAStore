"use strict";
var NodeGit= require("nodegit");
var timer = require("./Timer.js");
var exec = require('child_process').exec;
var fs = require('fs');
var Promise = require('es6-promise').Promise;


/*
 *
 * Object: 
 * [{ //commit
 *		time: ,
 *		files:[ 
 *			{
 *			name:
 *			fileContents:
 *		}]
 * }]
 */

var Commit = function(){
	this.time = 0;
	this.sha = "";
	this.msg = "";
	this.files = [];
};

var File = function(){
	this.name = "";
	this.fileContents = "";
};

var getCommitsAfterTime = function(repoPath,timeStamp){
	return new Promise(function(resolve, reject){
		var commitList = [];
		console.log("Fetching relevant commit after: ",timeStamp);

		NodeGit.Repository.open(repoPath).then(function(repo) {
			repo.head().then(function(headRef){

				var revwalk = repo.createRevWalk();
				revwalk.push(headRef.target());
				revwalk.getCommitsUntil(function(commit){
					return commit.timeMs()>timeStamp;
				}).then(function(commits){
					//Revwalk has a bug where the last commit is always returned
					if(commits.length === 1 && commits[0].timeMs()<=timeStamp){
						commits = [];
					}

					console.log("Found relevant commits: ",commits.length);
					

					var promises = [];
					var commitList = [];
					commits.forEach(function(commit){

					promises.push(generateCommitObject(commit)
						.then(function(commit){
						 commitList.push(commit);
					 },function(error){
						 reject(error);
					 }));
					});

					Promise.all(promises).then(function(){
						resolve(commitList);
					}).catch(function(error){
						reject(error);
					});
				},function(error){reject(error);})
			},function(error){
				reject(error)
			})

		},function(error){reject(error)});
	});
};

var getCommitListFromRepo = function(repoPath){
	console.log("Get commit list")
	return new Promise(function(resolve, reject){
		var commitList = [];
		console.log("In promise")

		NodeGit.Repository.open(repoPath).then(function(repo) {
			return repo.getMasterCommit();
		},function(error){reject(error);})
		.then(function(firstCommitOnMaster) {
			// Create a new history event emitter.
			var history = firstCommitOnMaster.history();

			history.on("end",function(_commitObjs){
				resolve(commitList);
			});

			history.on("error",function(error){
				reject(error);
			});

			history.on("commit", function(commit) {
				commitList.push({"sha": commit.sha(),"time": commit.timeMs()});
			});

			// Start emitting events.
			history.start();
		},function(error){reject(error)});

	});
};


var getCommitsFromRepo = function(repoPath,_requestedCommits){
	return new Promise(function(resolve, reject){

		var requestedCommits = _requestedCommits ||[];
		var watch = timer.create("getCommits");
		watch.start();

		getFileListFromGitRepo(repoPath).then(function(files){
			getFileCommits(repoPath, files,requestedCommits).then(function(commits){
				watch.stop();
				console.log(watch.average(), "ms <- Generated commits for ", repoPath, commits.length);

				resolve(commits);
			}, function(error){reject(error); });
		}, function(error){reject(error); });
	});
};

// ls-files is not available through nodegit, so it must be fetched manually
var getFileListFromGitRepo = function(dir){
	return new Promise(function(resolve,reject){

		exec("git ls-files",{cwd:dir},function(error,stdout,stderr){
			if(error !== null || stderr !== ""){
				reject(error+" \nstderr: "+stderr);
				return;
			}

			var files = stdout.split("\n");
			//Remove empty element
			files = files.filter(function(el) {return el.length !== 0;});
			resolve(files);
		});
	});
};

var getFileCommits = function(repoPath,files,_requestedCommits){
	return new Promise(function(resolve,reject){

		var requestedCommits = _requestedCommits || [];
		var commits = [];
		var filesInRepo = files;
		// Open the repository directory.
		NodeGit.Repository.open(repoPath)
		// Open the master branch.
		.then(function(repo) {
			return repo.getMasterCommit();
		})

		// Display information about commits on master.
		.then(function(firstCommitOnMaster) {
			// Create a new history event emitter.
			var history = firstCommitOnMaster.history();

			history.on("end",function(_commitObjs){
				var promises = [];
				_commitObjs.forEach(function(commit){

					if(requestedCommits.length>0 
					   && requestedCommits.indexOf(commit.sha()) === -1){
						   return;
					   }

					   promises.push(generateCommitObject(commit,filesInRepo)
									 .then(function(commit){
										 commits.push(commit);
									 },function(error){reject(error);}));
				})

				Promise.all(promises).then(function(){
					resolve(commits);
				}).catch(function(error){
					reject(error);
				})
			});

			history.on("error",function(error){
				reject(error);
			});

			history.on("commit", function(commit) {
				/*
				   if(requestedCommits.length>0 
				   && requestedCommits.indexOf(commit.sha()) === -1){
				   return;
				   }

				   generateCommitObject(commit,filesInRepo).then(function(_commit){
				   commits.push(_commit);

				   },function(error){
				   console.log("Could not parse commit: "+error);
				   });
				   */
			});

			// Start emitting events.
			history.start();
		});
	});
};

var generateCommitObject= function(_commit){
	return new Promise(function(resolve, reject){
		var promises = [];

		var commit = new Commit();
		commit.time = _commit.timeMs();
		commit.sha = _commit.sha();
		commit.msg = _commit.message();
		commit.files = [];

		_commit.getDiff().then(function(diffList){
			var pathList = [];
			diffList.forEach(function(diff){
				for(var i=0;i<diff.numDeltas();i++){
					var diffDelta = diff.getDelta(i);
					var path = diffDelta.newFile().path();
					pathList.push(path);
				}
			});

			//Get file contents from commit
			pathList.forEach(function(filename){

				var promise = new Promise(function(resolve,reject){

					_commit.getEntry(filename).then(function(entry){
						entry.getBlob().then(function(blob){
							var file = new File();
							file.name = filename;
							file.fileContents = String(blob);
							commit.files.push(file);
							resolve();
						},function(error){reject(error)});
					},function(error){
						//if the file is not found, we just skip it for the current commit
						console.log("File not found: ",error);
						resolve();});
				},function(error){reject(error);})
				promises.push(promise);
			});


			Promise.all(promises).then(function(){
				resolve(commit);
			},function(error){
				reject(error);
			});

		});

	});
};


var generateCommitObjectTree = function(_commit, filesInRepo){
	return new Promise(function(resolve, reject){
		var promises = [];

		var commit = new Commit();
		commit.time = _commit.date();
		commit.sha = _commit.sha();
		commit.msg = _commit.message();
		commit.files = [];

		var trees = []; 

		_commit.getTree().then(function(tree){
			var eventEmitter = tree.walk(true); //Walk blobs only
			eventEmitter.on("entry",function(tree){
				trees.push(tree);
			});

			eventEmitter.on("end", function(){
				//Looks like a bug in NodeGit,
				//the tree array given to the End function is inconsistent
				//with each entry given by on entry. -
				// Therefore we dont rely on it, and create our own

				trees.forEach(function(tree){
					var promise = new Promise(function(resolve,reject){

						tree.getBlob().then(function(blob){
							var file = new File();
							file.name = tree.path();
							file.fileContents =  blob.toString();
							commit.files.push(file);
							resolve();
						},function(error){reject(error)});
					},function(error){reject(error);});
					promises.push(promise);
				});

				Promise.all(promises).then(function(){
					resolve(commit);
				},function(error){
					reject(error);
				});
			});
			eventEmitter.start();
		});
	});
};


var generateCommitObjectOld = function(_commit, filesInRepo){
	return new Promise(function(resolve, reject){
		var promises = [];

		var commit = new Commit();
		commit.time = _commit.date();
		commit.sha = _commit.sha();
		commit.msg = _commit.message();
		commit.files = [];

		//Get file contents from commit
		filesInRepo.map(function(filename){

			var promise = new Promise(function(resolve,reject){

				_commit.getEntry(filename).then(function(entry){
					entry.getBlob().then(function(blob){
						var file = new File();
						file.name = filename;
						file.fileContents = String(blob);
						commit.files.push(file);
						resolve();
					},function(error){reject(error)});
				},function(error){
					//if the file is not found, we just skip it for the current commit
					console.log(error);
					resolve();});
			},function(error){reject(error);})
			promises.push(promise);
		});

		Promise.all(promises).then(function(){
			resolve(commit);
		},function(error){
			reject(error);
		}
								  );
	});
};

module.exports = {
	getCommitsFromRepo: getCommitsFromRepo,
	getCommitsAfterTime: getCommitsAfterTime,
	getCommitListFromRepo: getCommitListFromRepo
};
