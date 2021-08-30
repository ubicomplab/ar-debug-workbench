// Element selection and highlighting

var SCH_CLICK_BUFFER = 20; // how much of a buffer there is around the bbox of sch components
var PIN_BBOX_SIZE = 50; // how big the bbox around a pin is

var socket;

var highlighted_component = -1; // refid
var highlighted_pin = -1; // pinidx
var highlighted_net = null; // netname

/** current desktop selection, mutually exclusive with tool_selections */
var current_selection = {
  "type": null,
  "val": null
}

// TODO change tool selections to be purely coordinates
/** list of {type, val, color}; mutually exclusive with current_selection */
var tool_selections = [];

var sch_zoom_default; // different for each schematic sheet

var draw_crosshair = false;
var target_boxes = {
  "S": null,
  "F": null,
  "B": null
};


function updateTargetBoxes() {
  // Reset everything
  target_boxes["S"] = null;
  target_boxes["F"] = null;
  target_boxes["B"] = null;

  if (current_selection.type === "comp") {
    var comp = compdict[current_selection.val];
    if (comp.schids.includes(current_schematic)) {
      var bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (let unitnum in comp.units) {
        let unit = comp.units[unitnum];
        if (unit.schid == current_schematic) {
          bounds[0] = Math.min(bounds[0], unit.bbox[0], unit.bbox[2]);
          bounds[1] = Math.min(bounds[1], unit.bbox[1], unit.bbox[3]);
          bounds[2] = Math.max(bounds[2], unit.bbox[0], unit.bbox[2]);
          bounds[3] = Math.max(bounds[3], unit.bbox[1], unit.bbox[3]);
        }
      }
      target_boxes["S"] = bounds;
    }

    var footprint = pcbdata.footprints[current_selection.val];
    for (let layer of ["F", "B"]) {
      // Do nothing to layer that doesn't have the component
      target_boxes[layer] = layer == footprint.layer ? bboxPcbnewToList(footprint.bbox) : null;
    }
  }
  if (current_selection.type === "pin") {
    var pin = pindict[current_selection.val];
    if (pin.schid == current_schematic) {
      target_boxes["S"] = pinBoxFromPos(pin.pos);
    }

    for (let pad of pcbdata.footprints[ref_to_id[pin.ref]].pads) {
      if (pad.padname == pin.num) {
        let box = bboxPcbnewToList(pad);
        for (let layer of ["F", "B"]) {
          // Do nothing to layer that doesn't have the pin
          target_boxes[layer] = pad.layers.includes(layer) ? box : null;
        }
        break;
      }
    }
  }
  if (current_selection.type === "net") {
    /*
    var bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (let pinidx of netdict[current_selection.val].pins) {
        let pin = pindict[pinidx];
        if (pin.schid == current_schematic && pin.net == current_selection.val) {
            let box = pinBoxFromPos(pin.pos);
            bounds[0] = Math.min(bounds[0], box[0], box[2]);
            bounds[1] = Math.min(bounds[1], box[1], box[3]);
            bounds[2] = Math.max(bounds[2], box[0], box[2]);
            bounds[3] = Math.max(bounds[3], box[1], box[3]);
        }
    }
    target_boxes["S"] = bounds;
    */
    // no zoom or crosshair for whole net on schematic
    target_boxes["S"] = null;
    // reset transform of F and B, rather than just doing nothing
    target_boxes["F"] = [];
    target_boxes["B"] = [];
  }
}

