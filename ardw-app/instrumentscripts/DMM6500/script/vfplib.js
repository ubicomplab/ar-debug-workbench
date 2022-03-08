var active = true;
var session_id = 0;
var timerID;
var displayCanvas;
var imgData;
var downloadAnchor;
var waitCount = 0;
var loading = false;
var down_x, down_y;
var fullscreen = false;
var path = IMAGE_PATH;
var busy = false;
var interruptSent = false;
var waitCountCaptured = 0;
var ctx;

var screenImage = {
	width: 800,
	height: 480
};

function buttonMouseDown(e) {
	if (!busy) {
		post({
			function: BUTTON_PRESS_FUNCTION,
			button: buttonMap[e.target.id],
			session: session_id
		});
	}
}

function buttonMouseUp(e) {
	if (!busy) {
		post({
			function: BUTTON_RELEASE_FUNCTION,
			button: buttonMap[e.target.id],
			session: session_id
		});
	}
}

function displayMouseDown(e) {
	if (e.button != 0 || hideContextMenu())
		return false;

	down_x = Math.round(e.offsetX * (screenImage.width / displayCanvas.scrollWidth));
	down_y = Math.round(e.offsetY * (screenImage.height / displayCanvas.scrollHeight));

	if (busy) {
		post({
			function: INTERRUPT_FUNCTION,
			session: session_id
		});
		interruptSent = true;
		waitCountCaptured = waitCount;
	} else {
		post({
			function: CLICK_DOWN_FUNCTION,
			x1: down_x,
			y1: down_y,
			session: session_id
		});
	}
}

function displayMouseUp(e) {
	if (e.button != 0)
		return false;

	var up_x = Math.round(e.offsetX * (screenImage.width / displayCanvas.scrollWidth));
	var up_y = Math.round(e.offsetY * (screenImage.height / displayCanvas.scrollHeight));

	if (!busy) {
		if (Math.abs(down_x - up_x) > 10 || Math.abs(down_y - up_y) > 10) {
			post({
				function: CLICK_MOVE_FUNCTION,
				x1: up_x,
				y1: up_y,
				session: session_id
			});
		}

		post({
			function: CLICK_UP_FUNCTION,
			x1: up_x,
			y1: up_y,
			session: session_id
		});
	}
}

function displayContextMenu(e) {
	if (active) {
		var opt = document.getElementById('options');
		opt.style.left = e.offsetX + 'px';
		opt.style.top = e.offsetY + 'px';
		opt.style.display = 'block';
	}
	e.preventDefault();
	e.stopPropagation();
}

function hideContextMenu() {
	var opt = document.getElementById('options');
	if (opt.style.display != '') {
		opt.style.display = '';
		return true;
	}
	return false;
}

function checkboxChange(e) {
	switch (e.currentTarget.id) {
		case 'option_screenonly':
			var wrapper = document.getElementById('contentWrapper');
			fullscreen = !fullscreen;
			wrapper.className = (fullscreen ? 'fullscreen' : 'normal');
			hideContextMenu();
			break;

		case 'option_hirez':
			path = e.target.checked ? IMAGE_PATH : IMAGE_PATH_LOW;
			hideContextMenu();
			break;
	}
}

Number.prototype.pad = function (size) {
	var s = String(this);
	while (s.length < (size || 2)) { s = '0' + s; }
	return s;
};

function downloadClicked(e) {
	var date = new Date();
	var fileName = 'img'
		+ (date.getMonth() + 1).pad()
		+ date.getDate().pad() + '_'
		+ date.getHours().pad()
		+ date.getMinutes().pad()
		+ date.getSeconds().pad() + '.png';

	if (window.navigator.msSaveBlob) {
		window.navigator.msSaveBlob(displayCanvas.msToBlob(), fileName);
		e.preventDefault();
	} else {
		e.currentTarget.setAttribute('download', fileName);
		e.currentTarget.setAttribute('href', displayCanvas.toDataURL());
	}
	hideContextMenu();
}

window.addEventListener('load', function () {
	startSession(FP_SESSION_FUNCTION, onSessionReady);

	// Prevent dragging of images
	var i;
	var imgList = document.querySelectorAll('img');
	for (i = 0; i < imgList.length; ++i) {
		imgList[i].addEventListener('dragstart', function (e) {
			e.preventDefault();
			e.stopPropagation();
		});
	}

	// Add mouse listeners for navigation buttons
	var inputList = document.querySelectorAll('.button');
	for (i = 0; i < inputList.length; ++i) {
		inputList[i].addEventListener('mousedown', buttonMouseDown);
		inputList[i].addEventListener('mouseup', buttonMouseUp);
	}

	// Add mouse listeners for navigation wheel (if present)
	var wheelButton = document.getElementById('Wheel');
	if (wheelButton != null) {
		wheelButton.addEventListener('mousedown', buttonMouseDown);
		wheelButton.addEventListener('mouseup', buttonMouseUp);
	}

	// Add mouse listeners for terminal switch (SMUs)
	var terminalSwitch = document.getElementById('TerminalSwitch');
	if (terminalSwitch != null) {
		terminalSwitch.addEventListener('mousedown', buttonMouseDown);
		terminalSwitch.addEventListener('mouseup', buttonMouseUp);	
	}

	// Add change listeners for menu checkboxes
	var checkList = document.querySelectorAll('.menu-option');
	for (i = 0; i < checkList.length; ++i) {
		checkList[i].addEventListener('change', checkboxChange);
	}

	// Add click listener for screenshot download link
	downloadAnchor = document.getElementById('option_download');
	downloadAnchor.addEventListener('click', downloadClicked);
});

