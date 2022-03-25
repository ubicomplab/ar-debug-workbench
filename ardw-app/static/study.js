var socket = io();

var first_with = {
    "1A": {
        "with": document.getElementById("first-with-1a"),
        "without": document.getElementById("first-without-1a"),
    },
    "1B": {
        "with": document.getElementById("first-with-1b"),
        "without": document.getElementById("first-without-1b"),
    }
}

for (let task in first_with) {
    first_with[task].with.addEventListener("click", () => {
        socket.emit("study-event", {"event": "settings", "task": task, "first_with": true});
    });
    first_with[task].without.addEventListener("click", () => {
        socket.emit("study-event", {"event": "settings", "task": task, "first_with": false});
    });
}

var task_buttons = {
    "off": document.getElementById("task-off"),
    "1A": document.getElementById("task-1a"),
    "1B": document.getElementById("task-1b"),
    "2": document.getElementById("task-2"),
}

task_buttons["off"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "off"})
})
task_buttons["1A"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "1A"})
})
task_buttons["1B"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "1B"})
})
task_buttons["2"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "2"})
})

var next_button = document.getElementById("next");
next_button.addEventListener("click", goNext)

var step_text = document.getElementById("step");
var status_text = document.getElementById("status");
var boardviz_text = document.getElementById("boardviz");
var comp_text = document.getElementById("comp");

var custom_input = document.getElementById("custom-input");
custom_input.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
        submitCustom();
    }
})
var custom_submit = document.getElementById("custom-btn");
custom_submit.addEventListener("click", submitCustom);

window.addEventListener("keydown", (evt) => {
    if (evt.key == "n" && document.activeElement !== custom_input) {
        goNext();
    }
})


var timer_text = document.getElementById("timer-text");
var timer_btn = document.getElementById("timer-btn");

const TIMER_HZ = 20;
var timer_on = false;
var timer_task = null;
var timer_val = 0;
timer_btn.addEventListener("click", () => {
    socket.emit("study-event", {"event": "timer", "turn_on": !timer_on})
})


var probe_btn = document.getElementById("probe-btn");
var probe_x = document.getElementById("probe-x-off");
var probe_y = document.getElementById("probe-y-off");

var probe_key_adjust = false;
var probe_adjust = {
    "x": 0,
    "y": 0
}

probe_btn.addEventListener("click", () => {
    probe_key_adjust = !probe_key_adjust;
    if (probe_key_adjust) {
        probe_btn.innerText = "On";
        probe_btn.classList.add("selected");
    } else {
        probe_btn.innerText = "Off";
        probe_btn.classList.remove("selected");
    }
});

window.addEventListener("keydown", (evt) => {
    if  (document.activeElement === custom_input) {
        return;
    }
    var did_something = false;
    switch (evt.key) {
        case "w":
            // -y
            probe_adjust.y -= 0.1;
            did_something = true;
            break;
        case "s":
            // +y
            probe_adjust.y += 0.1;
            did_something = true;
            break;
        case "a":
            // -x
            probe_adjust.x -= 0.1;
            did_something = true;
            break;
        case "d":
            // +x
            probe_adjust.x += 0.1;
            did_something = true;
            break;
    }
    if (did_something) {
        socket.emit("probe-adjust", probe_adjust)
    }
})

function probeListener(evt) {
    if (evt.key === "Enter") {
        var xoff = parseFloat(probe_x.value);
        var yoff = parseFloat(probe_y.value);
        if (isNaN(xoff)) xoff = 0;
        if (isNaN(yoff)) yoff = 0;
        socket.emit("probe-adjust", {"x": xoff, "y": yoff})
    }
}
probe_x.addEventListener("keydown", probeListener)
probe_y.addEventListener("keydown", probeListener)


function goNext() {
    socket.emit("study-event", {"event": "step"});
}

function submitCustom() {
    var custom_input = document.getElementById("custom-input");
    socket.emit("study-event", {"event": "note", "note": custom_input.value});
    custom_input.value = "";
}


function displaySeconds(time, decimal=3) {
    var mins = Math.floor(time / 60);
    var secs = time % 60;
    if (mins < 10) mins = "0" + mins;
    if (secs < 10) secs = "0" + secs.toFixed(decimal);
    else secs = secs.toFixed(decimal);
    return `${mins}:${secs}`;
}

socket.on("study-event", (data) => {
    // console.log(data)
    switch (data.event) {
        case "task":
            for (task in task_buttons) {
                task_buttons[task].classList.remove("selected");
            }
            task_buttons[data.task].classList.add("selected");
            if (data.task == "off" || data.task == "2") {
                step_text.firstChild.textContent = "Step N/A";
                status_text.innerText = "";
            } else {
                step_text.firstChild.textContent = "Ready to Start";
                next_button.innerText = "Start";
                status_text.innerText = "";
            }
            break;
        case "highlight":
            step_text.firstChild.textContent = `Step ${data.step + 1}`;
            next_button.innerText = "Skip";
            status_text.innerText = "In-Progress";
            boardviz_text.innerText = data.boardviz ? "On" : "Off";
            comp_text.innerText = data.ref;
            break;
        case "success":
            status_text.innerText = "Complete";
            next_button.innerText = "Next";
            break;
        case "timer":
            timer_on = data.on;
            if (data.on) {
                timer_btn.innerText = "Stop";
                timer_val = 0;
                if (timer_task === null) {
                    timer_task = window.setInterval(() => {
                        timer_val += 1 / TIMER_HZ;
                        timer_text.innerText = displaySeconds(timer_val);
                    }, 1000 / TIMER_HZ)
                }
            } else {
                timer_btn.innerText = "Start";
                clearInterval(timer_task);
                timer_task = null;
                timer_text.innerText = displaySeconds(data.time);
            }
            break;
        case "settings":
            if (data.first_with) {
                first_with[data.task].with.classList.add("selected");
                first_with[data.task].without.classList.remove("selected");
            } else {
                first_with[data.task].with.classList.remove("selected");
                first_with[data.task].without.classList.add("selected");
            }
            break;
        default:
            console.log(data);
            break;
    }
})

socket.on("probe-adjust", (data) => {
    probe_adjust = data;
    probe_x.value = data.x.toFixed(1);
    probe_y.value = data.y.toFixed(1);
})