// Permitting only single selection
function selectComponent(refid) {
  var selected = parseInt(refid);
  if (compdict[selected] == undefined) {
    logerr(`selected refid ${selected} is not in compdict`);
    return;
  }
  deselectAll(false);
  current_selection.type = "comp";
  current_selection.val = selected;

  var comp = compdict[selected];
  /*
  if (highlightedComponent !== -1 && !(comp.schids.includes(current_schematic))) {
    switchSchematic(comp.schids[0]);
  }
  */
  document.querySelectorAll("#sch-selection>div").forEach((div) => {
    div.classList.remove("has-selection");
    for (let schid of comp.schids) {
      if (div.innerText.startsWith(schid + ".")) {
        div.classList.add("has-selection");
        break;
      }
    }
  });

  document.getElementById("search-input").value = getElementName({ "type": "comp", "val": selected });

  let numunits = 0;
  for (let _ in comp.units) {
    numunits++;
  }
  search_nav_current = [1, numunits];
  search_nav_num.innerText = `1 of ${search_nav_current[1]}`;

  if (search_nav_current[1] > 1) {
    search_nav_text.innerText = `${comp.ref} ${Object.values(comp.units)[0].num}`;
  } else {
    search_nav_text.innerText = "";
  }

  updateTargetBoxes();

  if (settings["find-activate"] === "auto") {
    if (settings["find-type"] === "zoom") {
      zoomToSelection(schematic_canvas);
      zoomToSelection(allcanvas.front);
      zoomToSelection(allcanvas.back);
    } else {
      draw_crosshair = true;
    }
  }

  drawHighlights();
  drawSchematicHighlights();
}

function selectPins(pin_hits) {
  // Permitting only single selection, but likely to change
  var selected = pin_hits[0];
  if (pindict[selected] == undefined) {
    logerr(`selected pinidx ${selected} is not in pindict`);
    return;
  }
  deselectAll(false);
  current_selection.type = "pin";
  current_selection.val = selected;

  var pin = pindict[selected];
  /*
  if (highlightedPin != -1 && pindict[selected].schid != current_schematic) {
    switchSchematic(pindict[selected].schid);
  }
  */
  document.querySelectorAll("#sch-selection>div").forEach((div) => {
    div.classList.remove("has-selection");
    if (div.innerText.startsWith(pin.schid + ".")) {
      div.classList.add("has-selection");
    }
  });

  document.getElementById("search-input").value = getElementName({ "type": "pin", "val": selected });
  search_nav_current = [1, 1];
  search_nav_num.innerText = "1 of 1";
  search_nav_text.innerText = "";

  updateTargetBoxes();

  if (settings["find-activate"] === "auto") {
    if (settings["find-type"] === "zoom") {
      zoomToSelection(schematic_canvas);
      zoomToSelection(allcanvas.front);
      zoomToSelection(allcanvas.back);
    } else {
      draw_crosshair = true;
    }
  }

  drawHighlights();
  drawSchematicHighlights();
}

function selectNet(selected) {
  if (!(selected in netdict)) {
    logerr(`selected net ${selected} is not in netdict`);
    return;
  }
  deselectAll(false);

  current_selection.type = "net";
  current_selection.val = selected;
  /*
  if (!netdict[selected].includes(current_schematic)) {
    switchSchematic(netdict[selected][0]);
  }
  */

  document.querySelectorAll("#sch-selection>div").forEach((div) => {
    div.classList.remove("has-selection");
    for (let schid of netdict[selected]["schids"]) {
      if (div.innerText.startsWith(schid + ".")) {
        div.classList.add("has-selection");
        break;
      }
    }
  });

  document.getElementById("search-input").value = getElementName({ "type": "net", "val": selected });

  search_nav_current = [1, netdict[selected]["pins"].length];
  search_nav_num.innerText = `${search_nav_current[0]} of ${search_nav_current[1]}`;

  var pin1 = pindict[netdict[selected]["pins"][0]];
  search_nav_text.innerText = `${pin1.ref}.${pin1.num}`;

  updateTargetBoxes();

  if (settings["find-activate"] === "auto") {
    if (settings["find-type"] === "zoom") {
      zoomToSelection(schematic_canvas);
      zoomToSelection(allcanvas.front);
      zoomToSelection(allcanvas.back);
    } else {
      draw_crosshair = true;
    }
  }

  drawHighlights();
  drawSchematicHighlights();
}

function deselectAll(redraw) {
  current_selection.type = null;
  current_selection.val = null;
  
  draw_crosshair = false;
  target_boxes["S"] = null;
  target_boxes["F"] = null;
  target_boxes["B"] = null;

  if (redraw) {
    document.querySelectorAll("#sch-selection>div").forEach((div) => {
      div.classList.remove("has-selection");
    });

    document.getElementById("search-input").value = "";
    search_nav_current = [0, 0];
    search_nav_num.innerText = "0 of 0";
    search_nav_text.innerText = "";

    drawHighlights();
    drawSchematicHighlights();
  }
}

