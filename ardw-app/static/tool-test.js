
var socket = io();

window.onload = () => {
  document.getElementById("log").addEventListener("click", () => {
    socket.emit("tool-debug", { "name": "log" });
  });
  document.getElementById("ptr-conn").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "ptr",
      "val": "device",
      "status": "success"
    };
    socket.emit("tool-debug", data);
  });
  document.getElementById("ptr-conn-fail").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "ptr",
      "val": "device",
      "status": "fail"
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
    socket.emit("tool-debug", data);
  });
  document.getElementById("dmm-conn").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "dmm",
      "val": "device",
      "status": "success"
    };
    socket.emit("tool-debug", data);
  });
  document.getElementById("dmm-red-conn").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "dmm",
      "val": "pos",
      "status": "success"
    };
    socket.emit("tool-debug", data);
  });
  document.getElementById("dmm-black-conn").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "dmm",
      "val": "neg",
      "status": "success"
    };
    socket.emit("tool-debug", data);
  });
  document.getElementById("dmm-conn-fail").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "dmm",
      "val": "device",
      "status": "fail"
    };
    socket.emit("tool-debug", data);
  });
  document.getElementById("dmm-red-conn-fail").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "dmm",
      "val": "pos",
      "status": "fail"
    };
    socket.emit("tool-debug", data);
  });
  document.getElementById("dmm-black-conn-fail").addEventListener("click", () => {
    var data = {
      "name": "tool-connect",
      "type": "dmm",
      "val": "neg",
      "status": "fail"
    };
    socket.emit("tool-debug", data);
  });
  document.getElementById("dmm-measure").addEventListener("click", () => {
    var data = {
      "name": "measurement",
      "measurement": {
        "device": "dmm",
        "pos": {
          "type": "pin",
          "val": 148
        },
        "neg": {
          "type": "pin",
          "val": 124
        },
        "unit": "V",
        "val": 5.2
      }
    }
    console.log(data);
    socket.emit("tool-debug", data);
  });
};
