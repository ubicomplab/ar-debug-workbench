// Main page stuff plus whatever else is wip (like tools)

// DEBUG
var DEBUG_LAYOUT_CLICK = false;

// document elements
var search_input_field = null;
var search_nav_num = null;
var search_nav_text = null;

var search_nav_current = [0, 0];


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
    var displayCheckboxes = document.querySelectorAll('input[name="settings-display"]');
    displayCheckboxes.forEach((checkbox) => {
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

    var renderCheckboxes = document.querySelectorAll('input[name="settings-render"]');
    renderCheckboxes.forEach((checkbox) => {
        // Make sure we start in the correct state
        checkbox.checked = ibom_settings[checkbox.value];

        checkbox.addEventListener("click", () => {
            ibom_settings[checkbox.value] = checkbox.checked;
            resizeAll();
        });
    });

    var layoutRotation = document.getElementById("settings-rotation");
    var rotationLabel = document.getElementById("settings-rotation-label");
    layoutRotation.value = 0;
    layoutRotation.addEventListener("input", () => {
        ibom_settings.boardRotation = layoutRotation.value * 5;
        rotationLabel.innerHTML = ibom_settings.boardRotation + "&deg;";
        resizeAll();
    });

    var findRadio = document.querySelectorAll('input[name="settings-find"]');
    findRadio.forEach((radio) => {
        // Make sure we start in the correct state
        radio.checked = settings["find-type"] === radio.value;

        radio.addEventListener("click", () => {
            if (radio.checked) {
                settings["find-type"] = radio.value;
            }
        })
    })

    var findToggle = document.getElementById("settings-find-toggle");
    // Make sure we start in the correct state
    findToggle.checked = settings["find-activate"] === "auto";

    findToggle.addEventListener("click", () => {
        if (findToggle.checked) {
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
    var schSelectionDisplay = document.getElementById("sch-selection");
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
        schSelectionDisplay.appendChild(div);
    }

    var projectorCalibrateToggle = document.getElementById("settings-projector-calibrate");
    // Make sure we start in the correct state
    projectorCalibrateToggle.checked = false;

    projectorCalibrateToggle.addEventListener("click", () => {
        if (projectorCalibrateToggle.checked) {
            socket.emit("projectormode", "calibrate");
        } else {
            socket.emit("projectormode", "highlight");
        }
    });

    var projectorTx = document.getElementById("settings-projector-tx");
    projectorTx.value = 0;
    projectorTx.addEventListener("input", () => {
        let val = projectorTx.value;
        document.getElementById("settings-projector-tx-label").innerHTML = val + "mm";
        socket.emit("projector-adjust", { "type": "tx", "val": val });
    });

    var projectorTy = document.getElementById("settings-projector-ty");
    projectorTy.value = 0;
    projectorTy.addEventListener("input", () => {
        let val = projectorTy.value;
        document.getElementById("settings-projector-ty-label").innerHTML = val + "mm";
        socket.emit("projector-adjust", { "type": "ty", "val": val });
    });

    var projectorRotation = document.getElementById("settings-projector-rotation");
    projectorRotation.value = 0;
    projectorRotation.addEventListener("input", () => {
        let val = projectorRotation.value * 5;
        document.getElementById("settings-projector-rotation-label").innerHTML = val + "&deg;";
        socket.emit("projector-adjust", { "type": "r", "val": val });
    });

    var projectorZoom = document.getElementById("settings-projector-zoom");
    projectorZoom.value = 0;
    projectorZoom.addEventListener("input", () => {
        let val = projectorZoom.value;
        if (val < 0) {
            val = 1 + val / 10;
        } else {
            val = 1 + val;
        }
        document.getElementById("settings-projector-zoom-label").innerHTML = val * 100 + "%";
        socket.emit("projector-adjust", { "type": "z", "val": val });
    });
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
    socket.on("projectormode", (mode) => {
        if (mode === "calibrate") {
            document.getElementById("settings-projector-calibrate").checked = true;
        } else {
            document.getElementById("settings-projector-calibrate").checked = false;
        }
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