// <type>Clicked() functions should be called whever the client wants to select something
// The actual selection and display is handled when the server echoes the selection back,
// using the select<type>() functions in render.js
function componentClicked(refid) {
  refid = parseInt(refid);
  if (compdict[refid] == undefined) {
    logerr(`clicked refid ${refid} is not in compdict`);
    return;
  }
  socket.emit("selection", { "type": "comp", "val": refid });
}
function pinClicked(pinidx) {
  if (pindict[pinidx] == undefined) {
    logerr(`clicked pinidx ${pinidx} is not in pindict`);
    return;
  }
  socket.emit("selection", { "type": "pin", "val": pinidx });
}
function netClicked(netname) {
  if (!(netname in netdict)) {
    logerr(`clicked net ${netname} is not in netdict`);
    return;
  }
  socket.emit("selection", { "type": "net", "val": netname });
}
function deselectClicked() {
  socket.emit("selection", { "type": "deselect", "val": null });
}
var clickedType = {
  "comp": componentClicked,
  "pin": pinClicked,
  "net": netClicked,
  "deselect": deselectClicked
}

function pointWithinDistanceToSegment(x, y, x1, y1, x2, y2, d) {
  var A = x - x1;
  var B = y - y1;
  var C = x2 - x1;
  var D = y2 - y1;

  var dot = A * C + B * D;
  var len_sq = C * C + D * D;
  var dx, dy;
  if (len_sq == 0) {
    // start and end of the segment coincide
    dx = x - x1;
    dy = y - y1;
  } else {
    var param = dot / len_sq;
    var xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    dx = x - xx;
    dy = y - yy;
  }
  return dx * dx + dy * dy <= d * d;
}

function modulo(n, mod) {
  return ((n % mod) + mod) % mod;
}

function pointWithinDistanceToArc(x, y, xc, yc, radius, startangle, endangle, d) {
  var dx = x - xc;
  var dy = y - yc;
  var r_sq = dx * dx + dy * dy;
  var rmin = Math.max(0, radius - d);
  var rmax = radius + d;

  if (r_sq < rmin * rmin || r_sq > rmax * rmax)
    return false;

  var angle1 = modulo(deg2rad(startangle), 2 * Math.PI);
  var dx1 = xc + radius * Math.cos(angle1) - x;
  var dy1 = yc + radius * Math.sin(angle1) - y;
  if (dx1 * dx1 + dy1 * dy1 <= d * d)
    return true;

  var angle2 = modulo(deg2rad(endangle), 2 * Math.PI);
  var dx2 = xc + radius * Math.cos(angle2) - x;
  var dy2 = yc + radius * Math.sin(angle2) - y;
  if (dx2 * dx2 + dy2 * dy2 <= d * d)
    return true;

  var angle = modulo(Math.atan2(dy, dx), 2 * Math.PI);
  if (angle1 > angle2)
    return (angle >= angle2 || angle <= angle1);
  else
    return (angle >= angle1 && angle <= angle2);
}

function pointWithinPad(x, y, pad) {
  var v = [x - pad.pos[0], y - pad.pos[1]];
  v = rotateVector(v, -pad.angle);
  if (pad.offset) {
    v[0] -= pad.offset[0];
    v[1] -= pad.offset[1];
  }
  return emptyContext2d.isPointInPath(getCachedPadPath(pad), ...v);
}

function netHitScan(layer, x, y) {
  var netsHit = [];
  // Check track segments
  if (ibom_settings.renderTracks && pcbdata.tracks) {
    for (var track of pcbdata.tracks[layer]) {
      if ('radius' in track) {
        if (pointWithinDistanceToArc(x, y, ...track.center, track.radius, track.startangle, track.endangle, track.width / 2)) {
          // return track.net;
          if (!netsHit.includes(track.net)) {
            netsHit.push(track.net);
          }
        }
      } else {
        if (pointWithinDistanceToSegment(x, y, ...track.start, ...track.end, track.width / 2)) {
          // return track.net;
          if (!netsHit.includes(track.net)) {
            netsHit.push(track.net);
          }
        }
      }
    }
  }
  // Check pads
  if (ibom_settings.renderPads) {
    for (var footprint of pcbdata.footprints) {
      for (var pad of footprint.pads) {
        if (pad.layers.includes(layer) && pointWithinPad(x, y, pad)) {
          // return pad.net;
          if (!netsHit.includes(pad.net)) {
            netsHit.push(pad.net);
          }
        }
      }
    }
  }
  return netsHit;
}