function getTimestamp() {
	var date = new Date();
	return date.getTime();
}

function drawMsgLostControl() {
	displayCanvas.width = 800;
	displayCanvas.height = 480;
	displayCanvas.removeEventListener('mousedown', displayMouseDown);
	displayCanvas.removeEventListener('mouseup', displayMouseUp);
	displayCanvas.removeEventListener('contextmenu', displayContextMenu);
	displayCanvas.addEventListener('click', function () {
		location.reload(true);
	});

	ctx.clearRect(0, 0, 800, 480);
	ctx.font = '34px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillStyle = 'orange';
	ctx.textBaseline = 'bottom';
	ctx.fillText('Another user has control of the instrument', 400, 235);
	ctx.font = '26px sans-serif';
	ctx.fillStyle = 'white';
	ctx.textBaseline = 'top';
	ctx.fillText('Click to take control', 400, 245);
}

function drawMsgBusy() {
	displayCanvas.width = 800;
	displayCanvas.height = 480;
	ctx.clearRect(0, 0, 800, 480);
	ctx.font = '40px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillStyle = 'orange';

	if (interruptSent) {
		var countSinceInterrupt = waitCount - waitCountCaptured;
		if (countSinceInterrupt < 30) {
			ctx.textBaseline = 'alphabetic';
			ctx.fillText('Awaiting response', 400, 240);
		} else {
			clearInterval(timerID);
			displayCanvas.removeEventListener('mousedown', displayMouseDown);
			displayCanvas.removeEventListener('mouseup', displayMouseUp);
			displayCanvas.removeEventListener('contextmenu', displayContextMenu);

			ctx.textBaseline = 'bottom';
			ctx.fillText('Response timeout', 400, 235);
			ctx.font = '24px sans-serif';
			ctx.fillStyle = 'white';
			ctx.textBaseline = 'top';
			ctx.fillText('Check connection', 400, 245);
		}
	} else {
		ctx.textBaseline = 'bottom';
		ctx.fillText('Instrument busy', 400, 235);
		ctx.font = '24px sans-serif';
		ctx.fillStyle = 'white';
		ctx.textBaseline = 'top';
		ctx.fillText('Click to interrupt', 400, 245);
	}
}

function pollDisplay() {
	if (!loading) {
		var xhr = new XMLHttpRequest();
		xhr.onload = function () {
			if (xhr.status == 200) {
				var arrayBuffer = xhr.response;

				if (arrayBuffer) {
					try {
						var info = new TGAInfo(arrayBuffer);
						if (displayCanvas.width != info.width) {
							imgData = ctx.createImageData(info.width, info.height);
							displayCanvas.width = imgData.width;
							displayCanvas.height = imgData.height;
						}
						tgaImageDataSet(imgData, arrayBuffer, info);
						ctx.putImageData(imgData, 0, 0);
						pollLED();
					}
					catch (err) {
						console.log('bad image data');
					}
				}
			}
			else if (xhr.status == 400) {
				active = false;
				clearInterval(timerID);
				hideContextMenu();
				drawMsgLostControl();
			}
			loading = false;
		};

		xhr.open('GET', path + '?' + session_id + ':' + getTimestamp());
		xhr.responseType = 'arraybuffer';
		xhr.send(null);
		loading = true;
		waitCount = 0;
		waitCountCaptured = 0;
		busy = false;
		interruptSent = false;
	}
	else if (++waitCount >= 30) {
		busy = true;
		drawMsgBusy();
	}
}

function pollLED() {
	post({
		function: LED_FUNCTION,
		session: session_id
	}, function (result) {
		var getPairs = /(.*?)=(.*?)\$@\$/g;
		var resultArray;
		while ((resultArray = getPairs.exec(result)) != null) {
			var key = resultArray[1];
			var value = resultArray[2];
			switch (key) {
				case 'rem':
				case 'lan':
				case 'ptp1588':
				case 'interl':
					var light = document.getElementById('light_' + key);
					if (light != null) {
						light.className = (value == '1' ? 'light lightON' : 'light');
					}
					break;

				case 'term':
					var term = document.getElementById('terminals');
					if (term != null) {
						term.className = (value == '1' ? 'front' : 'rear');
					}
					break;

				case 'op':
					var output = document.getElementById('OutputSurround')
					if (output != null) {
						output.className = (value == '1' ? 'buttonSurround outputON'
														 : 'buttonSurround');
					}
					break;
			}
		}
	});
}

function onSessionReady() {
	displayCanvas = document.getElementById('DisplayCanvas');
	displayCanvas.addEventListener('mousedown', displayMouseDown);
	displayCanvas.addEventListener('mouseup', displayMouseUp);
	displayCanvas.addEventListener('contextmenu', displayContextMenu);
	displayCanvas.width = 800;
	displayCanvas.height = 480;
	ctx = displayCanvas.getContext('2d');
	imgData = ctx.createImageData(800, 480);

	timerID = setInterval(pollDisplay, DISPLAY_POLLING);
}
