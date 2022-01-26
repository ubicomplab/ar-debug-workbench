IS_PROJECTOR = true;

var transform = {
  "tx": 0,
  "ty": 0,
  "r": 0,
  "z": 1
};

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

function projectorDeselectAll() {
  current_selection.type = null;
  current_selection.val = null;
  
  draw_crosshair = false;
  target_boxes["S"] = null;
  target_boxes["F"] = null;
  target_boxes["B"] = null;
  drawHighlights();
}

function initSocket() {
  socket = io();
  socket.on("connect", () => {
    console.log("connected")
  });
  socket.on("selection", (selection) => {
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
     udp_selection = ht(data)
     drawHighlights()
  })
}

function ht(data) {
  var zoom = allcanvas.front.transform.zoom;
  var panx = allcanvas.front.transform.panx;
  var pany = allcanvas.front.transform.pany;
  return {
    "x": (data.x) / zoom - panx,
    "y": (-data.y) / zoom - pany
  }
}

window.onload = () => {
  let data_urls = ["schdata", "pcbdata"]
  data_urls = data_urls.map((name) => ("http://" + window.location.host + "/" + name))

  Promise.all(data_urls.map((url) => fetch(url))).then((responses) =>
    Promise.all(responses.map((res) => res.json()))
  ).then((datas) => {

    schdata = datas[0];
    pcbdata = datas[1];

    initUtils();
    initData();

    initLayout();

    initSettings();

    initSocket();

    resizeAll();

  }).catch((e) => console.log(e))
}
window.onresize = resizeAll;