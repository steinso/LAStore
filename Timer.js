var Timer = function(){
	var timers = {};

	var create = function(name){
		timers[name] = new StopWatch();
		return timers[name];
	};

	var get = function(name){
		return timers[name];
	}; 

	return{
		create:create,
		get:get
	};
};

var StopWatch = function(){
	var sum = 0;
	var number = 0;
	var last = 0;
	var running = 0;
	var isRunning = false;
	

	var start = function(){
		running = Date.now();
		isRunning = true;
	};

	var stop = function(){
		if(running == 0 ){
			return;
		}
		var time = Date.now() - running;
		last = time;

		isRunning = false;

		sum += time;
		number++;
		return time;
	};

	var getLast = function(){
		return last;
	};

	var average = function(){
		return sum/number;
	};

	var reset = function(){
		sum = 0;
		number = 0;
	};

	var getStats = function(){
		return "";
	};
	
	var getTotal = function(){
		return sum;
	}

	return{
		start:start,
		stop:stop,
		reset:reset,
		getLast:getLast,
		getTotal:getTotal,
		average:average
	};
};

module.exports = new Timer();
