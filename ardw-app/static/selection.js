// This file is included on all webpages.
// It contains functions for selecting schematic sheets and components,
// including schematic hitscan and the general click handler.
// This file should generally not be modified.


/** Buffer added around the hitbox of schematic components */
var SCH_CLICK_BUFFER = 20;

/** Bounding box side length of schematic pins (which have a single coordinate) */
var PIN_BBOX_SIZE = 50;

/**
 * The socket that communicates with the server
 * - socket.emit(label, data) sends an event to the server
 * - socket.on(label, data) receives an event from the server
 * 
 * socket.on() calls should be in the primary file of a page (eg. main.js)
 */
var socket;

/** current desktop selection, mutually exclusive with tool_selections */
var current_selection = {
  "type": null,
  "val": null
}

/**
 * Keeps track of locations and "selections" for each probe
 * Colors come from config.ini
 * location is {x, y} in layout mm, selection is {type, val}
 * Note: tool selections are mutually exclusive with current_selection
 * Note: selections can also come from the debug session highlighting the next card
 */
var probes = {
  "probe": {
    "location": null,
    "selection": null,
    "color": {
      "loc": null,
      "sel": null,
      "zone": null
    }
  },
  "pos": {
    "location": null,
    "selection": null,
    "color": {
      "loc": null,
      "sel": null,
      "zone": null
    }
  },
  "neg": {
    "location": null,
    "selection": null,
    "color": {
      "loc": null,
      "sel": null,
      "zone": null
    }
  },
  "osc": {
    "location": null,
    "selection": null,
    "color": {
      "loc": null,
      "sel": null,
      "zone": null
    }
  }
}

/** Keeps track of the normalized probe end y-delta, s.t. row height is 1 */
var probe_end_delta = null;

/** Holds the current annotation text, only used in projector view */
var debug_annotation = null;

/** Maximum zoom level where entire schematic fits in the available space
 * Note this differs for each schematic sheet */
var sch_zoom_default;

/** If true, a crosshair is drawn to show the selection */
var draw_crosshair = false;
/** The boxes that the crosshair or zoom-to-find function target */
var target_boxes = {
  "S": null,
  "F": null,
  "B": null
};


/** iff true, we're currently doing a Task 1B step and need different click behavior */
var study_listening_for_1B = false;

/** iff study_listening_for_1B is true, this contains the refid of the component we're looking for */
var study_component = null;


/** Updates the bounding boxes that are used internally to zoom to selected components */
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

