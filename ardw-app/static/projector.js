// This is the primary file for the projector webpage (the projector view)
// It calls initialization functions from other files for the page.
// It also contains some custom functions for the projector page,
// mainly for handling socket selection events

/** Magic numbers for the offset between optitrack boardpos and our render */
const BOARDPOS_OFFSET_X = 589.87;
const BOARDPOS_OFFSET_Y = -420.96;

/** if True, the tx/ty of the transform */
var trackboard = false;
var udpboardpos = {};

// Set to true so that functions in render.js ignore the resize transform (s/x/y)
IS_PROJECTOR = true;

/** Projector view transform from server/main page */
var transform = {
  "tx": 0,
  "ty": 0,
  "r": 0,
  "z": 1
};

var active_session_is_recording = false;


/** Sets various ibom settings to false to avoid displaying unwanted things */
function initSettings() {
  ibom_settings["renderDrawings"] = false;
  ibom_settings["renderEdgeCuts"] = true;
  ibom_settings["renderFabrication"] = false;
  ibom_settings["renderPads"] = false;
  ibom_settings["renderReferences"] = false;
  ibom_settings["renderSilkscreen"] = false;
  ibom_settings["renderTracks"] = false;
  ibom_settings["renderValues"] = false;
  ibom_settings["renderZones"] = false;
}

/** Highlights the selected component */
function projectorSelectComponent(refid) {
  var selected = parseInt(refid);
  if (compdict[selected] == undefined) {
    logerr(`selected refid ${selected} is not in compdict`);
    return;
  }

  projectorDeselectAll();
  current_selection.type = "comp";
  current_selection.val = selected;
  drawHighlights();
}

/** Highlights the selected pin */
function projectorSelectPins(pin_hits) {
  // Permitting only single selection, but likely to change
  var selected = pin_hits[0];
  if (pindict[selected] == undefined) {
    logerr(`selected pinidx ${selected} is not in pindict`);
    return;
  }

  projectorDeselectAll();
  current_selection.type = "pin";
  current_selection.val = selected;
  drawHighlights();
}

/** Highlights the selected net */
function projectorSelectNet(netname) {
  if (!(netname in netdict)) {
    logerr(`selected net ${netname} is not in netdict`);
    return;
  }

  projectorDeselectAll();
  current_selection.type = "net";
  current_selection.val = netname;
  drawHighlights();
}

/** Removes any highlights */
function projectorDeselectAll() {
  current_selection.type = null;
  current_selection.val = null;
  
  draw_crosshair = false;
  target_boxes["S"] = null;
  target_boxes["F"] = null;
  target_boxes["B"] = null;
  drawHighlights();
}

/** Initializes all socket listeners for the projector */
function initSocket() {
  socket = io();
  socket.on("connect", () => {
    console.log("connected")
  });
  socket.on("selection", (selection) => {
    multimenu_active = null;
    switch (selection.type) {
      case "comp":
        projectorSelectComponent(selection.val);
        break;
      case "pin":
        projectorSelectPins([selection.val]);
        break;
      case "net":
        projectorSelectNet(selection.val);
        break;
      case "deselect":
        projectorDeselectAll();
        break;
      case "multi":
        if (selection.from_optitrack) {
          multimenu_active = {"hits": selection.hits, "layer": selection.layer, "device": "probe"}
          drawHighlights();
        }
        break;
      case "cancel-multi":
        multimenu_active = null;
        break;
    }
  });
  socket.on("projector-mode", (mode) => {
    if (mode === "calibrate") {
      // ibom_settings["renderDrawings"] = true;
      ibom_settings["renderEdgeCuts"] = true;
      ibom_settings["renderPads"] = true;
    } else {
      // ibom_settings["renderDrawings"] = false;
      ibom_settings["renderEdgeCuts"] = false;
      ibom_settings["renderPads"] = false;
    }
    resizeAll();
  });
  socket.on("projector-adjust", (adjust) => {
    transform[adjust["type"]] = adjust["val"];

    for (let layerdict of [allcanvas.front, allcanvas.back]) {
      layerdict.transform.panx = layerdict.layer == "F" ? transform.tx : -transform.tx;
      layerdict.transform.pany = transform.ty
      ibom_settings.boardRotation = transform.r;
      layerdict.transform.zoom = transform.z;
    }

    resizeAll();
  })
  socket.on("udp", (data) => {
    optitrackBoardposUpdate(data["boardpos_pixel"])
    probes["pos"].location = data["tippos_layout"];
    probes["neg"].location = data["greytip"];
    probe_end_delta = data["endpos_delta"];
    drawHighlights();
  })
  socket.on("tool-selection", (data) => {
    if (data.selection == "multi") {
      // TODO multi menu
      multimenu_active = {"hits": data.hits, "layer": data.layer, "device": data.device}
      drawHighlights();
    } else {
      probes[data.device].selection = data.selection;
      drawHighlights();
    }
  })
  socket.on("toggleboardpos", (val) => {
    trackboard = val;
    optitrackBoardposUpdate(udpboardpos)
  })

  socket.on("debug-session", (data) => {
    // projector page just needs simplified debug session state for now
    switch (data.event) {
      case "record":
        active_session_is_recording = data.record;
        if (!active_session_is_recording) {
          probes.pos.selection = null;
          probes.neg.selection = null;
          probes.osc.selection = null;
          drawHighlights();
        }
        break;
      case "next":
        // TODO support osc
        if (active_session_is_recording) {
          if (data.id == -1) {
            // deselect
            probes.pos.selection = null;
            probes.neg.selection = null;
            probes.osc.selection = null;
            drawHighlights();
          } else {
            // show user where to measure next
            probes.pos.selection = data.card.pos;
            probes.neg.selection = data.card.neg;
            drawHighlights();
          }
        }
        break;
    }
  })

  socket.on("config", (data) => {
    for (let device in data.devices) {
      let colors = data.devices[device];
      probes[device].color.loc = colors[0];
      probes[device].color.sel = colors[1];
      probes[device].color.zone = colors[1];
    }
    trackboard = data.track_board;
  })
}

// TODO uses magic numbers, instead use layout coords from server
/** Updates the board position to match the given boardpos */
function optitrackBoardposUpdate(boardpos) {
  var t = allcanvas.front.transform;
  var x = (boardpos.x - BOARDPOS_OFFSET_X) / t.zoom;
  var y = -(boardpos.y - BOARDPOS_OFFSET_Y) / t.zoom;

  if (trackboard) {
    socket.emit("projector-adjust", {"type": "tx", "val": x});
    socket.emit("projector-adjust", {"type": "ty", "val": y});
  }
}

// board 599 -443 at 0,0,400%
// board 998 -444 at 100,0,400%
// board 1393, -440 at 200, 0, 400%


window.onload = () => {
  let data_urls = ["schdata", "pcbdata", "datadicts"]
  data_urls = data_urls.map((name) => ("http://" + window.location.host + "/" + name))

  Promise.all(data_urls.map((url) => fetch(url))).then((responses) =>
    Promise.all(responses.map((res) => res.json()))
  ).then((datas) => {
    initData(datas);

    initUtils();

    initLayout();

    initSettings();

    initSocket();

    resizeAll();
  }).catch((e) => console.log(e))
}
window.onresize = resizeAll;