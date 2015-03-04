
var RequestValidator = function(){

	function validateRequest(request,model){

		if(typeof request !== "object" || typeof model !== "object"){
			return false;
		}

		var requiredFields = Object.keys(model);
		var givenFields = Object.keys(request);

		for(var i = 0; i<requiredFields.length;i++){
			var field = requiredFields[i];

			if(givenFields.indexOf(field) < 0){
				return false;
			}

		}
		return true;
	}

	return {

		validateRequest: validateRequest
	};

};

module.exports = new RequestValidator();
