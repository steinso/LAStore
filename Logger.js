
var Logger = function(clientId,msg){

	var _logs = [];
	var _msg = "";

	var setMessage = function(message){
		_msg = message;
	};

	var _constructor = function(clientId,msg){
		_timestamp = _getTimeStamp();
		_clientId = clientId || "unknown";
		_msg = msg || "";
	};

	var debug = function(msg){
		var log = {type:"",msg:msg};
		_logs.push(log);
	};

	var error = function(msg){
		var log = {type:"ERROR",msg:msg};
		_logs.push(log);
	};

	var print = function(){
		console.log(_timestamp+">"+_clientId.substring(0,7)+"|| "+_msg);
		_logs.map(_printSingleLog);
	};

	var _printSingleLog = function(log){
		console.log("   | "+log.type+": "+log.msg);
		
	};

	var _getTimeStamp = function(){
		var date = new Date();

		return date.toISOString(); 
	};

	_constructor(clientId,msg);

	return {
		setMessage:setMessage,
		debug:debug,
		error:error,
		print:print
	};
};


module.exports = Logger;
