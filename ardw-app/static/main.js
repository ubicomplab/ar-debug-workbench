// This is the primary file for the main webpage (the schematic and layout views)
// It calls initialization functions from other files for the page.
// It also contains many elements that are unique to the main page, such as the
// components of the settings menu, the tool bar, and the debug session view.


/** Minimum proportion of the screen that different elements
 * should take up for autozoom and crosshair */
var VIEW_MINIMUMS = {
  "sch": {
    "comp": 0.1,
    "pin": 0.04,
    "net": 0.5
  },
  "layout": {
    "footprint": 0.1,
    "pad": 0.02
  }
};
/** Maximum proportion of the screen that elements
 * should take up for autozoom and crosshair */
var VIEW_MAXIMUM = 0.8;

/** Length of the crosshair lines () */
var CROSSHAIR_LENGTH = 100000;

/** Time in ms until popups (for tool workflow) close */
var POPUP_AUTO_CLOSE = 3000;

// Document elements for the search arrows
var search_nav_num = null;
var search_nav_text = null;

var search_nav_current = [0, 0];

/** Transform values for the projector view */
var projector_sliders = {
  "tx": {},
  "ty": {},
  "r": {},
  "z": {}
};

/** True when manual adjustment of the projector view is enabled */
var adjust_with_keys = false;

var sidebar_custom_selection = {
  "pos": {
    "type": null,
    "val": null
  },
  "neg": {
    "type": null,
    "val": null
  }
};

/** true iff sidebar is open; independent of debug session state */
var sidebar_is_open = false;

/** true iff we are currently recording measurements */
var active_session_is_recording = false;

/**
 * Tracks all the currently enabled tools
 * - name: display name of device
 * - ready: true when device is fully set up
 * - device?: true when measurement device is connected
 * - selection: {probe: null when not connected, false when connected,
            and true (WIP) when it's the source of the last selection}
 */
var tool_ready_state = {
  "ptr": {
    "name": "Selection Probe",
    "ready": false,
    "selection": null,
  },
  "dmm": {
    "name": "DMM",
    "ready": false,
    "device": false,
    "selection": {
      "pos": null, // red
      "neg": null, // black
    }
  },
  "osc": {
    "name": "Oscilloscope",
    "ready": false,
    "device": false,
    "selection": {
      "1": null, // yellow
      "2": null, // green
      "3": null, // blue
      "4": null, // pink
    }
  }
};

var active_tool_request = false;

var sidebar_shown = false;

/** Controls size of debug session sidebar */
var sidebar_split = Split(["#display", "#sidebar"], {
  sizes: [100, 0],
  minSize: 0,
  gutterSize: 5,
  onDragEnd: resizeAll
});
/** Controls relative size of schematic and layout views */
var display_split = Split(["#schematic-div", "#layout-div"], {
  sizes: [50, 50],
  minSize: 0,
  gutterSize: 5,
  onDragEnd: resizeAll
});
/** Controls relative size of front and back layout views */
var canvas_split = Split(["#front-canvas", "#back-canvas"], {
  sizes: [50, 50],
  minSize: 0,
  gutterSize: 5,
  direction: "vertical",
  onDragEnd: resizeAll
});


/** Sound played on task success */
var sound_success = new Audio("sound/success");
/** Sound played on task failure */
var sound_failure = new Audio("sound/fail");


/**
 * Zooms layerdict to match given bbox and targetsize, rotating appropriately for layout
 * @param {*} layerdict Any layerdict
 * @param {*} bbox Must be in obj format (see util.js)
 * @param {*} targetsize From VIEW_MINIMUMS
 */
function zoomToBox(layerdict, bbox, targetsize) {
  if (layerdict.layer !== "S") {
    bbox = applyRotation(bbox);
  }

  var minwidth = bbox["maxx"] - bbox["minx"];
  var minheight = bbox["maxy"] - bbox["miny"];
  var centerx = (bbox["minx"] + bbox["maxx"]) / 2;
  var centery = (bbox["miny"] + bbox["maxy"]) / 2;
  // console.log(`min window is ${minwidth}x${minheight} at (${centerx},${centery})`);

  var viewwidth = layerdict.bg.width / (layerdict.transform.zoom * layerdict.transform.s);
  var viewheight = layerdict.bg.height / (layerdict.transform.zoom * layerdict.transform.s);

  var xrat = minwidth / viewwidth;
  var yrat = minheight / viewheight;

  var maxrat = Math.max(xrat, yrat);

  // Only zoom if the target will be too small or too large
  if (maxrat < targetsize || maxrat > VIEW_MAXIMUM) {
    if (maxrat > VIEW_MAXIMUM) {
      targetsize = VIEW_MAXIMUM;
    }
    var schdim = schdata.schematics[schid_to_idx[current_schematic]].dimensions;
    var xzoom = schdim.x * sch_zoom_default * targetsize / minwidth;
    var yzoom = schdim.y * sch_zoom_default * targetsize / minheight;

    var newzoom = Math.min(xzoom, yzoom);
    // console.log(`zoom ${layerdict.transform.zoom} => ${newzoom} (def. ${sch_zoom_default})`)
    newzoom = Math.max(newzoom, sch_zoom_default);


    layerdict.transform.zoom = newzoom;
  }

  // Always pan
  var newvw = layerdict.bg.width / (layerdict.transform.zoom * layerdict.transform.s);
  var newvh = layerdict.bg.height / (layerdict.transform.zoom * layerdict.transform.s);

  var newpx = ((newvw / 2) - centerx) * layerdict.transform.s - layerdict.transform.x;
  var flip = (layerdict.layer == "B")
  if (flip) {
    newpx = -newpx + (layerdict.bg.width / layerdict.transform.zoom);
  }
  var newpy = ((newvh / 2) - centery) * layerdict.transform.s - layerdict.transform.y;
  // console.log(`pan (${layerdict.transform.panx},${layerdict.transform.pany}) => (${newpx},${newpy})`);
  layerdict.transform.panx = newpx;
  layerdict.transform.pany = newpy;

  redrawCanvas(layerdict);
}

/** Autozooms schematic and layout to the current target boxes (search bar arrows) */
function zoomToTargetBoxes(schmin, layoutmin) {
  var layerdicts = {
    "S": schematic_canvas,
    "F": allcanvas.front,
    "B": allcanvas.back
  };

  for (let layer in target_boxes) {
    if (target_boxes[layer] !== null) {
      if (target_boxes[layer].length > 0) {
        let targetsize = layer === "S" ? schmin : layoutmin;
        // console.log(`finding ${target_boxes[layer]} on ${layer}`)
        zoomToBox(layerdicts[layer], bboxListToObj(target_boxes[layer]), targetsize);
      } else {
        // console.log(`resetting ${layer}`)
        resetTransform(layerdicts[layer]);
      }
    }
  }
}

