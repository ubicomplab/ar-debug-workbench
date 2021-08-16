from flask import Flask
from flask import render_template, send_from_directory
from flask.helpers import url_for
from flask_socketio import SocketIO
from flask_socketio import emit

import json
import logging
import os
import re
import sys

from example_tool import ExampleTool


logging.basicConfig(
    filename="ardw.log",
    filemode="w",
    encoding="utf-8",
    level="DEBUG",
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logging.info("Server started")

schdata = None
pcbdata = None

with open("./data/schdata.json", "r") as schfile:
    schdata = json.load(schfile)

with open("./data/pcbdata.json", "r") as pcbfile:
    pcbdata = json.load(pcbfile)

if schdata is None or pcbdata is None:
    logging.error("Failed to load sch or pcb data, exiting...")
    exit()

num_schematics = schdata["schematics"][0]["orderpos"]["total"]

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    app = Flask(__name__, template_folder=template_folder)
else:
    app = Flask(__name__)

app.config["SECRET_KEY"] = "secret!"
socketio = SocketIO(app)

@app.route("/")
def index():
    return render_template(
        "index.html",
        css=url_for("static", filename="style.css"),
        icon=url_for("static", filename="favicon.ico"),
        main=url_for("main_page"),
        proj=url_for("projector_page"),
        js=url_for("static", filename="index.js")
    )

@app.route("/main")
def main_page():
    return render_template(
        "main.html",
        css=url_for("static", filename="style.css"),
        icon=url_for("static", filename="favicon.ico"),
        socketiojs=url_for("static", filename="socket.io.min.js"),
        splitjs=url_for("static", filename="split.min.js"),
        utiljs=url_for("static", filename="util.js"),
        renderjs=url_for("static", filename="render.js"),
        selectionjs=url_for("static", filename="selection.js"),
        mainjs=url_for("static", filename="main.js")
    )

@app.route("/projector")
def projector_page():
    return render_template(
        "projector.html",
        css=url_for("static", filename="style.css"),
        icon=url_for("static", filename="favicon.ico"),
        socketiojs=url_for("static", filename="socket.io.min.js"),
        utiljs=url_for("static", filename="util.js"),
        renderjs=url_for("static", filename="render.js"),
        selectionjs=url_for("static", filename="selection.js"),
        projjs=url_for("static", filename="projector.js")
    )

@app.route("/schdata")
def get_schdata():
    return json.dumps(schdata)

@app.route("/pcbdata")
def get_pcbdata():
    return json.dumps(pcbdata)

@app.route("/sch<schid>")
def get_schematic_svg(schid):
    schid = int(schid)
    for schematic in schdata["schematics"]:
        if int(schematic["orderpos"]["sheet"]) != schid:
            continue

        filename = str(schematic["name"]).strip() + ".svg"
        dirpath = os.path.join(os.path.realpath("."), "data")

        if not os.path.isfile(os.path.join(dirpath, filename)):
            # Kicad creates complicated svg file names for additional sheets
            for candidate in os.listdir(dirpath):
                pattern = str(schematic["name"]) + "-.*\.svg"
                if re.search(pattern, candidate) is not None:
                    filename = candidate
                    break

        if not os.path.isfile(os.path.join(dirpath, filename)):
            logging.error(f"Missing file for schid {schid}")
        else:
            return send_from_directory(dirpath, filename)
    return ""

@app.route("/tool-debug")
def tool_debug_page():
    return render_template(
        "tool-test.html",
        js=url_for("static", filename="tool-test.js"),
        socketiojs=url_for("static", filename="socket.io.min.js")
    )


active_connections = 0

# Server tracks current selections and settings
selection = {
    "comp": -1,
    "pin": -1,
    "net": None
}
app_settings = {}
projector_mode = "calibrate"
projector_calibration = {
    "tx": 0,
    "ty": 0,
    "r": 0,
    "z": 1
}
ibom_settings = {}

# Server tracks connected tools
tools = {
    "ptr": {
        "ready": False,
        "thread": None,
        "ready-elements": {
            "device": False
        }
    },
    "dmm": {
        "ready": False,
        "thread": None,
        "ready-elements": {
            "device": False,
            "pos": False,
            "neg": False
        }
    },
    "osc": {
        "ready": False,
        "thread": None,
        "ready-elements": {
            "device": False,
            "1": False,
            "2": False,
            "3": False,
            "4": False
        }
    }
}

@socketio.on("connect")
def handle_connect():
    global active_connections, selection, projector_mode, projector_calibration

    active_connections += 1
    logging.info(f"Client connected ({active_connections} active)")

    if selection["comp"] != -1:
        emit("selection", { "type": "comp", "val": selection["comp"] })
    elif selection["pin"] != -1:
        emit("selection", { "type": "pin", "val": selection["pin"] })
    elif selection["net"] != None:
        emit("selection", { "type": "net", "val": selection["net"] })

    emit("projector-mode", projector_mode)
    for k, v in projector_calibration.items():
        emit("projector-adjust", { "type": k, "val": v })

    for tool in tools:
        for val, ready in tools[tool]["ready-elements"].items():
            if ready:
                emit("tool-connect", { "type": tool, "val": val, "status": "success" })

@socketio.on("disconnect")
def handle_disconnect():
    global active_connections
    active_connections -= 1
    logging.info(f"Client disconnected ({active_connections} active)")

@socketio.on("selection")
def handle_selection(new_selection):
    global selection
    logging.info(f"Received selection update {new_selection}")
    selection["comp"] = -1
    selection["pin"] = -1
    selection["net"] = None
    if (new_selection["type"] != "deselect"):
        selection[new_selection["type"]] = new_selection["val"]
    socketio.emit("selection", new_selection)

@socketio.on("projector-mode")
def handle_projectormode(mode):
    global projector_mode
    logging.info(f"Changing projector mode to {mode}")
    projector_mode = mode
    socketio.emit("projector-mode", mode)

@socketio.on("projector-adjust")
def handle_projector_adjust(adjust):
    global projector_calibration
    logging.info(f"Received projector adjust {adjust}")
    projector_calibration[adjust["type"]] = adjust["val"]
    socketio.emit("projector-adjust", adjust)

@socketio.on("tool-request")
def handle_tool_request(data):
    global tools
    logging.info(f"Received tool request {data}")
    if tools[data["type"]]["ready"]:
        logging.info(f"Tool is already active")
        # TODO maybe send connection information back to client
        # TODO note that tool doesn't need to be ready, just needs to have already been requested
    else:
        logging.info(f"Adding tool; TODO")
        # tools[data["type"]]["ready"] = True
        # TODO process different kinds of requests (val=dev,pos,neg,1,2,3,4)
        socketio.emit("tool-request", data)

@socketio.on("tool-debug")
def handle_tool_debug(data):
    global tools
    logging.info(f"Received tool debug msg {data}")
    name = data.pop("name")
    if name == "log":
        logging.info(str(tools))
    else:
        if data["status"] == "success":
            tools[data["type"]]["ready-elements"][data["val"]] = True
            allready = True
            for ready in tools[data["type"]]["ready-elements"].values():
                if not ready:
                    allready = False
                    break
            tools[data["type"]]["ready"] = allready
            
        socketio.emit(name, data)


if __name__=="__main__":
    port = 5000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
        
    socketio.run(app, port=port, debug=True)