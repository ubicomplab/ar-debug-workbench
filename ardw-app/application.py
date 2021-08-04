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
        splitjs=url_for("static", filename="split.min.js"),
        socketiojs=url_for("static", filename="socket.io.min.js"),
        utiljs=url_for("static", filename="util.js"),
        selectionjs=url_for("static", filename="selection.js"),
        renderjs=url_for("static", filename="render.js"),
        mainjs=url_for("static", filename="main.js")
    )

@app.route("/projector")
def projector_page():
    return render_template(
        "projector.html",
        css=url_for("static", filename="style.css"),
        icon=url_for("static", filename="favicon.ico"),
        renderjs=url_for("static", filename="render.js"),
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


active_connections = 0

# Server tracks current selections and settings
selection = {
    "comp": -1,
    "pin": -1,
    "net": None
}
# for now keeping settings local
app_settings = {}
ibom_settings = {}
# Server tracks connected tools
tools = {
    "ptr": None,
    "dmm": None,
    "osc": None
}

@socketio.on("connect")
def handle_connect():
    global active_connections, selection
    active_connections += 1
    logging.info(f"Client connected ({active_connections} active)")

    if selection["comp"] != -1:
        emit("selection", { "type": "comp", "val": selection["comp"] })
    elif selection["pin"] != -1:
        emit("selection", { "type": "pin", "val": selection["pin"] })
    elif selection["net"] != None:
        emit("selection", { "type": "net", "val": selection["net"] })

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

@socketio.on("tool-add")
def handle_tool_req(tooltype):
    logging.info(f"Received request for tool type {tooltype}")
    if tooltype not in tools:
        emit("tool-add", { "status": "invalid", "type": None })
    elif tools[tooltype] is not None:
        emit("tool-add", { "status": "exists", "type": tooltype })
    else:
        tools[tooltype] = ExampleTool()
        emit("tool-add", { "status": "added", "type": tooltype })

@socketio.on("tool-measure")
def handle_tool_measure(tooltype):
    global tools
    logging.info(f"Measure tool {tooltype}")
    if tooltype in tools and tools[tooltype] is not None:
        val = tools[tooltype].measure()
        # only send back to client that requested it
        emit("tool-measure", { "status": "good", "type": tooltype, "val": val })

if __name__=="__main__":
    socketio.run(app, debug=True)