/** Autozooms schematic and layout to the current selection (whole components, ignores search bar arrows) */
function zoomToSelection(layerdict) {
  var targetsize = null;
  if (current_selection.type === null) {
    return;
  }
  if (layerdict.layer === "S") {
    targetsize = VIEW_MINIMUMS["sch"][current_selection.type];
  } else {
    if (current_selection.type === "comp") {
      targetsize = VIEW_MINIMUMS["layout"]["footprint"];
    } else if (current_selection.type === "pin") {
      targetsize = VIEW_MINIMUMS["layout"]["pad"];
    }
  }

  if (targetsize === null || target_boxes[layerdict.layer] === null) {
    return;
  }

  zoomToBox(layerdict, bboxListToObj(target_boxes[layerdict.layer]), targetsize);
}

/** Generic search handler for search bars */
function searchHandler(tokens, divs) {
  for (var i = 0; i < divs.length; i++) {
    let val = divs[i].innerText.toLowerCase();
    let match = true;
    for (let token of tokens) {
      if (val.indexOf(token) == -1) {
        match = false;
        break;
      }
    }
    if (match) {
      divs[i].classList.remove("hidden");
    } else {
      divs[i].classList.add("hidden");
    }
  }
}

/** Handler for main search bar text input */
function searchBarHandler() {
  var input = document.getElementById("search-input");
  var filter = input.value.toLowerCase();
  var tokens = filter.split(/(\s+)/).filter(e => e.trim().length > 0);

  var divs = document.getElementById("search-content").getElementsByTagName("div");

  searchHandler(tokens, divs);
}

/** Handler for X button on the search bar (deselects) */
function searchBarX() {
  var searchlist = document.getElementById("search-content");
  var input = document.getElementById("search-input");
  searchlist.classList.add("hidden");
  input.value = "";
  deselectClicked();
  input.focus();
}

/** Handler for arrows under search bar: autozooms or puts crosshair on next element of selection */
function searchNav(dir) {
  if (search_nav_current[1] > 1) {
    // We have a multi-part selection
    if (dir === "L") {
      search_nav_current[0] -= 1;
      if (search_nav_current[0] === 0) {
        search_nav_current[0] = search_nav_current[1];
      }
    } else {
      search_nav_current[0] += 1;
      if (search_nav_current[0] > search_nav_current[1]) {
        search_nav_current[0] = 1;
      }
    }

    search_nav_num.innerText = `${search_nav_current[0]} of ${search_nav_current[1]}`;

    if (current_selection.type === "comp") {
      let comp = compdict[current_selection.val];
      let unit = Object.values(comp.units)[search_nav_current[0] - 1];
      search_nav_text.innerText = `${comp.ref} ${unit.num}`;

      if (unit.schid != current_schematic) {
        switchSchematic(unit.schid);
      }

      target_boxes["S"] = unit.bbox.map((i) => parseFloat(i));
      let footprint = pcbdata.footprints[current_selection.val];
      for (let layer of ["F", "B"]) {
        // Do nothing to layer that doesn't have the component
        target_boxes[layer] = footprint.layer == layer ? bboxPcbnewToList(footprint.bbox) : null;
      }

      if (settings["find-type"] === "zoom") {
        zoomToTargetBoxes(VIEW_MINIMUMS["sch"]["comp"], VIEW_MINIMUMS["layout"]["footprint"]);
      } else {
        console.log("TODO comp xhair")
        draw_crosshair = true;
        drawHighlights();
        drawSchematicHighlights();
      }
      // TODO emphasize this unit somehow
    }
    if (current_selection.type === "net") {
      let pin = pindict[netdict[current_selection.val]["pins"][search_nav_current[0] - 1]];
      search_nav_text.innerText = `${pin.ref}.${pin.num}`;

      if (pin.schid != current_schematic) {
        switchSchematic(pin.schid);
      }

      target_boxes["S"] = pinBoxFromPos(pin.pos);
      for (let pad of pcbdata.footprints[ref_to_id[pin.ref]].pads) {
        if (pad.padname == pin.num) {
          if (pad.layers.length > 1) {
            logwarn(`ref ${pin.ref} pad ${pad.padname} has several layers`)
          }
          for (let layer of ["F", "B"]) {
            target_boxes[layer] = pad.layers.includes(layer) ? bboxPcbnewToList(pad) : null;
          }
          break;
        }
      }

      if (settings["find-type"] === "zoom") {
        zoomToTargetBoxes(VIEW_MINIMUMS["sch"]["pin"], VIEW_MINIMUMS["layout"]["pad"]);
      } else {
        console.log("TODO net xhair")
        draw_crosshair = true;
        drawHighlights();
        drawSchematicHighlights();
      }
      // TODO emphasize this pin somehow
    }
  }
}

// ----- Skeleton functions for tool connection and debug session interfaces ----- //
function toolPopupX() {
  document.getElementById("tool-popup").classList.add("hidden");
}

function toolButton(type) {
  if (!tool_ready_state[type].ready && !active_tool_request) {
    console.log(`Requesting ${type} tool`);
    socket.emit("tool-request", { "type": type, "val": "device" });
  } else if (tool_ready_state[type].ready) {
    console.log(`tool ${type} is already ready`);
  } else {
    // Show active tool request
    document.getElementById("tool-popup").classList.remove("hidden");
  }
}

function toolRequest(data) {
  var popup = document.getElementById("tool-popup");
  var popup_title = document.getElementById("tool-popup-title");
  var popup_text = document.getElementById("tool-popup-text");
  var popup_buttons = document.getElementById("tool-popup-buttons");

  console.log(data)

  if (tool_ready_state[data.type].ready) {
    // This should never happen
    logerr(`Received ${data.type} tool request from server that was already ready`);
    popup_title.innerText = tool_ready_state[data.type].name;
    popup_text.innerText = "Already connected, closing...";
    popup_buttons.innerHTML = "";
    popup.classList.remove("hidden");
    setTimeout(toolPopupX, POPUP_AUTO_CLOSE);
  } else {
    popup_title.innerText = `Connecting ${tool_ready_state[data.type].name}`;
    switch (data.type) {
      case "ptr":
        popup_text.innerHTML = `Connecting ${tool_ready_state.ptr.name.toLowerCase()} with Optitrack<br />{optitrack instructions}`;
        popup_buttons.innerHTML = "";
        break;
      case "dmm":
        popup_buttons.innerHTML = "";
        if (data.val === "device") {
          popup_text.innerHTML = "Trying to find DMM. Ensure device is properly connected.";
        } else {
          popup_text.innerHTML = `Connecting ${data.val} probe with Optitrack<br />{optitrack instructions}`;
          // TODO loading icon or something
        }
        break;
      case "osc":
        console.log("TODO osc connection");
        break;
    }

    popup.classList.remove("hidden");
  }
}

