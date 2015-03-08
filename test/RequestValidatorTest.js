var assert = require("assert");
var validateRequest = require("../RequestValidator.js").validateRequest;


describe("RequestValidator", function(){
	describe("validateRequest", function(){

		it("should validate request with correct elements", function(){
			var model = {
				required1: "",
				required2: ""
			};

			var request = {
				required1: "this is my request",
				required2: "this is somethinf else"
			};

			assert.equal(true,validateRequest(request,model));
		});

		it("should validate correct request with additional elements", function(){
			var model = {
				required2: ""
			};

			var request = {
				required1: "this is my request",
				required3: ["test"],
				required2: "this is somethinf else"
			};

			assert.equal(true,validateRequest(request,model));
		});

		it("should not validate request with too few elements", function(){
			var model = {
				required1: "",
				required2: ""
			};

			var request = {
				required1: ""
			};

			assert.equal(false,validateRequest(request,model));
		});


		it("should not validate misformed request (undefined)", function(){

			var model= {
				required1: "",
				required3: [],
				required2: ""
			};

			assert.equal(false,validateRequest(undefined,model));
		});

		it("should not validate misformed request (string)", function(){

			var model= {
				required1: "",
				required3: [],
				required2: ""
			};
		assert.equal(false,validateRequest("this is a misformed request",model));
		});

		it("should not validate misformed request (number)", function(){

			var model= {
				required1: "",
				required3: [],
				required2: ""
			};
			assert.equal(false,validateRequest(1234,model));
		});


		it("should not validate misformed request (function)", function(){

			var model= {
				required1: "",
				required3: [],
				required2: ""
			};
			assert.equal(false,validateRequest(function(){},model));
		});

		it("should not validate misformed request (array)", function(){

			var model= {
				required1: "",
				required3: [],
				required2: ""
			};
			assert.equal(false,validateRequest([],model));
		});


		it("should not validate request array", function(){

			var model= {
				required1: "",
				required3: [],
				required2: ""
			};

			var request = ["required1","required2","required3"];
			assert.equal(false,validateRequest(request,model));
		});
	});
});

