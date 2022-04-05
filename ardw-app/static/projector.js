// This is the primary file for the projector webpage (the projector view)
// It calls initialization functions from other files for the page.
// It also contains some custom functions for the projector page,
// mainly for handling socket selection events

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

var boardoff_counter = 0;
var boardoff_n = 200;
var boardoff_sums = {
  "x": 0,
  "y": 0,
  "r": 0,
}
function calcBoardOffset(boardpos) {
  if (boardoff_counter < boardoff_n) {
    boardoff_sums.x += boardpos.x;
    boardoff_sums.y += boardpos.y;
    boardoff_sums.r += boardpos.r;
  } else if (boardoff_counter == boardoff_n) {
    boardoff_sums.x /= boardoff_n;
    boardoff_sums.y /= boardoff_n;
    boardoff_sums.r /= boardoff_n;

    console.log(`transform is x=${transform.tx.toFixed(4)}, y=${transform.ty.toFixed(4)}, r=${transform.r.toFixed(4)}`);
    console.log(`boardpos was x=${boardoff_sums.x.toFixed(4)}, y=${boardoff_sums.y.toFixed(4)}, r=${boardoff_sums.r.toFixed(4)}`);

    var offx = -transform.tx * transform.z + boardoff_sums.x;
    var offy = transform.ty * transform.z + boardoff_sums.y;
    var offr = -transform.r - boardoff_sums.r;
    console.log(`theoretical offset is x=${offx.toFixed(4)}, y=${offy.toFixed(4)}, r=${offr.toFixed(4)}`);

    var avgx = (pcbdata.edges_bbox.minx + pcbdata.edges_bbox.maxx) / 2;
    var avgy = (pcbdata.edges_bbox.miny + pcbdata.edges_bbox.maxy) / 2;
    console.log(`edgecut center is (${avgx.toFixed(2)},${avgy.toFixed(2)})`);
  }
  boardoff_counter++;
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
        drawHighlights();
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
  socket.on("board-update", (update) => {
    transform = update;

    for (let layerdict of [allcanvas.front, allcanvas.back]) {
      layerdict.transform.panx = layerdict.layer == "F" ? transform.tx : -transform.tx;
      layerdict.transform.pany = transform.ty
      ibom_settings.boardRotation = transform.r;
      layerdict.transform.zoom = transform.z;
    }
    resizeAll();
  })
  socket.on("udp", (data) => {
    probes["pos"].location = data["tippos_layout"];
    probes["neg"].location = data["greytip"];
    probe_end_delta = data["endpos_delta"];
    drawHighlights();

    calcBoardOffset(data["boardpos"]);
  })
  socket.on("tool-selection", (data) => {
    console.log("tool-selection")
    console.log(data)
    if (data.selection == "multi") {
      // TODO multi menu
      multimenu_active = {"hits": data.hits, "layer": data.layer, "device": data.device}
      drawHighlights();
    } else {
      probes[data.device].selection = data.selection;
      drawHighlights();
    }
  })

  socket.on("debug-session", (data) => {
    // projector page just needs simplified debug session state for now
    console.log(data)
    switch (data.event) {
      case "record":
        active_session_is_recording = data.record;
        if (!active_session_is_recording) {
          probes.pos.selection = null;
          probes.neg.selection = null;
          probes.osc.selection = null;
        }
        drawHighlights();
        break;
      case "next":
        // TODO support osc
        console.log(active_session_is_recording)
        if (active_session_is_recording) {
          if (data.id === -1) {
            // deselect
            probes.pos.selection = null;
            probes.neg.selection = null;
            probes.osc.selection = null;
            debug_annotation = null;
            drawHighlights();
          } else {
            // show user where to measure next
            console.log("highlighting next!")
            probes.pos.selection = data.card.pos;
            if (data.card.anno !== null) {
              // anno card, so display the annotation
              debug_annotation = data.card.anno;
            } else {
              // measurement card, so also highlight the negative rail
              debug_annotation = null;
              probes.neg.selection = data.card.neg;
            }
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
    var root = document.documentElement;
    console.log(data)
    root.style.setProperty("--pad-color-highlight", data.padcolor);
    root.style.setProperty("--track-color-highlight", data.trackcolor);
    drawHighlights();
  })

  socket.on("study-event", (data) => {
    switch (data.event) {
      case "task":
        projectorDeselectAll();
        break;
      case "highlight":
        projectorDeselectAll();
        if (data.task == "1A" && data.boardviz) {
          projectorSelectComponent(data.refid);
        } else if (data.task == "1B") {
          projectorSelectComponent(data.refid);
        }
        break;
      case "success":
        if (data.task == "1A") {
          projectorSelectComponent(data.refid);
        }
        break;
      default:
        console.log(data);
        break;
    }
  })

  socket.on("special", (data) => {
    ibom_settings[data.prop] = data.on;
    resizeAll();
  })
}

window.addEventListener("keydown", (evt) => {
  if (evt.key == "c") {
    console.log("Recalculating board offset");
    boardoff_counter = 0;
    boardoff_sums = {
      "x": 0,
      "y": 0,
      "r": 0
    }
  }
})


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