function toolConnect(data) {
  var popup = document.getElementById("tool-popup");
  var popup_title = document.getElementById("tool-popup-title");
  var popup_text = document.getElementById("tool-popup-text");
  var popup_buttons = document.getElementById("tool-popup-buttons");

  popup_title.innerText = `Connecting ${tool_ready_state[data.type].name}`;

  // for now, everything is a success
  data["status"] = "success";

  if (data.status === "success") {
    switch (data.type) {
      case "ptr":
        console.log("ptr connected and ready to use");
        tool_ready_state.ptr.ready = true;
        tool_ready_state.ptr.selection = false;

        popup_text.innerHTML = "Probe connected! Closing..."
        popup_buttons.innerHTML = "";
        setTimeout(toolPopupX, POPUP_AUTO_CLOSE);

        var toolbutton = document.getElementById("tools-ptr");
        toolbutton.classList.add("ready");
        toolbutton.innerHTML = "PTR";

        break;
      case "dmm":
        if (data.val == "pos") {
          console.log("dmm pos probe connected");
          tool_ready_state.dmm.selection.pos = false;
          popup_text.innerHTML = "Positive probe connected.";
        } else if (data.val == "neg") {
          console.log("dmm neg probe connected");
          tool_ready_state.dmm.selection.neg = false;
          popup_text.innerHTML = "Negative probe connected.";
        } else {
          console.log("dmm connected");
          tool_ready_state.dmm.device = true;
          popup_text.innerHTML = "Device connected. Click below to add probes with optitrack.";
        }

        popup_buttons.innerHTML = "";
        for (let dir in tool_ready_state.dmm.selection) {
          let div = document.createElement("div");
          div.classList.add("button");
          div.classList.add(`dmm-probe-${dir}`);
          if (tool_ready_state.dmm.selection[dir] === null) {
            // has not yet been added
            div.innerHTML = `+ ${dir.toUpperCase()}`;
            div.addEventListener("click", () => {
              socket.emit("tool-request", { "type": data.type, "val": dir });
            });
          } else {
            // has already been added
            div.innerHTML = `${dir.toUpperCase()}`;
            div.classList.add("ready");
            div.classList.add("disabled");
          }
          popup_buttons.appendChild(div);
        }

        // if (tools.dmm.device && tools.dmm.selection.pos !== null && tools.dmm.selection.neg !== null) {
        if (data.ready) {
          console.log("dmm ready to use")
          tool_ready_state.dmm.ready = true;

          popup_text.innerHTML += `<br />${tool_ready_state.dmm.name} ready to use, closing...`
          setTimeout(toolPopupX, POPUP_AUTO_CLOSE);

          var toolbutton = document.getElementById("tools-dmm");
          toolbutton.classList.add("ready");
          toolbutton.innerHTML = "DMM";
        }
        break;
      case "osc":
        if (data.val == "osc") {
          console.log("osc connected");
          tool_ready_state.osc.device = true;
          popup_text.innerHTML = "Device connected. Click below to add probes with optitrack.";

        } else {
          console.log(`osc chan ${data.val} probe connected`);
          tool_ready_state.osc.selection[data.val] = false;
        }
        if (tool_ready_state.osc.device) {
          let channels_ready = 0;
          for (let chan in tool_ready_state.osc.selection) {
            if (tool_ready_state.osc.selection[chan] !== null) {
              channels_ready += 1;
            }
          }
          if (channels_ready > 1) {
            console.log("osc ready to use");
            tool_ready_state.osc.ready = true;

            popup_text.innerHTML += `<br />${tool_ready_state.osc.name} ready to use`;
            if (channels_ready == 4) {
              popup_text.innerHTML += ", closing...";
              setTimeout(toolPopupX, POPUP_AUTO_CLOSE);
            }

            var toolbutton = document.getElementById("tools-soc");
            toolbutton.classList.add("ready");
            toolbutton.innerHTML = "OSC";
          }
        }
        break;
    }
    popup.classList.remove("hidden");
  } else {
    console.log(`${data.type} ${data.val} failed to connect`);

    if (data.val === "device") {
      // Device connection failed
      popup_text.innerHTML = `${tool_ready_state[data.type].name} was not found or failed to connect.`;
      popup_buttons.innerHTML = "";

      let retry_button = document.createElement("div");
      retry_button.innerHTML = "Retry";
      retry_button.classList.add("button");
      retry_button.addEventListener("click", () => {
        socket.emit("tool-request", { "type": data.type, "val": data.val });
      });
      popup_buttons.appendChild(retry_button);

      let exit_button = document.createElement("div");
      exit_button.innerHTML = "Cancel";
      exit_button.classList.add("button");
      exit_button.addEventListener("click", toolPopupX);
      popup_buttons.appendChild(exit_button);
    } else {
      // Probe connection failed
      popup_text.innerHTML = `Probe ${data.val} failed to connect. Ensure Optitrack is working and try again.`;
      popup_buttons.innerHTML = "";
      for (let dir in tool_ready_state.dmm.selection) {
        let div = document.createElement("div");
        div.classList.add("button");
        div.classList.add(`dmm-probe-${dir}`);
        if (tool_ready_state.dmm.selection[dir] === null) {
          // has not yet been added
          div.innerHTML = `+ ${dir.toUpperCase()}`;
          div.addEventListener("click", () => {
            socket.emit("tool-request", { "type": data.type, "val": dir });
          });
        } else {
          // has already been added
          div.innerHTML = `${dir.toUpperCase()}`;
          div.classList.add("ready");
          div.classList.add("disabled");
        }
        popup_buttons.appendChild(div);
      }
    }
    popup.classList.remove("hidden");
  }
}

