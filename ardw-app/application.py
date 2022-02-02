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
import struct
import socket
import threading
import numpy as np

from example_tool import ExampleTool
from tools import DebugCard, DebugSession

from boardgeometry.hitscan import hitscan


def listen_udp():
    global socketio

    sock = socket.socket(family=socket.AF_INET, type=socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 8052))

    #TODO: add in some mechanism to enfore frame rate limit
    framerate = 60 #fps
    time_to_wait = 2.
    threshold = 5 #pixels

    # N element array of historical tippos_pixel_coord
    # first element is oldest, last element is newest
    tippos_pixel_coords = np.arange(time_to_wait * framerate * 2).reshape(2, time_to_wait * framerate)

    while True:
        data, addr = sock.recvfrom(1024)
        var = struct.unpack("f" * 8, data)
        tippos_pixel_coord = np.array([var[0], var[1]])
        tippos_opti_coord = [var[2], var[3], var[4]]
        tippos_opti_coord = [var[5, var[6], var[7]]]

        # logic for whether last 50 tippos coords in the same
        tippos_pixel_coords = np.roll(tippos_pixel_coords, -1, axis = 1)
        tippos_pixel_coords[:, -1] = tippos_pixel_coord

        # if all the values within tippos_pixel_coords are similar enough
        if np.all( np.linalg.norm(np.transpose(tippos_pixel_coords) - np.tile(tippos_pixel_coords[:,0], (time_to_wait * framerate,1)), axis = 1) <= threshold):
            # it's been in the same place
            print("no movement")

        
        tippos_pixel_coord_dict = {"x": var[0], "y": var[1]}
        tippos_opti_coord_dict = {"x": var[2], "y": var[3], "z": var[4]}
        endpos_opti_coord_dict = {"x": var[5], "y": var[6], "z": var[7]}
        socketio.emit("udp", tippos_pixel_coord_dict)


if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    app = Flask(__name__, template_folder=template_folder)
else:
    app = Flask(__name__)


# magical fix from stack overflow:
# https://stackoverflow.com/questions/34581255/python-flask-socketio-send-message-from-thread-not-always-working
import eventlet
eventlet.monkey_patch()

app.config["SECRET_KEY"] = "secret!"
socketio = SocketIO(app, async_mode="eventlet")
thread = None

# -- app routing --
@app.route("/")
def index():
    global thread
    if thread is None:
        print("starting thread")
        thread = threading.Thread(target=listen_udp)
        thread.daemon = True
        thread.start()

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
    global thread
    if thread is None:
        print("starting thread")
        thread = threading.Thread(target=listen_udp)
        thread.daemon = True
        thread.start()

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


@app.route("/tool-debug")
def tool_debug_page():
    return render_template(
        "tool-test.html",
        js=url_for("static", filename="tool-test.js"),
        socketiojs=url_for("static", filename="socket.io.min.js")
    )


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


@app.route("/schdata")
def get_schdata():
    return json.dumps(schdata)


@app.route("/pcbdata")
def get_pcbdata():
    # for some reason pcbdata is getting modified by hitscan, even though it shouldn't
    # TODO find root issue
    with open("./data/pcbdata.json", "r") as pcbfile:
        return json.dumps(json.load(pcbfile))

    # return json.dumps(pcbdata)


@app.route("/datadicts")
def get_datadicts():
    return json.dumps({
        "schid_to_idx": schid_to_idx,
        "ref_to_id": ref_to_id,
        "pinref_to_idx": pinref_to_idx,
        "compdict": compdict,
        "netdict": netdict,
        "pindict": pindict
    })

# -- end app routing --

# -- socket --


@socketio.on("connect")
def handle_connect():
    global active_connections, selection, projector_mode, projector_calibration, active_session

    active_connections += 1
    logging.info(f"Client connected ({active_connections} active)")

    for k, v in selection.items():
        if v is not None:
            emit("selection", {"type": k, "val": v})
            break

    emit("projector-mode", projector_mode)
    for k, v in projector_calibration.items():
        emit("projector-adjust", {"type": k, "val": v})

    for tool in tools:
        for val, ready in tools[tool]["ready-elements"].items():
            if ready:
                emit("tool-connect", {"type": tool,
                     "val": val, "status": "success"})

    if active_session is not None:
        data = active_session.asdict()
        data["event"] = "new"
        emit("debug-session", data)

        for i in range(len(active_session.cards)):
            data = {
                "event": "custom",
                "card": active_session.cards[i].asdict(),
                "id": i
            }
            emit("debug-session", data)


