// Main page stuff plus whatever else is wip (like tools)

// DEBUG
var DEBUG_LAYOUT_CLICK = false;

// zoom and crosshair constants
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
var VIEW_MAXIMUM = 0.8;
var CROSSHAIR_LENGTH = 100000;

// document elements
var search_input_field = null;
var search_nav_num = null;
var search_nav_text = null;

var search_nav_current = [0, 0];

var projector_sliders = {
    "tx": {},
    "ty": {},
    "r": {},
    "z": {}
};


var sidebar_shown = false;
sidebar_split = Split(["#display", "#sidebar"], {
    sizes: [100, 0],
    minSize: 0,
    gutterSize: 5,
    onDragEnd: resizeAll
});
display_split = Split(["#schematic-div", "#layout-div"], {
    sizes: [50, 50],
    minSize: 0,
    gutterSize: 5,
    onDragEnd: resizeAll
});
canvas_split = Split(["#front-canvas", "#back-canvas"], {
    sizes: [50, 50],
    minSize: 0,
    gutterSize: 5,
    direction: "vertical",
    onDragEnd: resizeAll
});

var tools = {
    "ptr": false,
    "dmm": false,
    "osc": false
}

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

function zoomToSelection(layerdict) {
    var targetsize = null;
    if (highlighted_component !== -1) {
        targetsize = layerdict.layer === "S" ? VIEW_MINIMUMS["sch"]["comp"] : VIEW_MINIMUMS["layout"]["footprint"];
    }
    if (highlighted_pin !== -1) {
        targetsize = layerdict.layer === "S" ? VIEW_MINIMUMS["sch"]["pin"] : VIEW_MINIMUMS["layout"]["pad"];
    }
    if (highlighted_net !== null) {
        targetsize = layerdict.layer === "S" ? VIEW_MINIMUMS["sch"]["net"] : null;
    }

    if (targetsize === null || target_boxes[layerdict.layer] === null) {
        return;
    }

    zoomToBox(layerdict, bboxListToObj(target_boxes[layerdict.layer]), targetsize);
}

function intFromText(val, lo, hi, def = 0) {
    val = parseInt(val);
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

function initPage() {
    // Assume for now that 1st schematic shares title with project
    var projtitle = schdata.schematics[schid_to_idx[1]].name
    document.getElementById("projtitle").textContent = projtitle

    // Search field
    search_input_field = document.getElementById("search-input");
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
        if (document.activeElement !== document.getElementById("search-input")) {
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
    for (let i = 1; i <= num_schematics; i++) {
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

    var projector_reset = document.getElementById("settings-projector-reset");
    projector_reset.addEventListener("click", () => {
        socket.emit("projector-adjust", { "type": "tx", "val": 0 });
        socket.emit("projector-adjust", { "type": "ty", "val": 0 });
        socket.emit("projector-adjust", { "type": "r", "val": 0 });
        socket.emit("projector-adjust", { "type": "z", "val": 1 });
    });

    projector_sliders["tx"]["slider"] = document.getElementById("settings-projector-tx");
    projector_sliders["tx"]["label"] = document.getElementById("settings-projector-tx-label");
    projector_sliders["tx"]["slider"].value = 0;
    projector_sliders["tx"]["label"].value = "0";
    projector_sliders["tx"]["slider"].addEventListener("input", () => {
        socket.emit("projector-adjust", { "type": "tx", "val": projector_sliders["tx"]["slider"].value });
    });
    projector_sliders["tx"]["label"].addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            let val = intFromText(projector_sliders["tx"]["label"].value, -200, 200);
            projector_sliders["tx"]["label"].value = val;
            projector_sliders["tx"]["label"].blur();
            socket.emit("projector-adjust", { "type": "tx", "val": val });
        }
    });

    projector_sliders["ty"]["slider"] = document.getElementById("settings-projector-ty");
    projector_sliders["ty"]["label"] = document.getElementById("settings-projector-ty-label");
    projector_sliders["ty"]["slider"].value = 0;
    projector_sliders["ty"]["label"].value = 0;
    projector_sliders["ty"]["slider"].addEventListener("input", () => {
        socket.emit("projector-adjust", { "type": "ty", "val": projector_sliders["ty"]["slider"].value });
    });
    projector_sliders["ty"]["label"].addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            let val = intFromText(projector_sliders["ty"]["label"].value, -200, 200);
            projector_sliders["ty"]["label"].value = val;
            projector_sliders["ty"]["label"].blur();
            socket.emit("projector-adjust", { "type": "ty", "val": val });
        }
    });

    projector_sliders["r"]["slider"] = document.getElementById("settings-projector-rotation");
    projector_sliders["r"]["label"] = document.getElementById("settings-projector-rotation-label");
    projector_sliders["r"]["slider"].value = 0;
    projector_sliders["r"]["label"].value = 0;
    projector_sliders["r"]["slider"].addEventListener("input", () => {
        socket.emit("projector-adjust", { "type": "r", "val": projector_sliders["r"]["slider"].value });
    });
    projector_sliders["r"]["label"].addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            let val = intFromText(projector_sliders["r"]["label"].value, -180, 180);
            projector_sliders["r"]["label"].value = val;
            projector_sliders["r"]["label"].blur();
            socket.emit("projector-adjust", { "type": "r", "val": val });
        }
    });

    projector_sliders["z"]["slider"] = document.getElementById("settings-projector-zoom");
    projector_sliders["z"]["label"] = document.getElementById("settings-projector-zoom-label");
    projector_sliders["z"]["slider"].value = 100;
    projector_sliders["z"]["label"].value = 100;
    projector_sliders["z"]["slider"].addEventListener("input", () => {
        let val = projector_sliders["z"]["slider"].value / 100
        socket.emit("projector-adjust", { "type": "z", "val": val });
    });
    projector_sliders["z"]["label"].addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            let val = intFromText(projector_sliders["z"]["label"].value, 10, 1000, 100) / 100;
            projector_sliders["z"]["label"].value = val * 100;
            projector_sliders["z"]["label"].blur();
            socket.emit("projector-adjust", { "type": "z", "val": val });
        }
    });

    for (let t in projector_sliders) {
        projector_sliders[t]["label"].addEventListener("focus", () => {
            projector_sliders[t]["label"].value = "";
        });
    }
}