/** Shows or hides debug session sidebar */
function toggleSidebar(x = false) {
  var text = document.getElementById("open-debug").querySelector("span");
  if (x || sidebar_is_open) {
    sidebar_split.collapse(1);
    sidebar_is_open = false;
    text.innerHTML = "Show Debug Panel ";
  } else {
    // Resizes so that the debug panel is 305 pixels, which is a magic number that makes it look nice
    var min_percent = Math.ceil(305 / document.getElementById("main").offsetWidth * 100);
    sidebar_split.setSizes([100 - min_percent, min_percent]);
    sidebar_is_open = true;
    text.innerHTML = "Hide Debug Panel ";
  }
  resizeAll();
}

/** Handler for the debug session record button */
function recordButton() {
  // socket.emit("debug-session", { "event": "record", "record": !active_session_is_recording });
  socket.emit("debug-session", {"event": "record"});
}

/** Updates the client recording state */
function setRecordState(record) {
  var button = document.getElementById("record-button");
  var icon = document.getElementById("record-icon");
  if (record) {
    button.classList.add("on");
    icon.classList.remove("hidden");
    active_session_is_recording = true
  } else {
    button.classList.remove("on");
    icon.classList.add("hidden");
    active_session_is_recording = false
  }
}

/** Handler for debug sidebar (part of custom debug card creation) */
function sidebarSearchHandler(dir) {
  // TODO query selector name stuff is in case we want multiple customs at once
  var input = document.getElementById("sidebar-custom-dmm").querySelector(`input[name="${dir}"]`);
  var filter = input.value.toLowerCase();
  var tokens = filter.split(/(\s+)/).filter(e => e.trim().length > 0);

  var divs = document.getElementById("sidebar-custom-dmm").querySelector(`div[name="${dir}-content"]`).getElementsByTagName("div");

  searchHandler(tokens, divs);

  // We only want to allow selections by clicking on a list item, so typing erases saved value
  sidebar_custom_selection[dir].type = null;
  sidebar_custom_selection[dir].val = null;
}

/** Resets menu for custom debug card creation */
function resetSidebarCustom() {
  sidebar_custom_selection.pos.type = null;
  sidebar_custom_selection.pos.val = null;
  sidebar_custom_selection.neg.type = null;
  sidebar_custom_selection.neg.val = null;

  var sidebar_custom = document.getElementById("sidebar-custom-dmm");
  sidebar_custom.querySelector('*[name="pos"]').value = "";
  sidebar_custom.querySelector('*[name="neg"]').value = "";
  sidebar_custom.querySelector('*[name="lo"]').value = "";
  sidebar_custom.querySelector('*[name="hi"]').value = "";
  sidebar_custom.querySelector('*[name="unit-prefix"]').value = "none";
  sidebar_custom.querySelector('*[name="unit"]').value = "none";

  // Refresh the search bar contents
  sidebarSearchHandler("pos");
  sidebarSearchHandler("neg");
}

/** Returns true if the cards have the same pos, neg, and unit */
function doCardsMatch(card1, card2) {
  return card1.pos.type == card2.pos.type &&
    card1.pos.val == card2.pos.val &&
    card1.neg.type == card2.neg.type &&
    card1.neg.val == card2.neg.val &&
    card1.unit == card2.unit;
}

/** Adds a new debug session card */
function addDebugCard(card, id) {
  var div = document.createElement("div");
  div.classList.add("sidebar-card", `card-${id}`);
  var valtext = card.val !== null ? String(card.val) : "--";
  if (card.unit !== null) {
    valtext += card.unit;
  }
  div.innerHTML =
    `<div class="card-row">
        <span style="background: red;">&nbsp;</span>
        <span class="sidebar-card-search">${getElementName(card.pos)}</span>
    </div>
    <div class="card-row">
        <span style="background: black;">&nbsp;</span>
        <span class="sidebar-card-search">${getElementName(card.neg)}</span>
    </div>
    <div class="card-row">
        <span class="sidebar-result">${valtext}</span>
    </div>`;

  if (card.lo !== null || card.hi !== null) {
    var lospan = document.createElement("span");
    lospan.classList.add("bound");
    if (card.lo !== null) {
      lospan.innerHTML = card.lo;
      if (card.val !== null) {
        lospan.classList.add(card.val >= card.lo ? "good" : "bad");
      }
    } else {
      lospan.innerHTML = "n/a";
    }
    var hispan = document.createElement("span");
    hispan.classList.add("bound");
    if (card.hi !== null) {
      hispan.innerHTML = card.hi;
      if (card.val !== null) {
        hispan.classList.add(card.val <= card.hi ? "good" : "bad");
      }
    } else {
      hispan.innerHTML = "n/a";
    }

    var bounddiv = document.createElement("div");
    bounddiv.innerHTML = "(";
    bounddiv.appendChild(lospan);
    bounddiv.innerHTML += "-";
    bounddiv.appendChild(hispan);
    if (card.unit !== null) {
      bounddiv.innerHTML += card.unit;
    }
    bounddiv.innerHTML += " )";

    div.querySelector(".card-row:last-child").appendChild(bounddiv);
  }

  document.getElementById("sidebar-cards").appendChild(div);
}

/** Updates an existing debug session card */
function updateDebugCard(card, id) {
  var bottom_row = document.getElementById("sidebar-cards").querySelector(`.card-${id}>*:last-child`);
  bottom_row.querySelector('.sidebar-result').innerHTML = `${card.val}${card.unit}`;
  let bounds = bottom_row.querySelectorAll('.bound');
  if (card.lo !== null) {
    if (card.lo <= card.val) {
      bounds[0].classList.add("good");
    } else {
      bounds[0].classList.add("bad");
    }
  }
  if (card.hi !== null) {
    if (card.hi >= card.val) {
      bounds[1].classList.add("good");
    } else {
      bounds[1].classList.add("bad");
    }
  }
}