@socketio.on("disconnect")
def handle_disconnect():
    global active_connections
    active_connections -= 1
    logging.info(f"Client disconnected ({active_connections} active)")

"""
@socketio.on("selection")
def handle_selection(new_selection):
    global selection
    logging.info(f"Received selection update {new_selection}")
    selection["comp"] = None
    selection["pin"] = None
    selection["net"] = None
    if (new_selection["type"] != "deselect"):
        selection[new_selection["type"]] = new_selection["val"]
    socketio.emit("selection", new_selection)
"""

@socketio.on("selection")
def handle_wip_selection(data):
    logging.info(f"Socket received selection {data}")
    process_selection(data)


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


@socketio.on("debug-session")
def handle_debug_session(data):
    global session_history
    global active_session
    global active_session_is_recording

    logging.info(f"Received debug session event {data}")

    if active_session is None:
        # if we don't have a session, start a new one
        active_session = DebugSession()
        newdata = active_session.asdict()
        newdata["event"] = "new"
        socketio.emit("debug-session", newdata)

    if data["event"] == "edit":
        # client is editing name or notes
        active_session.name = data["name"]
        active_session.notes = data["notes"]
        newdata = active_session.asdict()
        newdata["event"] = "edit"
        socketio.emit("debug-session", newdata)
    elif data["event"] == "custom":
        # client is sending a new custom card
        card = DebugCard(
            data["card"]["pos"],
            data["card"]["neg"],
            data["card"]["val"],
            data["card"]["unit"],
            data["card"]["lo"],
            data["card"]["hi"]
        )
        if active_session.has(card, exact=True) != -1:
            logging.error("Request for custom card that already exists")
        else:
            # for now, allow adding custom card w/ unit after adding same card w/o unit
            newdata = {
                "event": "custom",
                "update": False,
                "id": len(active_session.cards),
                "card": card.asdict()
            }
            active_session.cards.append(card)
            socketio.emit("debug-session", newdata)
    elif data["event"] == "record":
        # client is turning recording on or off
        if data["record"] != active_session_is_recording:
            active_session_is_recording = data["record"]
            socketio.emit("debug-session", data)
            # TODO highlight or deselect next custom card as necessary
    elif data["event"] == "save":
        # client wants to save and exit session
        session_history.append(active_session)
        active_session = None
        active_session_is_recording = False
        # tell client how many sessions are saved
        data["count"] = len(session_history)
        socketio.emit("debug-session", data)
    elif data["event"] == "export":
        # client wants to export
        logging.info("Session export is WIP")


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

@socketio.on("debug")
def handle_debug(data):
    print(data)


@socketio.on("python hitscan")
def handle_python_hitscan(data):
    python_hits = hitscan(data["point"][0], data["point"][1], pcbdata,
                          pinref_to_idx, layer=data["layer"], renderPads=True, renderTracks=False)
    logging.info(f"expected hits: {data['hits']}")
    logging.info(f"  actual hits: {python_hits}")
# -- end socket --