function pinHitScan(layer, x, y) {
  var pinsHit = [];
  if (ibom_settings.renderPads) {
    for (var footprint of pcbdata.footprints) {
      for (var pad of footprint.pads) {
        if (pad.layers.includes(layer) && pointWithinPad(x, y, pad)) {
          let pin_name = `${footprint.ref}.${pad.padname}`;
          let pinidx = pinref_to_idx[pin_name];
          if (pinidx !== undefined && !pinsHit.includes(pinidx)) {
            pinsHit.push(pinidx);
          }
        }
      }
    }
  }
  return pinsHit;
}

function pointWithinFootprintBbox(x, y, bbox) {
  var v = [x - bbox.pos[0], y - bbox.pos[1]];
  v = rotateVector(v, bbox.angle);
  return bbox.relpos[0] <= v[0] && v[0] <= bbox.relpos[0] + bbox.size[0] &&
    bbox.relpos[1] <= v[1] && v[1] <= bbox.relpos[1] + bbox.size[1];
}

function bboxHitScan(layer, x, y) {
  var result = [];
  for (var i = 0; i < pcbdata.footprints.length; i++) {
    var footprint = pcbdata.footprints[i];
    if (footprint.layer == layer) {
      if (pointWithinFootprintBbox(x, y, footprint.bbox)) {
        result.push(i);
      }
    }
  }
  return result;
}

/**
 * Checks if the coords lie within the given box plus SCH_CLICK_BUFFER in all directions
 * @param {*} coords 
 * @param {*} box Must be in list format (see util.js)
 * @returns boolean
 */
function isClickInBox(coords, box) {
  box = box.map((b) => parseFloat(b));
  if (box[0] > box[2]) {
    var tmp = box[0];
    box[0] = box[2];
    box[2] = tmp;
  }
  if (box[1] > box[3]) {
    var tmp = box[1];
    box[1] = box[3];
    box[3] = tmp;
  }

  box[0] = box[0] - SCH_CLICK_BUFFER;
  box[1] = box[1] - SCH_CLICK_BUFFER;
  box[2] = box[2] + SCH_CLICK_BUFFER;
  box[3] = box[3] + SCH_CLICK_BUFFER;

  return box[0] <= coords.x && coords.x <= box[2] && box[1] <= coords.y && coords.y <= box[3];
}

function getMousePos(layerdict, evt) {
  var canvas = layerdict.bg;
  var transform = layerdict.transform;
  var zoomFactor = 1 / transform.zoom;

  var rect = canvas.getBoundingClientRect();  // abs. size of element
  var scaleX = canvas.width / rect.width * zoomFactor;  // relationship bitmap vs. element for X
  var scaleY = canvas.height / rect.height * zoomFactor;  // relationship bitmap vs. element for Y

  // Take into account that we actually have two separate scale and transform variable sets
  var x = ((evt.clientX - rect.left) * scaleX - transform.panx - transform.x) / transform.s;
  var y = ((evt.clientY - rect.top) * scaleY - transform.pany - transform.y) / transform.s;

  return { x: x, y: y };
}

function appendSelectionDiv(parent, val, type) {
  var div = document.createElement("div");
  div.addEventListener("click", () => {
    clickedType[type](val);
    parent.classList.add("hidden");
  });
  div.innerHTML = getElementName({ "type": type, "val": val });
  parent.appendChild(div);
}

