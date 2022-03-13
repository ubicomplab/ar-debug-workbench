//url for ajax calls
var url_str = 'ajax_proc';

//constants for buttons
var buttonMap = {
	'Home': 1,
	'Menu': 2,
	'Button3': 3,
	'Help': 4,
	'Enter': 5,
	'Wheel': 5,
	'Exit': 6,
	'Function': 7,
	'Trigger': 8,
	'TerminalSwitch': 9,
	'Output': 10
};

//constants for functions
var COMMAND_FUNCTION = 1;
var CLICK_DOWN_FUNCTION = 2;
var CLICK_UP_FUNCTION = 3;
var SWIPE_FUNCTION = 4;
var BUFFER_FUNCTION = 5;
var LED_FUNCTION = 6;
var BUTTON_PRESS_FUNCTION = 7;
var BUTTON_RELEASE_FUNCTION = 8;
var FP_SESSION_FUNCTION = 9;
var BUFFER_SESSION_FUNCTION = 10;
var CLICK_MOVE_FUNCTION = 11;
var INTERRUPT_FUNCTION = 12;

//constants for evaluating returned strings
var DELIMITER = '$@$';
var ERROR_HEADER = 'ERR=';
var COMMAND_HEADER = 'CMD=';
var BUFFER_HEADER = 'buff';
var REMOTE_HEADER = 'rem=';
var LAN_HEADER = 'lan=';
var PTP1588_HEADER = 'ptp1588';
var TERMINAL_HEADER = 'term=';
var OUTPUT_HEADER = 'op=';
var INTERLOCK_HEADER = 'interl=';
var CAP_STATUS_HEADER = 'cap=';
var SESSION_HEADER = 'session=';

//constants for swipes
var RESIZE_AMOUNT = 1.55;
var SWIPE_LEFT = 1;
var SWIPE_RIGHT = 2;
var SWIPE_UP = 3;
var SWIPE_DOWN = 4;
var SWIPE_DISTANCE = 20;
//how should I handle diagonal swiping?

//global variables for swipes on touchscreen
var mouseXPos;
var mouseYPos;

//polling rate constants
var DISPLAY_POLLING = 100;
var BUFFER_POLLING = 5000;

//path to where buffers live
var BUFFER_PATH = '/';
var IMAGE_PATH = '/images/fp.tga';
var IMAGE_PATH_LOW = '/images/fplow.tga';

// Utility functions

function post(params, resultHandler) {
	var pair_count = 0;
	var pairs = [];
	Object.keys(params).forEach(function (key) {
		pairs[pair_count++] = key + '=' + params[key];
	});

	var xhr = new XMLHttpRequest();
	xhr.open('POST', 'ajax_proc');
	xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xhr.setRequestHeader('Cache-Control', 'no-cache');

	if (resultHandler) {
		xhr.onload = function () {
			resultHandler(xhr.response);
		};
	}

	xhr.send(pairs.join('&'));
	return xhr;
}

function startSession(func_id, onready) {
	top.document.title = document.title;

	post({
		function: func_id
	}, function (result) {
		var resultArray = /session=(\d+)/.exec(result);
		if (resultArray) {
			session_id = parseInt(resultArray[1]);
			onready();
		}
	});
}