# moved from util.js to keep main data on server rather than client
# takes raw pcbdata and schdata and populates the various dictionaries
# that server needs to hitscan and client needs to render
# TODO would be much cleaner if we actually defined classes for the data
def init_data(pcbdata, schdata):
    # ref : refid
    ref_to_id = dict()

    # schid : idx in schdata["schematics"]
    schid_to_idx = dict()

    # refid : ref, schids=[schid], units={unitnum : schid, bbox, pins=[pin]}
    #   where pin={name, num, pos, end, schid, ref, net}
    # Note that pins from schdata only contain the first four fields
    compdict = dict()

    # netname : schids=[schid], pins=[pinidx]
    netdict = dict()

    # '<compref>.<pinnum>' : pinidx
    pinref_to_idx = dict()

    # pinidx : {ref, name, num, pos, schid, net}
    # Note: 'dict' is a misnomer, but it still functions as one
    pindict = []

    for bomentry in pcbdata["bom"]["both"]:
        for ref in bomentry[3]:
            # TODO make sure types are okay
            ref_to_id[ref[0]] = ref[1]

    for i, schematic in enumerate(schdata["schematics"]):
        schid = int(schematic["orderpos"]["sheet"])
        schid_to_idx[schid] = i  # schematics may be out of order
        if "components" not in schematic:
            logging.warning(f"Schematic {schid} has no components")
            continue

        for comp in schematic["components"]:
            if comp["ref"] not in ref_to_id:
                logging.warning(
                    f"Component {comp['ref']} is in schematic but not in layout")
                continue

            refid = ref_to_id[comp["ref"]]
            unitnum = int(comp["unit"])
            if refid not in compdict:
                compdict[refid] = {
                    "ref": comp["ref"],
                    "libcomp": comp["libcomp"],
                    "schids": [schid],
                    "units": dict()
                }
            else:
                if unitnum in compdict[refid]["units"]:
                    logging.warning(
                        f"Component {comp['ref']} has unit {unitnum} multiple times, ignoring repeat")
                    continue
                if schid not in compdict[refid]["schids"]:
                    compdict[refid]["schids"].append(schid)

            compdict[refid]["units"][unitnum] = {
                "num": unitnum,
                "schid": schid,
                "bbox": comp["bbox"],
                "pins": comp["pins"]
            }

    for netinfo in schdata["nets"]:
        schids = set()
        for netpin in netinfo["pins"]:
            if netpin["ref"] not in ref_to_id:
                logging.warning(
                    f"ref {netpin['ref']} with a pin in net {netinfo['name']} is unknown, ignoring")
                continue

            refid = ref_to_id[netpin["ref"]]
            for unitnum in compdict[refid]["units"]:
                for unitpin in compdict[refid]["units"][unitnum]["pins"]:
                    unitpin["net"] = netinfo["name"]
                    schids.add(compdict[refid]["units"][unitnum]["schid"])
        if len(schids) == 0:
            logging.warning(f"{netinfo['name']} has no valid pins")
        else:
            netdict[netinfo["name"]] = {
                "schids": list(schids),
                "pins": []  # will be populated next
            }

    for refid, comp in compdict.items():
        for unitnum, unit in comp["units"].items():
            for pin in unit["pins"]:
                pin["ref"] = comp["ref"]
                pin["schid"] = unit["schid"]
                if "net" not in pin:
                    pin["net"] = None
                else:
                    netdict[pin["net"]]["pins"].append(len(pindict))
                pin_name = f"{pin['ref']}.{pin['num']}"
                if pin_name not in pinref_to_idx:
                    pinref_to_idx[pin_name] = len(pindict)
                else:
                    logging.warning(f"pin name {pin_name} is not unique")
                pindict.append(pin)

    return schid_to_idx, ref_to_id, pinref_to_idx, compdict, netdict, pindict

# handles a selection event, which can come from the client or from optitrack
def process_selection(data):
    if "point" in data:
        # a point/click
        hits = hitscan(data["point"][0], data["point"][1], pcbdata,
                       pinref_to_idx, layer=data["layer"], renderPads=data["pads"], renderTracks=data["tracks"])
        if len(hits) == 1:
            # single selection
            make_selection(hits[0])
        elif len(hits) > 1:
            # multi selection for client to disambiguate
            socketio.emit(
                "selection", {"type": "multi", "point": data["point"], "layer": data["layer"], "hits": hits})
        else:
            make_selection({"type": "deselect", "val": None})
    else:
        # choice made from schematic or disambiguation menu, simply echo back to all clients
        make_selection(data)

def make_selection(new_selection):
    global selection
    logging.info(f"Making selection {new_selection}")
    selection["comp"] = None
    selection["pin"] = None
    selection["net"] = None
    if (new_selection["type"] != "deselect"):
        selection[new_selection["type"]] = new_selection["val"]
    socketio.emit("selection", new_selection)


if __name__ == "__main__":
    logging.basicConfig(
        filename="ardw.log",
        # filemode="w",
        # encoding="utf-8",
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

    # dictionaries from util.js
    # see init_data() for documentation
    schid_to_idx, ref_to_id, pinref_to_idx, compdict, netdict, pindict = init_data(
        pcbdata, schdata)

    active_connections = 0

    # Server tracks current selections and settings
    selection = {
        "comp": None,
        "pin": None,
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

    # list of DebugSession
    session_history: list[DebugSession] = []

    active_session: DebugSession = None

    # if True, measurements are added to the current session and the next custom card is highlighted
    # if False, measurements are ignored and custom cards are not highlighted
    active_session_is_recording = False

    port = 5000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])

    socketio.run(app, port=port, debug=True)