function handleMouseClick(layerdict, e = null) {
  if (e === null) {
    // This click is from an external device
    // It must be a "layout" click
    // TODO (basic selection, multiclick)
    console.log("External click received, TODO");
    return;
  }

  if (!e.hasOwnProperty("offsetX")) {
    // The polyfill doesn't set this properly
    e.offsetX = e.pageX - e.currentTarget.offsetLeft;
    e.offsetY = e.pageY - e.currentTarget.offsetTop;
  }

  var clickmenu = document.getElementById("sch-multi-click");
  var hits = [];

  if (layerdict.layer === "S") {
    // Click in schematic
    var coords = getMousePos(layerdict, e)
    // console.log(`click in sch at (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)})`);
    for (var refid in compdict) {
      if (!compdict[refid].schids.includes(current_schematic)) continue;
      for (var unitnum in compdict[refid].units) {
        var unit = compdict[refid].units[unitnum];
        if (unit.schid == current_schematic && isClickInBox(coords, unit.bbox)) {
          hits.push({
            "val": parseInt(refid),
            "type": "comp"
          });
        }
      }
    }
    for (var pinidx in pindict) {
      if (pindict[pinidx].schid != current_schematic) continue;
      if (isClickInBox(coords, pinBoxFromPos(pindict[pinidx].pos))) {
        hits.push({
          "val": pinidx,
          "type": "pin"
        });
        if (pindict[pinidx].net) {
          hits.push({
            "val": pindict[pinidx].net,
            "type": "net"
          });
        }
      }
    }
  } else {
    // Click in layout
    var x = e.offsetX;
    var y = e.offsetY;
    var t = layerdict.transform;
    if (layerdict.layer == "B") {
      x = (devicePixelRatio * x / t.zoom - t.panx + t.x) / -t.s;
    } else {
      x = (devicePixelRatio * x / t.zoom - t.panx - t.x) / t.s;
    }
    y = (devicePixelRatio * y / t.zoom - t.y - t.pany) / t.s;
    var v = rotateVector([x, y], -ibom_settings.boardRotation);

    if (DEBUG_LAYOUT_CLICK) {
      console.log(`click in layer ${layerdict.layer} at (${x},${y})`);
      return;
    }

    for (let comp of bboxHitScan(layerdict.layer, ...v)) {
      hits.push({ "type": "comp", "val": comp });
    }
    for (let pin of pinHitScan(layerdict.layer, ...v)) {
      hits.push({ "type": "pin", "val": pin });
    }
    for (let net of netHitScan(layerdict.layer, ...v)) {
      hits.push({ "type": "net", "val": net });
    }
  }

  if (hits.length == 1) {
    // Single click, just select what was clicked
    clickedType[hits[0].type](hits[0].val);
  } else if (hits.length > 1) {
    // Multi click
    // Clear existing children and position menu at click
    // TODO make sure menu can't go out of #display
    clickmenu.innerHTML = "";
    clickmenu.style.top = e.clientY + "px";
    clickmenu.style.left = e.clientX + "px";

    for (let hit of hits) {
      appendSelectionDiv(clickmenu, hit.val, hit.type);
    }
    clickmenu.classList.remove("hidden");
  } else {
    // Clicked on nothing
    clickmenu.classList.add("hidden");
    document.getElementById("search-content").classList.add("hidden");
    deselectClicked();
  }
}

function switchSchematic(schid) {
  current_schematic = schid;

  updateTargetBoxes();

  document.querySelectorAll("#sch-selection>div").forEach((div) => {
    div.classList.remove("current");
    if (div.innerText.startsWith(schid + ".")) {
      div.classList.add("current");
    }
  });

  // resizeCanvas(schematic_canvas);
  var canvas = document.getElementById("schematic-canvas");
  recalcLayerScale(schematic_canvas, canvas.clientWidth * devicePixelRatio, canvas.clientHeight * devicePixelRatio);

  var schdim = schdata.schematics[schid_to_idx[schid]].dimensions;

  var xfactor = parseFloat(schematic_canvas.bg.width) / parseFloat(schdim.x)
  var yfactor = parseFloat(schematic_canvas.bg.height) / parseFloat(schdim.y)

  sch_zoom_default = Math.min(xfactor, yfactor) / schematic_canvas.transform.s;

  // Triggers redraw
  schematic_canvas.img.src = `http://${window.location.host}/sch${schid}`;

  clearCanvas(schematic_canvas.bg);
  clearCanvas(schematic_canvas.highlight);
  resetTransform(schematic_canvas);
}
