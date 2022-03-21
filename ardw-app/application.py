from flask import Flask
from flask import render_template, send_from_directory, Response
from flask.helpers import url_for
from flask_socketio import SocketIO
from flask_socketio import emit

import configparser
import json
import logging
import os
import re
import sys
import struct
import socket
import threading
import time

import numpy as np
from shapely.geometry import Point
from shapely.affinity import rotate

from tools import DebugCard, DebugSession
from instrumentscripts.scpi_read_flask import initializeInstruments, queryValue
from boardgeometry.hitscan import hitscan


logging.basicConfig(
    filename="ardw.log",
    filemode="w",
    # encoding="utf-8",
    level="DEBUG",
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logging.info("Server started")

# config file is split into the following sections:
# Server, Optitrack, Dev
config = configparser.ConfigParser()
config.read("config.ini")


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
        tool=url_for("tool_debug_page"),
        study=url_for("study_page"),
        instr=url_for("instrument_panel"),
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


@app.route("/study")
def study_page():
    return render_template(
        "study.html",
        css=url_for("static", filename="style.css"),
        icon=url_for("static", filename="favicon.ico"),
        js=url_for("static", filename="study.js"),
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


@app.route("/queryValue/<function>")
def query_value(instrumentType="dmm", function="no_function"):
    return Response("404", mimetype='text')
    # return queryValue(instrumentType, function)


@app.route("/instrument_panel")
def instrument_panel():
    return render_template(
        "instrument_panel.html",
        query=url_for("query_value", function=""),
        freq=config.getint("Study", "DmmPanelRefreshFrequency")
    )


# -- end app routing --

# -- socket --
@socketio.on("connect")
def handle_connect():
    global active_connections
    global selection
    global projector_mode, projector_calibration, board_pos
    global active_session, active_session_is_recording
    global study_state, study_settings, compdict

    active_connections += 1
    logging.info(f"Client connected ({active_connections} active)")

    for k, v in selection.items():
        if v is not None:
            emit("selection", {"type": k, "val": v})

    for device, sel in tool_selections.items():
        if sel is not None:
            emit("tool-selection", {"device": device, "selection": sel})

    emit("projector-mode", projector_mode)
    for k, v in projector_calibration.items():
        emit("projector-adjust", {"type": k, "val": v})

    final_pos = {
        "tx": board_pos["x"] + projector_calibration["tx"],
        "ty": board_pos["y"] + projector_calibration["ty"],
        "r": board_pos["r"] + projector_calibration["r"],
        "z": projector_calibration["z"]
    }
    emit("board-update", final_pos)

    for tool in tools:
        for val, ready in tools[tool]["ready-elements"].items():
            if ready:
                emit("tool-connect", {"type": tool,
                     "val": val, "ready": tools[tool]["ready"]})

    if active_session is not None:
        data = active_session.to_dict()
        data["event"] = "new"
        emit("debug-session", data)

        for i, card in enumerate(active_session.cards):
            data = {
                "event": "custom",
                "card": card.to_dict(),
                "id": i
            }
            emit("debug-session", data)

        nextid, nextcard = active_session.get_next()
        if nextid != -1:
            emit("debug-session", {"event": "next", "id": nextid, "card": nextcard.to_dict()})

    if active_session_is_recording:
        emit("debug-session", {"event": "record", "record": "true"})

    if study_state["active"]:
        step = study_state["step"]
        task = study_state["task"]
        refid = study_state["current_modules"][step]
        ref = compdict[refid]["ref"]

        emit("study-event", {"event": "task", "task": task})
        if step > -1:
            emit("study-event", {
                "event": "highlight",
                "task": task,
                "refid": refid,
                "ref": ref,
                "boardviz": study_state["boardviz"],
                "step": step
            })
            if study_state["step_done"]:
                emit("study-event", {"event": "success", "refid": refid, "task": task})

    for task, val in study_settings["WithBoardVizFirst"].items():
        emit("study-event", {"event": "settings", "task": task, "first_with": val})

    # not sure if there's a better way to avoid spamming all clients every time one connects
    emit("config", {
        "devices": {
            "probe": [config.get("Rendering", "ProbeDotColor"), config.get("Rendering", "ProbeSelectionColor")],
            "pos": [config.get("Rendering", "DmmPosDotColor"), config.get("Rendering", "DmmPosSelectionColor")],
            "neg": [config.get("Rendering", "DmmNegDotColor"), config.get("Rendering", "DmmNegSelectionColor")],
            "osc": [config.get("Rendering", "OscDotColor"), config.get("Rendering", "OscSelectionColor")],
        },
        "track_board": config.getboolean("Dev", "TrackBoard"),
        "dmmpanel": config.getint("Study", "DmmPanelRefreshFrequency"),
    })


@socketio.on("disconnect")
def handle_disconnect():
    global active_connections
    active_connections -= 1
    logging.info(f"Client disconnected ({active_connections} active)")


@socketio.on("selection")
def handle_selection(data):
    logging.info(f"Socket received selection {data}")
    #process_selection(data)
    client_selection(data)


@socketio.on("projector-mode")
def handle_projectormode(mode):
    global projector_mode
    logging.info(f"Changing projector mode to {mode}")
    projector_mode = mode
    socketio.emit("projector-mode", mode)


@socketio.on("projector-adjust")
def handle_projector_adjust(adjust):
    global projector_calibration, board_pos
    projector_calibration[adjust["type"]] = adjust["val"]
    update_reselection_zone()
    socketio.emit("projector-adjust", adjust)

    # projector-adjust also changes final board position
    final_pos = {
        "tx": board_pos["x"] + projector_calibration["tx"],
        "ty": board_pos["y"] + projector_calibration["ty"],
        "r": board_pos["r"] + projector_calibration["r"],
        "z": projector_calibration["z"]
    }
    socketio.emit("board-update", final_pos)


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
        tools[data["type"]]["ready"] = True
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
        newdata = active_session.to_dict()
        newdata["event"] = "new"
        socketio.emit("debug-session", newdata)

    if data["event"] == "edit":
        # client is editing name or notes
        active_session.name = data["name"]
        active_session.notes = data["notes"]
        newdata = active_session.to_dict()
        newdata["event"] = "edit"
        socketio.emit("debug-session", newdata)
    elif data["event"] == "custom":
        # client is sending a new custom card
        card = DebugCard(**data["card"])
        i = active_session.add_card(card)

        # for now, just add the card without checking for duplicates
        socketio.emit("debug-session", {
            "event": "custom",
            "update": False,
            "id": i,
            "card": card.to_dict()
        })

        nextid, nextcard = active_session.get_next()
        if nextid != -1:
            socketio.emit("debug-session", {"event": "next", "id": nextid, "card": nextcard.to_dict()})
    elif data["event"] == "record":
        # client is turning recording on or off
        if data["record"] != active_session_is_recording:
            active_session_is_recording = data["record"]
            socketio.emit("debug-session", data)

            nextid, nextcard = active_session.get_next()
            if nextid != -1:
                socketio.emit("debug-session", {"event": "next", "id": nextid, "card": nextcard.to_dict()})
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
        active_session.export()


@socketio.on("tool-debug")
def handle_tool_debug(data):
    # the tool-debug message imitates server-initiated behavior
    global tools
    logging.info(f"Received tool debug msg {data}")
    name = data.pop("name")
    if name == "log":
        logging.info(str(tools))
    elif name == "tool-connect":
        tool_connect(data["type"], data["val"])
    elif name == "measurement":
        tool_measure(**data["measurement"])


@socketio.on("study-event")
def handle_study_event(data):
    global study_state, study_timer, study_modules, study_bringup, study_settings, compdict

    if len(study_modules) == 0:
        logging.error("Received study event, but modules failed to initialize, ignoring")
        return

    if data["event"] == "task":
        if data["task"] == "off":
            study_log("Turning study mode off")
            study_state["active"] = False
            study_state["task"] = None
        else:
            study_log(f"Switching study task to {data['task']}")
            study_state["active"] = True
            study_state["task"] = data["task"]

            if data["task"] == "2":
                if not study_settings["CanRunTask2"]:
                    logging.warning("Tried to activate Task 2, but bring-up list was invalid")
                    study_state["active"] = False
                    return

                # activate debug session and load card preset
                # negative probe should always be on GND
                # unit is always volts
                for netname in study_bringup:
                    new_card = {
                        "device": "dmm",
                        "pos": {
                        "type": "net",
                        "val": netname
                        },
                        "neg": {
                        "type": "net",
                        "val": "GND"
                        },
                        "unit": "V",
                        "val": None,
                        "lo": None,
                        "hi": None
                    }
                    handle_debug_session({"event": "custom", "card": new_card})
            else:
                if not study_settings["CanRunTask1"]:
                    logging.warning("Tried to activate Task 1, but component list was invalid")
                    study_state["active"] = False
                    return

                # set up modules for task 1a/b
                shuffled = study_modules.copy()
                np.random.shuffle(shuffled)
                study_state["current_modules"] = shuffled
                study_state["step"] = -1
                study_state["step_done"] = True
                # study_state["boardviz"] = config.getboolean("Study", f"Task{data['task']}WithBoardVizFirst")
                study_state["boardviz"] = study_settings["WithBoardVizFirst"][data["task"]]

        socketio.emit("study-event", data)
    elif data["event"] == "step":
        if study_state["active"]:
            # only permit a step if we're actually doing a study

            if not study_state["step_done"]:
                # step is still underway, so this is a "skip"
                study_log("Skip")
                study_state["step_done"] = True
                # highlight the component as if it was successful
                refid = study_state["current_modules"][study_state["step"]]
                socketio.emit("study-event", {"event": "success", "refid": refid, "task": study_state["task"]})
            else:
                # step has been completed, so this is a "next"
                study_state["step"] += 1
                study_state["step_done"] = False
                study_state["step_start"] = time.time()

                step = study_state["step"]
                task = study_state["task"]

                if task == "1A" or task == "1B":
                    if step == len(study_modules) / 2:
                        # study_state["boardviz"] = not config.getboolean("Study", f"Task{task}WithBoardVizFirst")
                        study_state["boardviz"] = not study_settings["WithBoardVizFirst"][data["task"]]
                    elif step == len(study_modules):
                        study_log("Finished")
                        study_state["active"] = False
                        study_state["task"] = None
                        socketio.emit("study-event", {"event": "task", "task": "off"})
                        return
                # TODO similar check for Task 2

                refid = study_state["current_modules"][step]
                ref = compdict[refid]["ref"]

                boardviz_text = "with" if study_state["boardviz"] else "without"
                study_log(f"Component {ref} {boardviz_text} BoardViz")

                socketio.emit("study-event", {
                    "event": "highlight",
                    "task": task,
                    "refid": refid,
                    "ref": ref,
                    "boardviz": study_state["boardviz"],
                    "step": step
                })
    elif data["event"] == "note":
        study_log(f"Custom note: {data['note']}")
    elif data["event"] == "select":
        if study_state["task"] == "1B" and not study_state["boardviz"]:
            # this event should only be sent for Task 1B Without BoardViz
            if "point" in data:
                study_selection("layout", data=data)
            else:
                make_study_select(data["refid"], "schematic click")
    elif data["event"] == "timer":
        display_time = 0
        if data["turn_on"]:
            study_timer["on"] = True
            study_timer["start"] = time.time()
            study_log("Custom timer started")
        else:
            study_timer["on"] = False
            display_time = time.time() - study_timer["start"]
            study_log(f"Custom timer took {display_time:.3f}s")

        socketio.emit("study-event", {"event": "timer", "on": study_timer["on"], "time": display_time})
    elif data["event"] == "settings":
        study_settings["WithBoardVizFirst"][data["task"]] = data["first_with"]
        socketio.emit("study-event", data)


@socketio.on("dmm")
def handle_dmm(data):
    global dmm_mode
    if "mode" in data:
        # client changed mode
        dmm_mode = data["mode"]
        socketio.emit("dmm", data)
    else:
        # client is requesting current value
        unit, val = measure_dmm()
        socketio.emit("dmm", {"unit": unit, "val": val})


@socketio.on("board-update")
def handle_board_update(data):
    global do_board_update

    # client is requesting a one-time board update
    logging.info("One-time board pos update")
    do_board_update = True


@socketio.on("debug")
def handle_debug(data):
    print(data)

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
            try:
                for unitnum in compdict[refid]["units"]:
                    for unitpin in compdict[refid]["units"][unitnum]["pins"]:
                        if netpin["pin"] == unitpin["num"]:
                            unitpin["net"] = netinfo["name"]
                            schids.add(compdict[refid]["units"][unitnum]["schid"])
            except KeyError:
                logging.error(f"KeyError for net {netinfo['name']} ref {netpin['ref']} pin {netpin['pin']}")
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


# converts optitrack pixels to layout mm in 2D
def optitrack_to_layout_coords(point):
    global board_pos, projector_calibration, rotation_center
    x_off = board_pos["x"] + projector_calibration["tx"]
    y_off = board_pos["y"] + projector_calibration["ty"]
    r_off = board_pos["r"] + projector_calibration["r"]
    z_factor = projector_calibration["z"]

    x = point[0] / z_factor - x_off
    y = -point[1] / z_factor - y_off
    sh_point = rotate(Point(x, y), -r_off, origin=rotation_center, use_radians=False)
    return [sh_point.x, sh_point.y]
    # return [sh_point.x / z_factor - x_off, -sh_point.y / z_factor - y_off]


# convert layout mm to optitrack pixels in 2D
def layout_to_optitrack_coords(point):
    global board_pos, projector_calibration, rotation_center
    x_off = board_pos["x"] + projector_calibration["tx"]
    y_off = board_pos["y"] + projector_calibration["ty"]
    r_off = board_pos["r"] + projector_calibration["r"]
    z_factor = projector_calibration["z"]

    sh_point = rotate(Point(point), r_off, origin=rotation_center, use_radians=False)
    result = [sh_point.x, sh_point.y]
    result[0] = (result[0] + x_off) * z_factor
    result[1] = -(result[1] + y_off) * z_factor

    return result


# updates the selection safe zone in place (call any time we transform the projector)
def update_reselection_zone():
    global pcbdata, reselection_zone

    edges = pcbdata["edges_bbox"]
    bounds = [[edges["minx"], edges["miny"]], [edges["maxx"], edges["maxy"]]]
    bounds = np.array([layout_to_optitrack_coords(point) for point in bounds])

    hbuffer = config.getfloat("Optitrack", "ReselectHorizontalBuffer")
    vmin = config.getfloat("Optitrack", "ReselectVerticalMinimum")
    vmax = config.getfloat("Optitrack", "ReselectVerticalMaximum")
    bounds = bounds + np.tile([[-hbuffer], [hbuffer]], 2)
    bounds = np.sort(bounds, axis=0)

    reselection_zone = {
        "x": bounds[:, 0],
        "y": bounds[:, 1],
        "z": [vmin, vmax]
    }


# returns True iff tippos is inside reselection_zone (ignores z if tippos is 2D)
def in_selection_zone(tippos):
    global reselection_zone
    for dim, val in zip(reselection_zone.keys(), tippos):
        if val < reselection_zone[dim][0] or val > reselection_zone[dim][1]:
            return False
    return True


# returns true iff all the points in history are within threshold of refpoint
def history_within_threshold(history, refpoint, threshold):
    #history_len = np.shape(history)[1]
    #return np.all(np.linalg.norm(np.transpose(history) - np.tile(refpoint, (history_len, 1)), axis=1) <= threshold)
    return history_dwellvalue(history, refpoint, threshold) == 1


# returns the percentage (0 to 1) of points of the history that are within threshold
def history_dwellvalue(history, refpoint, threshold):
    history_len = np.shape(history)[1]
    count = np.count_nonzero(np.linalg.norm(np.transpose(history) - np.tile(refpoint, (history_len, 1)), axis=1) <= threshold)
    #print(history, refpoint, threshold, count)
    return count / history_len


# returns both histories shifted left with the update added to the end
def update_probe_history(history, tip_update, end_update):
    history["tip"] = np.roll(history["tip"], -1, axis=1)
    history["tip"][:, -1] = tip_update
    history["end"] = np.roll(history["end"], -1, axis=1)
    history["end"][:, -1] = end_update


# actually makes a selection and echoes it to all clients
def make_selection(new_selection):
    global selection
    logging.info(f"Making selection {new_selection}")
    selection["comp"] = None
    selection["pin"] = None
    selection["net"] = None
    if new_selection is None or new_selection["type"] == "deselect":
        socketio.emit("selection", {"type": "deselect", "val": None})
    else:
        # selection and tool selection are mutually exclusive
        make_tool_selection(None)
        selection[new_selection["type"]] = new_selection["val"]
        socketio.emit("selection", new_selection)


# wrapper for getting DMM measurement from SCPI
# returns tuple of unit, value
def measure_dmm():
    global dmm_mode
    value = queryValue("dmm", dmm_mode)
    return dmm_mode, value


# wrapper for getting oscilloscope measurement from SCPI
# returns tuple of unit, value
def measure_osc():
    value = queryValue("osc","frequency")
    logging.error("measure_osc() not yet implemented")
    return None, None


# actually makes a tool selection and echoes it to all clients to be displayed
def make_tool_selection(device, new_selection=None):
    global tool_selections
    logging.info(f"Making tool selection {device}: {new_selection}")

    if device is None:
        # deselect all tools
        for tool in tool_selections:
            tool_selections[tool] = None
            socketio.emit("tool-selection", {"device": tool, "selection": None})
    else:
        # selection and tool selection are mutually exclusive
        make_selection(None)
        tool_selections[device] = new_selection
        socketio.emit("tool-selection", {"device": device, "selection": new_selection})

        if active_session_is_recording and new_selection is not None:
            # if we hit something that is not the next card, stop highlighting the next card
            _, nextcard = active_session.get_next()
            if nextcard is not None:
                if (device == "pos" and nextcard.pos != new_selection) or \
                        (device == "neg" and nextcard.neg != new_selection):
                    socketio.emit("debug-session", {"event": "next", "id": -1, "card": None})

            # record a measurement if both probes are set
            if tool_selections["pos"] is not None and tool_selections["neg"] is not None:
                logging.info(f"measured {tool_selections['pos']}, {tool_selections['neg']}")
                dmm_unit, dmm_val = measure_dmm()
                tool_measure("dmm", tool_selections["pos"], tool_selections["neg"], dmm_unit, dmm_val)
                make_tool_selection(None)
            if tool_selections["osc"] is not None:
                return
                osc_unit, osc_val = measure_osc()
                tool_measure("osc", tool_selections["osc"], {"type": "net", "val": "GND"}, osc_unit, osc_val)
                make_tool_selection(None)


def make_study_select(refid, src_text):
    global study_state

    if study_state["task"] == "2":
        logging.error("Task 2 NotYetImplemented")
        return

    runtime = time.time() - study_state["step_start"]
    if refid == study_state["current_modules"][study_state["step"]]:
        study_state["step_done"] = True
        study_log(f"Correct {src_text} after {runtime:.3f}s")
        socketio.emit("study-event", {"event": "success", "refid": refid, "task": study_state["task"]})
    else:
        study_log(f"Incorrect {src_text} after {runtime:.3f}s")
        socketio.emit("study-event", {"event": "failure"})


# handles a selection event from the client
def client_selection(data):
    global pcbdata, pinref_to_idx, socketio

    if "point" in data:
        # a click in layout
        hits = hitscan(data["point"][0], data["point"][1], pcbdata, pinref_to_idx, layer=data["layer"],
                       render_pads=data["pads"], render_tracks=data["tracks"], padding=0)
        
        if len(hits) == 0:
            make_selection({"type": "deselect", "val": None})
        elif len(hits) == 1:
            make_selection(hits[0])
        else:
            socketio.emit("selection", {"type": "multi", "point": data["point"], "layer": data["layer"],
                                        "hits": hits, "from_optitrack": False})
    else:
        # a click in schematic or a disambiguation choice
        make_selection(data)


# handles a probe selection event
# assumes this event was triggered under valid circumstances
def probe_selection(name, tippos, endpos, force_deselect=False):
    global pcbdata, pinref_to_idx, board_multimenu, can_reselect, socketio

    if force_deselect:
        # we dwelled down outside of the board
        make_selection(None)
        return
    # board layer is hardcoded for now
    layer = "F"

    point = optitrack_to_layout_coords(tippos)

    # TODO let user click on tracks?
    # TODO user setting for what types can be probed
    hits = hitscan(point[0], point[1], pcbdata, pinref_to_idx, layer=layer, render_pads=True, render_tracks=False,
                   padding=config.getfloat("Optitrack", "PinPadding"), types=["comp", "pin", "net"])

    if len(hits) == 1:
        can_reselect[name] = False
        make_selection(hits[0])
    elif len(hits) > 1:
        can_reselect[name] = False

        board_multimenu["active"] = True
        board_multimenu["source"] = name
        board_multimenu["tip-anchor"] = tippos
        board_multimenu["end-origin"] = endpos

        """
        # TODO instead of forcing the hits list to len 4, disamb menu should handle arbitrary number
        if len(hits) < 4:
            hits += [None] * (4 - len(hits))
        board_multimenu["options"] = hits[:4]
        """
        board_multimenu["options"] = hits

        # don't need a point since main.js ignores selection if from_optitrack=True
        socketio.emit("selection", {"type": "multi", "layer": layer, "hits": hits, "from_optitrack": True})


# handles a dmm selection event
# assumes this event was triggered under valid circumstances
def dmm_selection(probe, tippos, endpos, force_deselect=False):
    global pcbdata, pinref_to_idx, board_multimenu, can_reselect, socketio, tool_selections

    if force_deselect:
        tool_selections[probe] = None
        socketio.emit("tool-selection", {"device": probe, "selection": None})
        return

    if not active_session_is_recording:
        logging.info("attempted dmm selection without active session, ignoring")
        return

    logging.info(f"attempting dmm selection for {probe}")

    # board layer is hardcoded for now
    layer = "F"

    point = optitrack_to_layout_coords(tippos)

    # the multimeter doesn't want to select components
    hits = hitscan(point[0], point[1], pcbdata, pinref_to_idx, layer=layer, render_pads=True, render_tracks=True,
                   padding=config.getfloat("Optitrack", "PinPadding"), types=["pin", "net"])

    if len(hits) == 1:
        logging.warning(f"multimeter probe hit a pin ({hits[0]}) that doesn't belong to any net")

        can_reselect[probe] = False

        make_tool_selection(probe, hits[0])
    elif len(hits) > 1:
        logging.info(f"probe {probe} hit {len(hits)} things")
        can_reselect[probe] = False

        # TODO auto disambiguation if we have a guided measurement

        # if we still need disambiguation, generate menu
        board_multimenu["active"] = True
        board_multimenu["source"] = probe
        board_multimenu["tip-anchor"] = tippos
        board_multimenu["end-origin"] = endpos

        """
        # TODO instead of forcing the hits list to len 4, disamb menu should handle arbitrary number
        if len(hits) < 4:
            hits += [None] * (4 - len(hits))
        board_multimenu["options"] = hits[:4]
        """
        board_multimenu["options"] = hits
        
        # TODO display multimeter disambiguation menu
        socketio.emit("tool-selection", {"device": probe, "selection": "multi", "layer": layer, "hits": hits})


# handles a study selection event, either from the client layout or optitrack
def study_selection(name, tippos=None, endpos=None, force_deselect=False, data=None):
    global study_state, pcbdata, pinref_to_idx, can_reselect

    if name == "layout":
        # we're from layout, so we have data
        src_text = "layout click"
        point = data["point"]
        layer = data["layer"]
        pads = data["pads"]
        tracks = data["tracks"]
        padding = 0
    else:
        # we're from probe, so we have tippos
        src_text = "probe dwell"
        point = optitrack_to_layout_coords(tippos)
        layer = "F"
        pads = True
        tracks = False
        padding = config.getfloat("Study", "CompPadding")

        # prevent failure spam
        can_reselect[name] = False

    hits = hitscan(point[0], point[1], pcbdata, pinref_to_idx, layer=layer, render_pads=pads,
        render_tracks=tracks, padding=padding, types=["comp"])

    refid = None
    for hit in hits:
        if hit["val"] == study_state["current_modules"][study_state["step"]]:
            refid = hit["val"]
            break

    make_study_select(refid, src_text)


# handles a board multimeter selection event
# assumes this event was triggered under valid circumstances
def multimenu_selection(name, endpos):
    global board_multimenu

    v = endpos - board_multimenu["end-origin"]
    if np.abs(v[0]) > np.abs(v[1]):
        # x change is greater
        if v[0] < 0:
            choice = board_multimenu["options"][2]
        else:
            choice = board_multimenu["options"][0]
    else:
        # y change is greater
        if v[1] < 0:
            choice = board_multimenu["options"][1]
        else:
            choice = board_multimenu["options"][3]

    if choice is not None:
        # a valid option was selected
        board_multimenu["active"] = False
        make_selection(choice)


def multimenu_selection_linear(name, endpos):
    global board_multimenu

    # for linear, we only care about the y value
    # if val is positive, we've moved up (-y)
    val = board_multimenu["end-origin"][1] - endpos[1]
    #val = endpos[1] - board_multimenu["end-origin"][1]

    num_cells = len(board_multimenu["options"]) + 1
    row_height = config.getfloat("Optitrack", "MultiMenuSensitivity")

    # origin is in the middle of the safe cell, so first correct for this
    # cell_i is 0 for safe cell, - if above safe cell, and + if below safe cell
    cell_i = int(np.floor(val / row_height + 0.5))

    # logging.info(f"val {val:.1f}, cell_i {cell_i}")

    if cell_i == 0:
        # we're in safe cell, do nothing
        return

    if cell_i > 0:
        # we're above the safe cell, so decrement our index bc the safe cell is not in options
        cell_i -= 1

    # safe cell is at midpoint (ceil) of cells
    # option_i is index within options
    option_i = cell_i + num_cells // 2

    #logging.info(f"option_i {option_i} of {len(board_multimenu['options'])} options")

    if 0 <= option_i < len(board_multimenu["options"]):
        board_multimenu["active"] = False
        if board_multimenu["source"] == "probe":
            make_selection(board_multimenu["options"][option_i])
        else:
            make_tool_selection(board_multimenu["source"], board_multimenu["options"][option_i])


# checks for probe dwelling (selection and disambiguation) and fires the appropriate event
# name is "probe", "pos", "neg", "osc" and history is {"tip": [], "end": []}
# selection_fn is called when the tip is dwelling and wants to fire a selection event
#   must take name, tip_pos, end_pos, and optional force_deselect
# returns the dwell values of the tip and end
def check_probe_events(name: str, history: dict, selection_fn):
    global board_multimenu, can_reselect, socketio

    ts = time.perf_counter()

    tip_pos = history["tip"][:, -1]
    end_pos = history["end"][:, -1]

    tip_dwell = history_dwellvalue(history["tip"], tip_pos, config.getfloat("Optitrack", "DwellRadiusTip"))
    end_dwell = history_dwellvalue(history["end"], end_pos, config.getfloat("Optitrack", "DwellRadiusEnd"))
    ts_dwell = time.perf_counter() - ts

    ts_isz = time.perf_counter()
    if not in_selection_zone(tip_pos):
        # logging.info(f"{name} is out of zone at {tip_pos[0]:.0f}, {tip_pos[1]:.0f}, {tip_pos[2]:.0f}")
        # logging.info(f"zone is {reselection_zone}")
        can_reselect[name] = True
        if board_multimenu["active"] and board_multimenu["source"] == name:
            board_multimenu["active"] = False
            socketio.emit("selection", {"type": "cancel-multi"})
        if tip_pos[2] <= config.getfloat("Optitrack", "OutsideVerticalBuffer"):
            selection_fn(name, tip_pos, end_pos, True)
        return tip_dwell, end_dwell
    ts_isz = time.perf_counter() - ts_isz

    # logging.info(f"{name} is in zone with tip dwell {tip_dwell:.1f}")

    ts_op = time.perf_counter()
    ts_op_name = "none"
    if not board_multimenu["active"]:
        # no multimenu is open, we can select
        if can_reselect[name] and tip_dwell == 1:
            selection_fn(name, tip_pos, end_pos)
        ts_op_name = "sel"
    elif board_multimenu["source"] == name:
        # a multimenu for this probe is open)
        anchordist = np.linalg.norm(tip_pos - board_multimenu["tip-anchor"])
        #logging.info(f"trying mm sel with dwell val of {end_dwell:.1f} and anchor dist {anchordist:.1f}")
        if end_dwell == 1 and anchordist <= config.getfloat("Optitrack", "MultiAnchorRadius"):
            # tip is still in place and end is dwelling
            multimenu_selection_linear(name, end_pos)
        ts_op_name = "mm"
    ts_op = time.perf_counter() - ts_op

    ts = time.perf_counter() - ts
    if ts > .01:
        logging.info(f"check {name} took {ts*1000:.0f}ms ({ts_dwell*1000:.0f}ms dwell, {ts_isz*1000:.0f}ms isz, {ts_op*1000:.0f}ms op {ts_op_name})")
        pass

    return tip_dwell, end_dwell


# generates a new history of zeroes of the appropriate size (determined by config.ini)
def new_history(dwell_time, dim=2):
    history_len = int(config.getint("Server", "UDPFramerate") * dwell_time)
    return np.zeros((dim, history_len))


def update_boardpos(x, y, r):
    global board_pos, projector_calibration, boardpos_offset

    # projector_calibration is now adjustment for observed board position
    board_pos["x"] = (x - boardpos_offset["x"]) / projector_calibration["z"]
    board_pos["y"] = -(y - boardpos_offset["y"]) / projector_calibration["z"]

    if config.getboolean("Dev", "TrackBoardRotation"):
        board_pos["r"] = -r - boardpos_offset["r"]
    else:
        board_pos["r"] = 0

    update_reselection_zone()

    final_pos = {
        "tx": board_pos["x"] + projector_calibration["tx"],
        "ty": board_pos["y"] + projector_calibration["ty"],
        "r": board_pos["r"] + projector_calibration["r"],
        "z": projector_calibration["z"]
    }
    socketio.emit("board-update", final_pos)


def listen_udp():
    global socketio, active_session_is_recording, study_state, do_board_update

    sock = socket.socket(family=socket.AF_INET, type=socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((config.get("Server", "UDPAddress"), config.getint("Server", "UDPPort")))

    framerate = config.getint("Server", "UDPFramerate")

    # probe histories have "tip" and "end", each of which is a 2D array of points from oldest to newest
    # blame Ishan for the fact that these arrays are transposed s.t. the ith point is at [:, i] not [i]
    # TODO transpose them back
    dwell_time_tip = config.getfloat("Optitrack", "DwellTime")
    dwell_time_end = config.getfloat("Optitrack", "DwellTimeEnd")
    # probe_history = {"tip": new_history(dwell_time_tip, dim=3), "end": new_history(dwell_time_end)}
    dmm_probe_history = {
        "pos": {"tip": new_history(dwell_time_tip, dim=3), "end": new_history(dwell_time_end)},
        "neg": {"tip": new_history(dwell_time_tip, dim=3), "end": new_history(dwell_time_end)}
    }

    nextframe = time.perf_counter() + 1. / framerate
    frame_i = 0
    while True:
        frame_i += 1
        ts = time.perf_counter()
        data, addr = sock.recvfrom(config.getint("Server", "UDPPacketSize"))
        ts_wait = time.perf_counter() - ts
        var = np.array(struct.unpack("f" * 14, data))

        # board and red/grey tips are x,y,z where x,y are in pixels and z is in real m
        # red/grey end is x,y in pixels
        red_tip = var[0:3]
        red_end = var[3:5]
        board_update = var[5:8]
        grey_tip = var[8:11]
        grey_end = var[11:13]
        board_rot = var[13]

        # convert z from real m to real mm to (roughly) match other coordinates
        red_tip[2] *= 1000
        grey_tip[2] *= 1000
        board_update[2] *= 1000

        # to avoid crashes for now, ignoring z values
        board_update = board_update[:2]

        ts_board = time.perf_counter()
        if config.getboolean("Dev", "TrackBoard") or do_board_update:
            do_board_update = False
            update_boardpos(board_update[0], board_update[1], board_rot)
        ts_board = time.perf_counter() - ts_board

        ts_check = time.perf_counter()
        # update_probe_history(probe_history, red_tip, red_end)
        update_probe_history(dmm_probe_history["pos"], red_tip, red_end)
        update_probe_history(dmm_probe_history["neg"], grey_tip, grey_end)
        if study_state["active"]:
            if not study_state["step_done"]:
                # we only actually want to check for events if we are actively doing a step
                _, _ = check_probe_events("probe", dmm_probe_history["pos"], selection_fn=study_selection)
        elif active_session_is_recording:
            _, _ = check_probe_events("pos", dmm_probe_history["pos"], selection_fn=dmm_selection)
            _, _ = check_probe_events("neg", dmm_probe_history["neg"], selection_fn=dmm_selection)
        else:
            _, _ = check_probe_events("probe", dmm_probe_history["pos"], selection_fn=probe_selection)

        ts_check = time.perf_counter() - ts_check

        # send the tip and end positions to the web app to display
        probe_tip_layout = optitrack_to_layout_coords(red_tip)

        if board_multimenu["active"]:
            # get the normalized probe end y-delta s.t. row height = 1
            #probe_end_delta = np.mean(probe_history["end"], axis=1)[1] - board_multimenu["end-origin"][1]
            #probe_end_delta = board_multimenu["end-origin"][1] - np.mean(probe_history["end"], axis=1)[1]
            if board_multimenu["source"] == "probe" or board_multimenu["source"] == "pos":
                probe_end_delta = board_multimenu["end-origin"][1] - red_end[1]
            else:
                probe_end_delta = board_multimenu["end-origin"][1] - grey_end[1]
            probe_end_delta /= config.getfloat("Optitrack", "MultiMenuSensitivity")
        else:
            probe_end_delta = 0

        grey_tip_layout = optitrack_to_layout_coords(grey_tip)

        ts_sock = time.perf_counter()
        socketio.emit("udp", {
            "tippos_layout": {"x": probe_tip_layout[0], "y": probe_tip_layout[1]},
            "endpos_delta": probe_end_delta,
            "greytip": {"x": grey_tip_layout[0], "y": grey_tip_layout[1]},
            "boardpos": {"x": board_update[0], "y": board_update[1], "r": board_rot},
            # "tipdwell": tip_dwell,
            # "enddwell": end_dwell
        })
        ts_sock = time.perf_counter() - ts_sock

        now = time.perf_counter()
        ts = now - ts
        diff = nextframe - now
        #logging.info(f"diff is {diff * 1000:.0f}ms")
        if diff > 0:
            #logging.info("frame early!")
            time.sleep(diff)
        elif -diff > 0.05:
            # more than 50ms behind
            # logging.warning(f"low framerate ({frame_i // framerate}.{frame_i % framerate}): " +
            #     f"{-diff*1000:.0f}ms behind ({ts_wait*1000:.0f}ms wait, {ts_board*1000:.0f} ms board, " +
            #     f"{ts_check*1000:.0f}ms check, {ts_sock*1000:.0f}ms socket, {ts*1000:.0f}ms total)")
            pass
        else:
            #logging.info("frame (sorta) on time")
            pass
        nextframe = now + 1. / framerate


# handles a tool connection event, which comes from optitrack or other server code
# device is "ptr", "dmm", or "osc", and element is key in the "ready-elements" dict
# for the specified device in the tools dict
def tool_connect(device, element, success=True):
    global tools

    data = {
        "status": "success" if success else "failed",
        "type": device,
        "val": element,
        "ready": False
    }
    if success:
        tools[device]["ready-elements"][element] = True
        is_ready = True
        for element_ready in tools[device]["ready-elements"]:
            if not element_ready:
                is_ready = False
                break
        if is_ready:
            tools[device]["ready"] = True
            data["ready"] = True

    socketio.emit("tool-connect", data)
    

# handles a tool measurement event, which comes from optitrack
# measurement is {device, pos, neg, unit, val}, ie. optitrack hitscan is done already
def tool_measure(device, pos, neg, unit, val):
    global tools, active_session, active_session_is_recording

    if not active_session_is_recording:
        logging.warning("measurement while there was no debug session")
        return

    if not tools[device]["ready"]:
        logging.warning("measurement before tool was setup, ignoring")
        return

    card, id, update = active_session.measure(device, pos, neg, unit, val)

    socketio.emit("debug-session", {
        "event": "measurement",
        "card": card.to_dict(),
        "id": id,
        "update": update
    })

    nextid, nextcard = active_session.get_next()
    if nextid != -1:
        socketio.emit("debug-session", {"event": "next", "id": nextid, "card": nextcard.to_dict()})


def autoconnect_tools(enabled):
    global tools
    for device in enabled:
        tools[device]["ready"] = True
        for element in tools[device]["ready-elements"]:
            tools[device]["ready-elements"][element] = True

    initializeInstruments()


def study_log(msg):
    global study_state
    t = study_state["task"]
    s = study_state["step"]
    sb = "*" if study_state["step_done"] else ""
    tt = f"Task {t} Step {s}{sb}" if study_state["active"] else "Inactive"
    logging.info(f"Study ({tt}) {msg}")



if __name__ == "__main__":
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
    # TODO no need to store these as separate keys rather than a single value
    selection = {
        "comp": None,
        "pin": None,
        "net": None
    }
    app_settings = {}
    projector_mode = "calibrate"
    projector_calibration = {
        "tx": config.getfloat("Dev", "DefaultTX"),
        "ty": config.getfloat("Dev", "DefaultTY"),
        "r": config.getfloat("Dev", "DefaultRotation"),
        "z": config.getfloat("Dev", "DefaultZoom")
    }
    board_pos = {
        "x": 0,
        "y": 0,
        "r": 0
    }
    do_board_update = False

    boardname = config.get("Study", "BoardName")

    # offset to convert between optitrack and layout coordinates
    boardpos_offset = {
        "x": config.getfloat(boardname, "BoardposOffsetX"),
        "y": config.getfloat(boardname, "BoardposOffsetY"),
        "r": config.getfloat(boardname, "BoardposOffsetR"),
    }

    # center of layout in layout coords,
    # ie. where the projected board should be rotatated around
    rotation_center = (config.getfloat(boardname, "BoardCenterX"),
                       config.getfloat(boardname, "BoardCenterY"))

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
    # session_history: list[DebugSession] = []
    session_history = []

    # active_session: DebugSession = None
    active_session = None

    # if True, measurements are added to the current session and the next custom card is highlighted
    # if False, measurements are ignored and custom cards are not highlighted
    active_session_is_recording = False

    tool_selections = {
        "probe": None,
        "pos": None,
        "neg": None,
        "osc": None
    }

    # controls whether or not various probes can make a new selection
    can_reselect = {
        "probe": True,
        "pos": True,
        "neg": True,
        "osc": True
    }

    # contains state needed to compute multimenu disambiguation
    board_multimenu = {
        "active": False,        # if True, a board multimenu is being displayed and all board selections are blocked
        "source": None,         # "probe", "pos", "neg", "osc"
        "end-origin": None,     # np[x,y] of endpos when menu was generated
        "tip-anchor": None,     # np[x,y] of tippos when menu was generated
        "options": [],          # list of selection options {type, val}
    }

    # {x, y, z}, where each coordinate is [min, max]
    reselection_zone = None
    update_reselection_zone()

    if config.getboolean("Dev", "AutoconnectTools"):
        # we just assume ptr and dmm are already connected
        autoconnect_tools(["ptr", "dmm"])

    study_state = {
        "active": False,            # iff True, study mode is on
        "task": None,               # "1A", "1B", or "2"
        "current_modules": None,    # if active, is the shuffled list of modules
        "step": 0,                  # current index in current_modules (can be -1)
        "step_done": False,         # iff False, participant has not yet completed this step
        "step_start": 0,            # time.time() at the start of this step
        "boardviz": True,           # iff True, BoardViz is on for this step
    }
    study_settings = {
        "WithBoardVizFirst": {
            "1A": False,
            "1B": False,
        },
        "CanRunTask1": True,
        "CanRunTask2": True,
    }
    study_timer = {
        "on": False,
        "start": 0
    }
    study_modules = config.get("Study", "ComponentList").split(",")
    logging.info("Study component list is being loaded")
    try:
        study_modules = [ref_to_id[ref.strip()] for ref in study_modules]
    except KeyError:
        study_modules = []
        study_settings["CanRunTask1"] = False
        logging.error("Study component list contained unknown comp ref, task 1a/b cannot be run")

    study_bringup = config.get("Study", "BringupList").split(",")
    study_bringup = [net.strip() for net in study_bringup]
    logging.info("Study bringup list is being loaded")
    for net in study_bringup:
        if net not in netdict:
            study_bringup = []
            study_settings["CanRunTask2"] = False
            logging.error("Study bringup list contained unknown net, task 2 cannot be run")
            break

    # possible values: "no_function", "voltage", "resistance", "diode", "continuity"
    dmm_mode = "no_function"


    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    else:
        port = config.getint("Server", "Port")

    socketio.run(app, port=port, debug=True)