/** Handles a debug session event (from server socket) */
function debugSessionEvent(data) {
  console.log("debug session event")
  console.log(data);
  var sidebar = document.getElementById("sidebar");
  switch (data.event) {
    case "new":
    case "edit":
      // A client requested a new debug session or is editing an existing one
      sidebar.querySelector('*[name="sidebar-name"]').value = data.name;
      sidebar.querySelector('*[name="sidebar-notes"]').value = data.notes;
      sidebar.querySelector('*[name="sidebar-timestamp"]').innerHTML = data.timestamp;
      break;
    case "measurement":
      sound_success.play();
    case "custom":
      if (data.update) {
        // Measurement for existing card
        updateDebugCard(data.card, data.id);
      } else {
        // Custom card, or measurement without corresponding card
        addDebugCard(data.card, data.id);
      }
      break;
    case "record":
      setRecordState(data.record);
      if (!active_session_is_recording) {
        probes.pos.selection = null;
        probes.neg.selection = null;
        probes.osc.selection = null;
        drawHighlights();
      }
      break;
    case "save":
      // Session was saved and exited, so wipe all fields and close the sidebar
      sidebar.querySelector('*[name="sidebar-name"]').value = "";
      sidebar.querySelector('*[name="sidebar-name"]').placeholder = `Debug Session ${data.count + 1}`;
      sidebar.querySelector('*[name="sidebar-notes"]').value = "";
      sidebar.querySelector('*[name="sidebar-timestamp"]').innerHTML = "";

      let custom_card = document.getElementById("sidebar-custom-dmm");
      let sidebar_cards = document.getElementById("sidebar-cards");
      sidebar_cards.innerHTML = "";
      sidebar_cards.appendChild(custom_card);

      setRecordState(false);
      toggleSidebar(true);

      break;
    case "export":
      console.log("export is WIP");
      break;
    case "next":
      // TODO support osc
      if (active_session_is_recording) {
        let sidebar_cards = document.getElementById("sidebar-cards");
        for (let card of sidebar_cards.children) {
          card.classList.remove("selected");
        }
        if (data.id == -1) {
          probes.pos.selection = null;
          probes.neg.selection = null;
          probes.osc.selection = null;
          drawHighlights();
        } else {
          // Highlight the next card
          probes.pos.selection = data.card.pos;
          probes.neg.selection = data.card.neg;
          drawHighlights();
          sidebar_cards.querySelector(`.card-${data.id}`).classList.add("selected");
        }
      }
      break;
  }
}
// ----- End tool and debug session functions ----- //


/**
 * Parses a text value (eg. from an input[type=text]) into a bounded integer
 * @param {*} val text value
 * @param {*} lo lower bound (inclusive)
 * @param {*} hi upper bound (inclusive)
 * @param {*} def default value if val is NaN
 * @param {*} increment increment to be applied to text value
 * @returns integer value
 */
 function intFromText(val, lo, hi, def = 0, increment = 0) {
  val = parseInt(val) + increment;
  if (isNaN(val)) {
    return def;
  } else if (val < lo) {
    return lo;
  } else if (val > hi) {
    return hi;
  } else {
    return val;
  }
}

/**
 * Parses a text value (eg. from an input[type=text]) into a float
 * @param {*} val text value
 * @param {*} lo lower bound (inclusive)
 * @param {*} hi upper bound (inclusive)
 * @param {*} def default value if val is NaN (0 if not specified)
 * @param {*} increment increment to be applied to parsed value (0 if not specified)
 * @returns float value
 */
function floatFromText(val, lo, hi, def=0, increment=0) {
  val = parseFloat(val) + increment;
  if (isNaN(val)) {
    return def;
  } else if (val < lo) {
    return lo;
  } else if (val > hi) {
    return hi;
  } else {
    return val;
  }
}

/**
 * Initializes various page elements, such as the menu bar and popups
 */
