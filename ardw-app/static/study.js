var socket = io();

selected_task = "1a";

task_buttons = {
    "off": document.getElementById("task-off"),
    "1a": document.getElementById("task-1a"),
    "1b": document.getElementById("task-1b"),
    "2": document.getElementById("task-2"),
}

task_buttons["off"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "off"})
})
task_buttons["1a"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "1a"})
})
task_buttons["1b"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "1b"})
})
task_buttons["2"].addEventListener("click", () => {
    socket.emit("study-event", {"event": "task", "task": "2"})
})

socket.on("study-event", (data) => {
    if (data.event == "task") {
        for (task in task_buttons) {
            task_buttons[task].classList.remove("selected");
        }
        task_buttons[data.task].classList.add("selected");
    }
})