function searchBarHandler() {
    var input = document.getElementById("search-input");
    var filter = input.value.toLowerCase();
    var tokens = filter.split(/(\s+)/).filter(e => e.trim().length > 0);

    var divs = document.getElementById("search-content").getElementsByTagName("div");
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

function searchBarX() {
    var searchlist = document.getElementById("search-content");
    var input = document.getElementById("search-input");
    searchlist.classList.add("hidden");
    input.value = "";
    deselectClicked();
}

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

        if (highlighted_component !== -1) {
            let comp = compdict[highlighted_component];
            let unit = Object.values(comp.units)[search_nav_current[0] - 1];
            search_nav_text.innerText = `${comp.ref} ${unit.num}`;

            if (unit.schid != current_schematic) {
                switchSchematic(unit.schid);
            }

            target_boxes["S"] = unit.bbox.map((i) => parseFloat(i));
            let footprint = pcbdata.footprints[highlighted_component];
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
        if (highlighted_net !== null) {
            let pin = pindict[netdict[highlighted_net]["pins"][search_nav_current[0] - 1]];
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

function requestTool(type) {
    console.log(`requesting tool ${type}`)
    socket.emit("tool-add", type);
}

function addTool(type) {
    console.log(`received tool ${type}, adding to menubar`);

    if (tools[type]) {
        console.log("We already have it");
        return;
    }

    var div = document.createElement("div");
    let text = "";
    switch (type) {
        case "ptr":
            text = "Cursor";
            div.addEventListener("click", () => {
                socket.emit("tool-measure", "ptr");
            })
            break;
        case "dmm":
            text = "Multimeter";
            div.addEventListener("click", () => {
                if (sidebar_shown) {
                    sidebar_split.collapse(1);
                } else {
                    sidebar_split.setSizes([80, 20]);
                }
                document.getElementById("sidebar-dmm").classList.remove("hidden");
                document.getElementById("sidebar-osc").classList.add("hidden");
                resizeAll();
                sidebar_shown = !sidebar_shown;
            })
            break;
        case "osc":
            text = "Oscilloscope";
            div.addEventListener("click", () => {
                if (sidebar_shown) {
                    sidebar_split.collapse(1);
                } else {
                    sidebar_split.setSizes([80, 20]);
                }
                document.getElementById("sidebar-dmm").classList.add("hidden");
                document.getElementById("sidebar-osc").classList.remove("hidden");
                resizeAll();
                sidebar_shown = !sidebar_shown;
            })
            break;
    }
    div.innerText = text;
    document.getElementById("tools").appendChild(div);

    tools[type] = true;
}

function toolMeasurement(type, val) {
    console.log(`tool ${type} measurement = ${val}`)

    if (!tools[type]) {
        console.log("Measurement for tool we don't have yet");
        return;
    }

    if (type == "ptr") {
        // val is coordinates
        // only clicking front for now
        console.log("Nothing, TODO")
    }
}

function initSocket() {
    socket = io();
    socket.on("connect", () => {
        console.log("connected")
    });
    socket.on("selection", (selection) => {
        switch (selection.type) {
            case "comp":
                selectComponent(selection.val);
                break;
            case "pin":
                selectPins([selection.val]);
                break;
            case "net":
                selectNet(selection.val);
                break;
            case "deselect":
                deselectAll(true);
                break;
        }
    });
    socket.on("tool-add", (data) => {
        console.log(`tool-add: status '${data["status"]}', type '${data["type"]}'`);
        if (data["status"] == "exists" || data["status"] == "added") {
            addTool(data["type"]);
        }
    });
    socket.on("tool-measure", (data) => {
        console.log(`tool-measure: status '${data["status"]}', type '${data["type"]}', val '${data["val"]}'`);
        if (data["status"] == "good") {
            toolMeasurement(data["type"], data["val"]);
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
        let val = adjust.type === "z" ? adjust.val * 100 : adjust.val;
        projector_sliders[adjust.type].slider.value = val;
        projector_sliders[adjust.type].label.value = val;
    });
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

        initPage();

        initLayout();
        initSchematic();
        initMouseHandlers();

        initSocket();

        resizeAll();

    }).catch((e) => console.log(e))
}
window.onresize = resizeAll;