function initPage() {
  // Assume for now that 1st schematic shares title with project
  var projtitle = schdata.schematics[schid_to_idx[1]].name
  document.getElementById("projtitle").textContent = projtitle

  // Tool buttons
  // TODO, add tool buttons currently handled by onclicks
  document.getElementById("open-debug").addEventListener("click", () => {
    toggleSidebar();
  });

  // Selection filter buttons
  document.getElementById("selection-filter-comp").addEventListener("click", () => {
    socket.emit("selection-filter", {"sel_type": "comp"})
  });
  document.getElementById("selection-filter-pin").addEventListener("click", () => {
    socket.emit("selection-filter", {"sel_type": "pin"})
  });
  document.getElementById("selection-filter-net").addEventListener("click", () => {
    socket.emit("selection-filter", {"sel_type": "net"})
  });

  // Search field
  var search_input_field = document.getElementById("search-input");
  var searchlist = document.getElementById("search-content");

  search_input_field.value = "";
  search_input_field.addEventListener("focusin", () => {
    searchlist.classList.remove("hidden");
  });
  search_input_field.addEventListener("click", () => {
    searchlist.classList.remove("hidden");
  });
  search_input_field.addEventListener("input", () => {
    searchlist.classList.remove("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!search_input_field.contains(e.target) && !searchlist.contains(e.target)) {
      searchlist.classList.add("hidden");
    }
  });

  search_nav_num = document.getElementById("search-nav-num");
  search_nav_text = document.getElementById("search-nav-text");
  search_nav_num.innerText = "0 of 0";
  search_nav_text.innerText = "";

  for (let refid in compdict) {
    appendSelectionDiv(searchlist, refid, "comp");
  }
  for (let pinidx in pindict) {
    appendSelectionDiv(searchlist, pinidx, "pin");
  }
  for (let netname in netdict) {
    appendSelectionDiv(searchlist, netname, "net");
  }

  // Settings

  // this is scuffed, do better later
  var display_checkboxes = document.querySelectorAll('input[name="settings-display"]');
  display_checkboxes.forEach((checkbox) => {
    // For now just start with everything enabled
    checkbox.checked = true

    checkbox.addEventListener("click", () => {
      let s = document.querySelector('input[name="settings-display"][value="S"]');
      let l = document.querySelector('input[name="settings-display"][value="L"]');
      let lf = document.querySelector('input[name="settings-display"][value="LF"]');
      let lb = document.querySelector('input[name="settings-display"][value="LB"]');

      let sch_select = document.getElementById("sch-selection");

      if (s.checked && !l.checked) {
        display_split.collapse(1);
        sch_select.classList.remove("hidden");
      } else if (!s.checked && l.checked) {
        display_split.collapse(0);
        sch_select.classList.add("hidden");
      } else {
        // Disallow an empty selection
        display_split.setSizes([50, 50]);
        s.checked = true;
        l.checked = true;
        sch_select.classList.remove("hidden");
      }

      if (lf.checked && !lb.checked) {
        canvas_split.collapse(1);
      } else if (!lf.checked && lb.checked) {
        canvas_split.collapse(0);
      } else {
        // Disallow an empty selection
        canvas_split.setSizes([50, 50]);
        lf.checked = true;
        lb.checked = true;
      }

      resizeAll();

      // Viewing window is not maintained (without extra effort), so just reset
      resetTransform(allcanvas.front);
      resetTransform(allcanvas.back);
      resetTransform(schematic_canvas);
    });
  });

  var render_checkboxes = document.querySelectorAll('input[name="settings-render"]');
  render_checkboxes.forEach((checkbox) => {
    // Make sure we start in the correct state
    checkbox.checked = ibom_settings[checkbox.value];

    checkbox.addEventListener("click", () => {
      ibom_settings[checkbox.value] = checkbox.checked;
      resizeAll();
    });
  });

  var rotation_slider = document.getElementById("settings-rotation");
  var rotation_label = document.getElementById("settings-rotation-label");
  rotation_slider.value = 0;
  rotation_label.value = "0";
  rotation_slider.addEventListener("input", () => {
    ibom_settings.boardRotation = rotation_slider.value * 5;
    rotation_label.value = ibom_settings.boardRotation;
    resizeAll();
  });
  rotation_label.addEventListener("focus", () => {
    rotation_label.value = "";
  });
  rotation_label.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      let val = intFromText(rotation_label.value, -180, 180);
      val = Math.floor(val / 5);
      rotation_slider.value = val;
      ibom_settings.boardRotation = val * 5;
      rotation_label.value = ibom_settings.boardRotation;
      rotation_label.blur();
      resizeAll();
    }
  });

  var find_radio = document.querySelectorAll('input[name="settings-find"]');
  find_radio.forEach((radio) => {
    // Make sure we start in the correct state
    radio.checked = settings["find-type"] === radio.value;

    radio.addEventListener("click", () => {
      if (radio.checked) {
        settings["find-type"] = radio.value;
      }
    })
  })

  var find_toggle = document.getElementById("settings-find-toggle");
  // Make sure we start in the correct state
  find_toggle.checked = settings["find-activate"] === "auto";

  find_toggle.addEventListener("click", () => {
    if (find_toggle.checked) {
      settings["find-activate"] = "auto";
      // console.log("AUTO ZOOM IS WIP")
    } else {
      settings["find-activate"] = "key";
    }
  });

  // Zoom to find feature
  window.addEventListener("keydown", function (event) {
    if (document.activeElement !== document.getElementById("search-input") && !adjust_with_keys) {
      if (event.key == "f" && settings["find-activate"] === "key") {
        if (settings["find-type"] === "zoom") {
          zoomToSelection(schematic_canvas);
          zoomToSelection(allcanvas.front);
          zoomToSelection(allcanvas.back);
        } else {
          draw_crosshair = !draw_crosshair;
          drawHighlights();
          drawSchematicHighlights();
        }
      }
    }
  }, true);

  // Schematic selection
  var sch_selection_display = document.getElementById("sch-selection");
  for (let i = 1; i <= schdata.schematics.length; i++) {
    let div = document.createElement("div");
    div.innerHTML = `${i}. ${schdata.schematics[schid_to_idx[i]].name}`;
    div.innerHTML += `<span>&#9666;</span>`;
    div.addEventListener("click", () => {
      switchSchematic(i);
    });
    if (i == current_schematic) {
      div.classList.add("current");
    }
    sch_selection_display.appendChild(div);
  }

  var projector_calibrate_toggle = document.getElementById("settings-projector-calibrate");
  projector_calibrate_toggle.checked = false;
  projector_calibrate_toggle.addEventListener("click", () => {
    if (projector_calibrate_toggle.checked) {
      socket.emit("projector-mode", "calibrate");
    } else {
      socket.emit("projector-mode", "highlight");
    }
  });

  var projector_usekeys_toggle = document.getElementById("settings-projector-usekeys");
  projector_usekeys_toggle.checked = false;
  projector_usekeys_toggle.addEventListener("click", () => {
    if (projector_usekeys_toggle.checked) {
      adjust_with_keys = true;
    } else {
      adjust_with_keys = false;
    }
  });

  var projector_reset = document.getElementById("settings-projector-reset");
  projector_reset.addEventListener("click", () => {
    socket.emit("projector-adjust", { "type": "tx", "val": 0 });
    socket.emit("projector-adjust", { "type": "ty", "val": 0 });
    socket.emit("projector-adjust", { "type": "r", "val": 0 });
    socket.emit("projector-adjust", { "type": "z", "val": 1 });
  });

  var projector_boardtrack = document.getElementById("settings-projector-track");
  projector_boardtrack.addEventListener("click", () => {
    socket.emit("board-update", {});
  });

  projector_sliders["tx"]["func"] = (val, increment=0) => {
    // socket.emit("projector-adjust", {"type": "tx", "val": intFromText(val, -4000, 4000, 0, increment) / 10})
    socket.emit("projector-adjust", {"type": "tx", "val": floatFromText(val, -400, 400, 0, increment)})
  }
  projector_sliders["tx"]["slider"] = document.getElementById("settings-projector-tx");
  projector_sliders["tx"]["label"] = document.getElementById("settings-projector-tx-label");
  projector_sliders.tx.slider.value = 0;
  projector_sliders.tx.label.value = "0.0";
  projector_sliders.tx.slider.addEventListener("input", () => {
    projector_sliders.tx.func(projector_sliders.tx.slider.value / 10);
  });
  projector_sliders.tx.label.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      projector_sliders.tx.label.blur();
      projector_sliders.tx.func(projector_sliders.tx.label.value);
    }
  });

  projector_sliders["ty"]["func"] = (val, increment=0) => {
    // socket.emit("projector-adjust", {"type": "ty", "val": intFromText(val, -4000, 4000, 0, increment) / 10})
    socket.emit("projector-adjust", {"type": "ty", "val": floatFromText(val, -400, 400, 0, increment)})
  }
  projector_sliders["ty"]["slider"] = document.getElementById("settings-projector-ty");
  projector_sliders["ty"]["label"] = document.getElementById("settings-projector-ty-label");
  projector_sliders.ty.slider.value = 0;
  projector_sliders.ty.label.value = "0.0";
  projector_sliders.ty.slider.addEventListener("input", () => {
    projector_sliders.ty.func(projector_sliders.ty.slider.value / 10);
  });
  projector_sliders.ty.label.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      projector_sliders.ty.label.blur();
      projector_sliders.ty.func(projector_sliders.ty.label.value);
    }
  });

  projector_sliders["r"]["func"] = (val, increment=0) => {
    // socket.emit("projector-adjust", {"type": "r", "val": intFromText(val, -1800, 1800, 0, increment) / 10})
    socket.emit("projector-adjust", {"type": "r", "val": floatFromText(val, -180, 180, 0, increment)})
  }
  projector_sliders["r"]["slider"] = document.getElementById("settings-projector-rotation");
  projector_sliders["r"]["label"] = document.getElementById("settings-projector-rotation-label");
  projector_sliders.r.slider.value = 0;
  projector_sliders.r.label.value = "0.0";
  projector_sliders.r.slider.addEventListener("input", () => {
    projector_sliders.r.func(projector_sliders.r.slider.value / 10);
  });
  projector_sliders.r.label.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      projector_sliders.r.label.blur();
      projector_sliders.r.func(projector_sliders.r.label.value);
    }
  });

  projector_sliders["z"]["func"] = (val, increment=0) => {
    socket.emit("projector-adjust", {"type": "z", "val": intFromText(val, 1, 1000, 100, increment) / 100})
  }
  projector_sliders["z"]["slider"] = document.getElementById("settings-projector-zoom");
  projector_sliders["z"]["label"] = document.getElementById("settings-projector-zoom-label");
  projector_sliders.z.slider.value = 100;
  projector_sliders.z.label.value = 100;
  projector_sliders.z.slider.addEventListener("input", () => {
    projector_sliders.z.func(projector_sliders.z.slider.value);
  });
  projector_sliders.z.label.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      projector_sliders.z.label.blur();
      projector_sliders.z.func(projector_sliders.z.label.value);
    }
  });

  for (let t in projector_sliders) {
    projector_sliders[t]["label"].addEventListener("focus", () => {
      projector_sliders[t]["label"].value = "";
    });
  }

  window.addEventListener("keydown", (e) => {
    if (adjust_with_keys) {
      switch (e.key) {
        case "a":
          projector_sliders.tx.func(projector_sliders.tx.slider.value / 10, -0.1);
          break;
        case "d":
          projector_sliders.tx.func(projector_sliders.tx.slider.value / 10, 0.1);
          break;
        case "w":
          projector_sliders.ty.func(projector_sliders.ty.slider.value / 10, -0.1);
          break;
        case "s":
          projector_sliders.ty.func(projector_sliders.ty.slider.value / 10, 0.1);
          break;
        case "q":
          projector_sliders.r.func(projector_sliders.r.slider.value / 10, -0.1);
          break;
        case "e":
          projector_sliders.r.func(projector_sliders.r.slider.value / 10, 0.1);
          break;
        case "r":
          projector_sliders.z.func(projector_sliders.z.slider.value, 1);
          break;
        case "f":
          projector_sliders.z.func(projector_sliders.z.slider.value, -1);
          break;
      }
    }
  })


  // DEBUG SIDEBAR
  var sidebar = document.getElementById("sidebar");
  var sidebar_name = sidebar.querySelector('*[name="sidebar-name"]');
  var sidebar_notes = sidebar.querySelector('*[name="sidebar-notes"]');

  var sidebar_dmm_buttons = document.getElementById("sidebar-dmm-buttons").children;
  sidebar_dmm_buttons[0].addEventListener("click", () => {
    socket.emit("dmm", {"mode": "voltage"});
  });
  sidebar_dmm_buttons[1].addEventListener("click", () => {
    socket.emit("dmm", {"mode": "resistance"});
  });
  sidebar_dmm_buttons[2].addEventListener("click", () => {
    socket.emit("dmm", {"mode": "diode"});
  });
  
  [sidebar_name, sidebar_notes].forEach((input) => {
    input.addEventListener("focusout", () => {
      socket.emit("debug-session", { "event": "edit", "name": sidebar_name.value, "notes": sidebar_notes.value });
    });
  });

  // Populate debug session search bar content and set up fields
  var sidebar_custom = document.getElementById("sidebar-custom-dmm");
  var pos_input = sidebar_custom.querySelector('*[name="pos"]');
  var neg_input = sidebar_custom.querySelector('*[name="neg"]');
  var pos_content = sidebar_custom.querySelector('*[name="pos-content"]');
  var neg_content = sidebar_custom.querySelector('*[name="neg-content"]');

  for (let netname in netdict) {
    let posdiv = document.createElement("div");
    let negdiv = document.createElement("div");
    let name = getElementName({ "type": "net", "val": netname });
    posdiv.innerHTML = name;
    negdiv.innerHTML = name;
    posdiv.addEventListener("click", () => {
      sidebar_custom_selection.pos.type = "net";
      sidebar_custom_selection.pos.val = netname;
      pos_input.value = name;
      pos_content.classList.add("hidden");
    });
    negdiv.addEventListener("click", () => {
      sidebar_custom_selection.neg.type = "net";
      sidebar_custom_selection.neg.val = netname;
      neg_input.value = name;
      neg_content.classList.add("hidden");
    });
    pos_content.appendChild(posdiv);
    neg_content.appendChild(negdiv);
  }
  for (let pinidx in pindict) {
    let posdiv = document.createElement("div");
    let negdiv = document.createElement("div");
    let name = getElementName({ "type": "pin", "val": pinidx });
    posdiv.innerHTML = name;
    negdiv.innerHTML = name;
    posdiv.addEventListener("click", () => {
      sidebar_custom_selection.pos.type = "pin";
      sidebar_custom_selection.pos.val = pinidx;
      pos_input.value = name;
      pos_content.classList.add("hidden");
    });
    negdiv.addEventListener("click", () => {
      sidebar_custom_selection.neg.type = "pin";
      sidebar_custom_selection.neg.val = pinidx;
      neg_input.value = name;
      neg_content.classList.add("hidden");
    });
    pos_content.appendChild(posdiv);
    neg_content.appendChild(negdiv);
  }

  pos_input.addEventListener("focusin", () => { pos_content.classList.remove("hidden") });
  neg_input.addEventListener("focusin", () => { neg_content.classList.remove("hidden") });

  var lo_input = sidebar_custom.querySelector('*[name="lo"]');
  var hi_input = sidebar_custom.querySelector('*[name="hi"]');
  forceNumericInput(lo_input);
  forceNumericInput(hi_input);

  var custom_save_button = sidebar_custom.querySelector('*[name="save"]');
  custom_save_button.addEventListener("click", () => {
    if (sidebar_custom_selection.pos.type !== null) {
      var new_card = {
        "device": "dmm",
        "pos": {
          "type": sidebar_custom_selection.pos.type,
          "val": sidebar_custom_selection.pos.val
        },
        "neg": {
          "type": null,
          "val": null
        },
        "unit": null,
        "val": null,
        "lo": null,
        "hi": null
      };

      if (sidebar_custom_selection.neg.type === null) {
        new_card.neg.type = "net";
        new_card.neg.val = "GND";
      } else {
        new_card.neg.type = sidebar_custom_selection.neg.type;
        new_card.neg.val = sidebar_custom_selection.neg.val;
      }

      if (new_card.pos.type == "pin") {
        new_card.pos.val = parseInt(new_card.pos.val);
      }
      if (new_card.neg.type == "pin") {
        new_card.neg.val = parseInt(new_card.neg.val);
      }

      // Rest of info can be taken straight from form
      var sidebar_custom = document.getElementById("sidebar-custom-dmm");

      let multiplier = units.getMultiplier(sidebar_custom.querySelector('*[name="unit-prefix"]').value);
      let lo = parseFloat(sidebar_custom.querySelector('*[name="lo"]').value);
      let hi = parseFloat(sidebar_custom.querySelector('*[name="hi"]').value);
      if (!isNaN(lo)) {
        new_card.lo = lo * multiplier;
      }
      if (!isNaN(hi)) {
        new_card.hi = hi * multiplier;
      }

      let unit = sidebar_custom.querySelector('*[name="unit"]').value;
      if (unit !== "none") {
        new_card.unit = unit;
      }

      resetSidebarCustom();

      socket.emit("debug-session", { "event": "custom", "card": new_card });

      sidebar_custom.classList.add("hidden");

    } else {
      // TODO maybe pulse positive rail input field
    }
  });

  resetSidebarCustom();

  document.getElementById("sidebar-add-button").addEventListener("click", () => {
    sidebar_custom.classList.remove("hidden");
  });

  document.getElementById("sidebar-save-button").addEventListener("click", () => {
    socket.emit("debug-session", { "event": "save" });
  });

  document.getElementById("sidebar-export-button").addEventListener("click", () => {
    console.log("Export function is WIP, doing nothing");
    socket.emit("debug-session", { "event": "export" });
  })
}