/** Given a component refid, updates interface to reflect the selection */
function selectComponent(refid) {
  // Permitting only single selection
  var selected = parseInt(refid);
  if (compdict[selected] == undefined) {
    logerr(`selected refid ${selected} is not in compdict`);
    return;
  }
  deselectAll(false);
  current_selection.type = "comp";
  current_selection.val = selected;

  var comp = compdict[selected];

  // Update the icons on the schematic sheet selection menu
  document.querySelectorAll("#sch-selection>div").forEach((div) => {
    div.classList.remove("has-selection");
    for (let schid of comp.schids) {
      if (div.innerText.startsWith(schid + ".")) {
        div.classList.add("has-selection");
        break;
      }
    }
  });

  // Update the search bar text and unit arrows
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

/** Given a pin idx inside a list, updates interface to reflect the selection */
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

  // Update the icons on the schematic sheet selection menu
  document.querySelectorAll("#sch-selection>div").forEach((div) => {
    div.classList.remove("has-selection");
    if (div.innerText.startsWith(pin.schid + ".")) {
      div.classList.add("has-selection");
    }
  });

  // Update the search bar text
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

/** Given a netname, updates interface to reflect the selection */
function selectNet(selected) {
  if (!(selected in netdict)) {
    logerr(`selected net ${selected} is not in netdict`);
    return;
  }
  deselectAll(false);

  current_selection.type = "net";
  current_selection.val = selected;

  // Update the icons on the schematic sheet selection menu
  document.querySelectorAll("#sch-selection>div").forEach((div) => {
    div.classList.remove("has-selection");
    for (let schid of netdict[selected]["schids"]) {
      if (div.innerText.startsWith(schid + ".")) {
        div.classList.add("has-selection");
        break;
      }
    }
  });

  // Update the search bar text
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

/** Remove any current selection (set redraw=False if highlights are getting redrawn later) */
function deselectAll(redraw) {
  current_selection.type = null;
  current_selection.val = null;
  
  // TODO make sure we don't have a leak
  tool_selections = [];
  
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

/**
 * Creates and displays the disambiguation menu
 * point is [x,y] click location (clientXY for schematic, layout coords for layout)
 * layer is "S"/"F"/"B"
 * hits is list of options {type, val} to display and click on
 */
function multiMenu(point, layer, hits) {
  // console.log(`multi menu from ${layer}`)
  if (layer != "S") {
    point = layoutToClientCoords(point, layer);
  }

  // Clear existing children and position menu at click
  // TODO make sure menu can't go out of #display

  var clickmenu = document.getElementById("sch-multi-click");
  clickmenu.innerHTML = "";
  clickmenu.style.left = point[0] + "px";
  clickmenu.style.top = point[1] + "px";

  for (let hit of hits) {
    appendSelectionDiv(clickmenu, hit.val, hit.type);
  }
  clickmenu.classList.remove("hidden");
}

/** \<type\>Clicked() functions should be called whever the client wants to select something
 * The actual selection and display is handled when the server echoes the selection back,
 * using the select\<type\>() functions in render.js */ 
var clickedType = {
  "comp": componentClicked,
  "pin": pinClicked,
  "net": netClicked,
  "deselect": deselectClicked
}
/** See clickedType */
function componentClicked(refid) {
  refid = parseInt(refid);
  if (compdict[refid] == undefined) {
    logerr(`clicked refid ${refid} is not in compdict`);
    return;
  }
  socket.emit("selection", { "type": "comp", "val": refid });
}
/** See clickedType */
function pinClicked(pinidx) {
  if (pindict[pinidx] == undefined) {
    logerr(`clicked pinidx ${pinidx} is not in pindict`);
    return;
  }
  socket.emit("selection", { "type": "pin", "val": pinidx });
}
/** See clickedType */
function netClicked(netname) {
  if (!(netname in netdict)) {
    logerr(`clicked net ${netname} is not in netdict`);
    return;
  }
  socket.emit("selection", { "type": "net", "val": netname });
}
/** See clickedType */
function deselectClicked() {
  socket.emit("selection", { "type": "deselect", "val": null });
}

/** A function from IBOM used in netHitScan() */
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

/** A function from IBOM used in netHitScan() */
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

/** A function from IBOM used in several hitscan functions */
function pointWithinPad(x, y, pad) {
  var v = [x - pad.pos[0], y - pad.pos[1]];
  v = rotateVector(v, -pad.angle);
  if (pad.offset) {
    v[0] -= pad.offset[0];
    v[1] -= pad.offset[1];
  }
  return emptyContext2d.isPointInPath(getCachedPadPath(pad), ...v);
}

/** A function from IBOM used in bboxHitScan() */
function pointWithinFootprintBbox(x, y, bbox) {
  var v = [x - bbox.pos[0], y - bbox.pos[1]];
  v = rotateVector(v, bbox.angle);
  return bbox.relpos[0] <= v[0] && v[0] <= bbox.relpos[0] + bbox.size[0] &&
    bbox.relpos[1] <= v[1] && v[1] <= bbox.relpos[1] + bbox.size[1];
}

/** DEPRECATED (checks which nets were hit) */
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

/** DEPRECATED (checks which pins were hit) */
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

/** DEPRECATED (checks which components were hit) */
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

/** Gets the schematic coordinates of a click event */
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

/** Creates a menu item div with text and a listener to select a specific comp/pin/net */
function appendSelectionDiv(parent, val, type) {
  var div = document.createElement("div");
  div.addEventListener("click", () => {
    clickedType[type](val);
    parent.classList.add("hidden");
  });
  div.innerHTML = getElementName({ "type": type, "val": val });
  parent.appendChild(div);
}

/** Handles mouse clicks in both the schematic and the layout */
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

  if (layerdict.layer === "S") {
    // Click in schematic
    var coords = getMousePos(layerdict, e)
    // console.log(`click in sch at (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)})`);

    var hits = [];
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

    if (study_listening_for_1B) {
      // We're doing study task 1B, so auto disambiguate
      for (let hit of hits) {
        if (hit.type == "comp" && hit.val == study_component) {
          socket.emit("study-event", {"event": "select", "refid": hit.val})
          break;
        }
      }
      return;
    }

    if (hits.length == 1) {
      // Single click, just select what was clicked
      clickedType[hits[0].type](hits[0].val);
    } else if (hits.length > 1) {
      multiMenu([e.clientX, e.clientY], layerdict.layer, hits)
    } else {
      // Clicked on nothing
      deselectClicked();
    }
  } else {
    // Click in layout, send to server instead of processing here
    var coords = offsetToLayoutCoords([e.offsetX, e.offsetY], layerdict)
    // console.log(`layout click at (${coords[0]},${coords[1]}`)

    if (study_listening_for_1B) {
      // We're doing study task 1B, so pass it to server
      socket.emit("study-event", {
        event: "select",
        point: coords,
        layer: layerdict.layer,
        pads: ibom_settings.renderPads,
        tracks: ibom_settings.renderTracks
      })
      return;
    }

    socket.emit("selection", {
      source: "point",
      point: coords,
      layer: layerdict.layer,
      pads: ibom_settings.renderPads,
      tracks: ibom_settings.renderTracks
    })
  }
}

/** Switches the schematic sheet */
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
  console.log(`switching to schid ${schid}`)
  schematic_canvas.img.src = `http://${window.location.host}/sch${schid}`;

  clearCanvas(schematic_canvas.bg);
  clearCanvas(schematic_canvas.highlight);
  resetTransform(schematic_canvas);
}
