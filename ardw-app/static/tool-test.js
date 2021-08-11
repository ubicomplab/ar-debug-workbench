
var socket = io();

window.onload = () => {
    document.getElementById("ptr-conn").addEventListener("click", () => {
        var data = {
            "name": "tool-connect",
            "type": "ptr"
        };
        socket.emit("tool-debug", data);
    });
    document.getElementById("ptr-select").addEventListener("click", () => {
        var data = {
            "name": "tool-measure",
            "type": "ptr",
            "coords": {
                "x": 100,
                "y": 100,
            }
        };
        console.log(data);
        socket.emit("tool-debug", data);
    });
    document.getElementById("dmm-conn").addEventListener("click", () => {
        var data = {
            "name": "tool-connect",
            "type": "dmm",
            "val": "dmm"
        };
        socket.emit("tool-debug", data);
    });
    document.getElementById("dmm-red-conn").addEventListener("click", () => {
        var data = {
            "name": "tool-connect",
            "type": "dmm",
            "val": "pos"
        };
        console.log(data);
        socket.emit("tool-debug", data);
    });
    document.getElementById("dmm-black-conn").addEventListener("click", () => {
        var data = {
            "name": "tool-connect",
            "type": "dmm",
            "val": "neg"
        };
        console.log(data);
        socket.emit("tool-debug", data);
    });
    document.getElementById("dmm-measure").addEventListener("click", () => {
        var data = {
            "name": "tool-measure",
            "type": "dmm",
            "val": 5.2,
            "unit": "V",
            "pos_coords": {
                "x": 100,
                "y": 100,
            },
            "neg_coords": {
                "x": 50,
                "y": 200
            }
        };
        console.log(data);
        socket.emit("tool-debug", data);
    });
};