/** Initializes all socket listeners for the main page */
function initSocket() {
  socket = io();
  socket.on("connect", () => {
    console.log("connected")
  });
  socket.on("selection", (data) => {
    document.getElementById("sch-multi-click").classList.add("hidden");
    document.getElementById("search-content").classList.add("hidden");
    switch (data.type) {
      case "comp":
        selectComponent(data.val);
        break;
      case "pin":
        selectPins([data.val]);
        break;
      case "net":
        selectNet(data.val);
        break;
      case "deselect":
        deselectAll(true);
        break;
      case "multi":
        if (!data.from_optitrack) {
          multiMenu(data.point, data.layer, data.hits)
        }
        break;
      case "cancel-multi":
        document.getElementById("sch-multi-click").classList.add("hidden");
        break;
    }
  });
  socket.on("projector-mode", (mode) => {
    if (mode === "calibrate") {
      document.getElementById("settings-projector-calibrate").checked = true;
    } else {
      document.getElementById("settings-projector-calibrate").checked = false;
    }
  });
  socket.on("projector-adjust", (adjust) => {
    if (adjust.type == "z") {
      projector_sliders.z.slider.value = adjust.val * 100;
      projector_sliders.z.label.value = adjust.val * 100;
    } else {
      projector_sliders[adjust.type].slider.value = adjust.val * 10;
      projector_sliders[adjust.type].label.value = adjust.val.toFixed(1);
    }
  });

  // tools
  socket.on("tool-request", (data) => {
    // Any tool requests by the client are echoed back by the server if valid,
    // ie. if the tool had not already been requested
    toolRequest(data);
  })

  socket.on("tool-connect", (data) => {
    toolConnect(data);
  });

  socket.on("debug-session", (data) => {
    debugSessionEvent(data);
  });

  printcounter = 0
  socket.on("udp", (data) => {
    probes["pos"].location = data["tippos_layout"];
    probes["neg"].location = data["greytip"];
    drawHighlights();
  })

  socket.on("tool-selection", (data) => {
    if (data.selection == "multi") {
      // multi menu, so main page does nothing
    } else {
      probes[data.device].selection = data.selection;
      drawHighlights();
    }
  })

  socket.on("config", (data) => {
    for (let device in data.devices) {
      let colors = data.devices[device];
      probes[device].color.loc = colors[0];
      probes[device].color.sel = colors[1];
      probes[device].color.zone = colors[1];
    }

    if (data.dmmpanel) {
      setInterval(() => {
        socket.emit("dmm", {})
      }, data.dmmpanel);
    }
  })

  socket.on("study-event", (data) => {
    switch (data.event) {
      case "task":
        study_listening_for_1B = false;
        deselectAll(true);
        break;
      case "highlight":
        deselectAll(true);
        if (data.task == "1A") {
          selectComponent(data.refid);
        } else if (data.task == "1B") {
          if (data.boardviz) {
            study_listening_for_1B = false;
          } else {
            study_listening_for_1B = true;
            study_component = data.refid;
          }
        }
        break;
      case "success":
        sound_success.play();
        if (data.task == "1B") {
          selectComponent(data.refid);
        }
        break;
      case "failure":
        sound_failure.play();
        break;
      default:
        console.log(data);
        break;
    }
  })

  socket.on("dmm", (data) => {
    if (data.mode) {
      var sidebar_dmm_buttons = document.getElementById("sidebar-dmm-buttons").children;
      for (let btn of sidebar_dmm_buttons) {
        btn.classList.remove("selected");
      }
      if (data.mode == "voltage") sidebar_dmm_buttons[0].classList.add("selected");
      else if (data.mode == "resistance") sidebar_dmm_buttons[1].classList.add("selected");
      else sidebar_dmm_buttons[2].classList.add("selected");
    } else {
      var dmm_val = document.getElementById("sidebar-dmm-value");
      if (data.val === null) {
        dmm_val.innerText = "Please select a mode to capture measurement";
      } else {
        dmm_val.innerText = data.val;
      }
    }
  })

  socket.on("selection-filter", (data) => {
    for (let sel_type in data) {
      var button = document.getElementById(`selection-filter-${sel_type}`);
      button.classList.remove("disabled");
      button.classList.remove("on");
      if (data[sel_type] == -1) {
        button.classList.add("disabled");
      } else if (data[sel_type] == 1) {
        button.classList.add("on");
      }
    }
  })
}


window.onload = () => {
  let data_urls = ["schdata", "pcbdata", "datadicts"]
  data_urls = data_urls.map((name) => ("http://" + window.location.host + "/" + name))

  Promise.all(data_urls.map((url) => fetch(url))).then((responses) =>
    Promise.all(responses.map((res) => res.json()))
  ).then((datas) => {
    initData(datas);

    initUtils();
    initPage();

    initLayout();
    initSchematic();
    initMouseHandlers();

    initSocket();

    resizeAll();
  }).catch((e) => console.log(e))
}
window.onresize = resizeAll;