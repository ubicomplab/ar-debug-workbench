// Main page stuff plus whatever else is wip (like tools)

// document elements
var searchInputField = null;
var searchNavNum = null;
var searchNavText = null;

var searchNavCurrent = [0, 0];

var drawCrosshair = false;

var sch_view_minimums = {
    "comp": 0.1,
    "pin": 0.04,
    "net": 0.5
};
var sch_view_maximum = 0.8;

var sidebarShown = false;
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


function rawBoxFromFootprint(footprint) {
    var bbox = footprint.bbox;
    var corner1 = [bbox.relpos[0], bbox.relpos[1]];
    var corner2 = [bbox.relpos[0] + bbox.size[0], bbox.relpos[1] + bbox.size[1]];
    corner1 = rotateVector(corner1, bbox.angle);
    corner2 = rotateVector(corner2, bbox.angle);
    return [
        Math.min(corner1[0], corner2[0]) + bbox.pos[0],
        Math.min(corner1[1], corner2[1]) + bbox.pos[1],
        Math.max(corner1[0], corner2[0]) + bbox.pos[0],
        Math.max(corner1[1], corner2[1]) + bbox.pos[1]
    ];
}

function zoomToSelection(layerdict) {
    console.log(`Finding selection for layer ${layerdict.layer}`);
    var t = layerdict.transform;
    // console.log(`current transform px / py / z is ${t.panx} / ${t.pany} / ${t.zoom}`);

    var boxes = [];
    var targetsize;

    if (layerdict.layer === "S") {
        if (highlighted_component !== -1) {
            var comp = compdict[highlighted_component];
            for (let unitnum in comp.units) {
                let unit = comp.units[unitnum];
                if (unit.schid == current_schematic) {
                    boxes.push(unit.bbox);
                }
            }
            targetsize = sch_view_minimums["comp"];
        }
        if (highlighted_pin !== -1) {
            var pin = pindict[highlighted_pin];
            if (pin.schid == current_schematic) {
                boxes.push(pinBoxFromPos(pin.pos));
            }
            targetsize = sch_view_minimums["pin"];
        }
        if (highlighted_net !== null) {
            for (let pinidx in pindict) {
                let pin = pindict[pinidx];
                if (pin.schid == current_schematic && pin.net == highlighted_net) {
                    boxes.push(pinBoxFromPos(pin.pos));
                }
            }
            targetsize = sch_view_minimums["net"];
        }
    } else {
        // layout canvas F or B
        if (highlighted_component !== -1) {
            var footprint = pcbdata.footprints[highlighted_component];
            if (layerdict.layer == footprint.layer) {
                boxes = [rawBoxFromFootprint(footprint)];
                targetsize = sch_view_minimums["comp"];
            }
        }
        if (highlighted_pin !== -1) {
            console.log("Pin zooming is WIP");
        }
        if (highlighted_net !== null) {
            console.log("Net zooming is WIP");
        }
    }

    if (boxes.length == 0) {
        return;
    }

    var extremes = [1000000, 1000000, 0, 0];
    for (let box of boxes) {
        extremes[0] = Math.min(extremes[0], box[0], box[2]);
        extremes[1] = Math.min(extremes[1], box[1], box[3]);
        extremes[2] = Math.max(extremes[2], box[0], box[2]);
        extremes[3] = Math.max(extremes[3], box[1], box[3]);
    }
    var minwidth = extremes[2] - extremes[0];
    var minheight = extremes[3] - extremes[1];
    var centerx = (extremes[0] + extremes[2]) / 2;
    var centery = (extremes[1] + extremes[3]) / 2;
    console.log(`min window is ${minwidth}x${minheight} at (${centerx},${centery})`);

    var viewwidth = layerdict.bg.width / (t.zoom * t.s);
    var viewheight = layerdict.bg.height / (t.zoom * t.s);

    var xrat = minwidth / viewwidth;
    var yrat = minheight / viewheight;

    var maxrat = Math.max(xrat, yrat);

    // Only zoom if the target will be too small or too large
    if (maxrat < targetsize || maxrat > sch_view_maximum) {
        if (maxrat > sch_view_maximum) {
            targetsize = sch_view_maximum;
        }
        var schdim = schdata.schematics[schid_to_idx[current_schematic]].dimensions;
        var xzoom = schdim.x * sch_zoom_default * targetsize / minwidth;
        var yzoom = schdim.y * sch_zoom_default * targetsize / minheight;

        var newzoom = Math.min(xzoom, yzoom);
        newzoom = Math.max(newzoom, sch_zoom_default);

        layerdict.transform.zoom = newzoom;
    }

    // Always pan
    var newvw = layerdict.bg.width / (layerdict.transform.zoom * t.s);
    var newvh = layerdict.bg.height / (layerdict.transform.zoom * t.s);

    var newpx = ((newvw / 2) - centerx) * t.s - t.x;
    var flip = (layerdict.layer == "B")
    if (flip) {
        newpx = -newpx + (layerdict.bg.width / layerdict.transform.zoom);
    }
    var newpy = ((newvh / 2) - centery) * t.s - t.y;
    layerdict.transform.panx = newpx;
    layerdict.transform.pany = newpy;

    resizeAll();
}

function crosshairOnPos(canvas, pos) {
    if (pos.length > 0) {
        var style = getComputedStyle(topmostdiv);
        var ctx = canvas.getContext("2d");
        ctx.strokeStyle = style.getPropertyValue("--pcb-crosshair-line-color");
        ctx.lineWidth = style.getPropertyValue("--pcb-crosshair-line-width");
        ctx.beginPath();
        ctx.moveTo(-100000, pos[1]);
        ctx.lineTo(100000, pos[1]);
        ctx.stroke();
        ctx.moveTo(pos[0], -100000);
        ctx.lineTo(pos[0], 100000);
        ctx.stroke();
    }
}

function crosshairOnSelection(canvas, layer) {
    var pos = [];
    if (highlighted_component !== -1) {
        pos = pcbdata.footprints[highlighted_component].bbox.pos;
        if (pcbdata.footprints[highlighted_component].layer == layer) {
            crosshairOnPos(canvas, pos);
        }
    }
    if (highlighted_pin !== -1) {
        console.log("Crosshair for pins WIP");
    }
    if (highlighted_net !== null) {
        console.log("Crosshair not available for nets");
    }
}

function initPage() {
    // Assume for now that 1st schematic shares title with project
    var projtitle = schdata.schematics[schid_to_idx[1]].name
    document.getElementById("projtitle").textContent = projtitle

    // Search field
    searchInputField = document.getElementById("search-input");
    var searchlist = document.getElementById("search-content");

    searchInputField.value = "";
    searchInputField.addEventListener("focusin", () => {
        searchlist.classList.remove("hidden");
    });
    searchInputField.addEventListener("click", () => {
        searchlist.classList.remove("hidden");
    });
    searchInputField.addEventListener("input", () => {
        searchlist.classList.remove("hidden");
    });

    searchNavNum = document.getElementById("search-nav-num");
    searchNavText = document.getElementById("search-nav-text");
    searchNavNum.innerText = "0 of 0";
    searchNavText.innerText = "";

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
            console.log("AUTO ZOOM IS WIP")
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
                    drawCrosshair = !drawCrosshair;
                    drawHighlights();
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
    if (searchNavCurrent[1] > 1) {
        // We have a multi-part selection
        if (dir === "L") {
            searchNavCurrent[0] -= 1;
        } else {
            searchNavCurrent[0] += 1;
        }
        if (searchNavCurrent[0] === 0) {
            searchNavCurrent[0] = searchNavCurrent[1];
        } else if (searchNavCurrent[0] > searchNavCurrent[1]) {
            searchNavCurrent[0] = 1;
        }
        searchNavNum.innerText = `${searchNavCurrent[0]} of ${searchNavCurrent[1]}`;

        if (highlighted_component !== -1) {
            let comp = compdict[highlighted_component];
            let unit = Object.values(comp.units)[searchNavCurrent[0] - 1];
            searchNavText.innerText = `${comp.ref} ${unit.num}`;
            if (unit.schid != current_schematic) {
                switchSchematic(unit.schid);
            }
            // TODO emphasize this unit somehow
        }
        if (highlighted_net !== null) {
            let pin = pindict[netdict[highlighted_net]["pins"][searchNavCurrent[0] - 1]];
            searchNavText.innerText = `${pin.ref}.${pin.num}`;
            if (pin.schid != current_schematic) {
                switchSchematic(pin.schid);
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
                if (sidebarShown) {
                    sidebar_split.collapse(1);
                } else {
                    sidebar_split.setSizes([80, 20]);
                }
                document.getElementById("sidebar-dmm").classList.remove("hidden");
                document.getElementById("sidebar-osc").classList.add("hidden");
                resizeAll();
                sidebarShown = !sidebarShown;
            })
            break;
        case "osc":
            text = "Oscilloscope";
            div.addEventListener("click", () => {
                if (sidebarShown) {
                    sidebar_split.collapse(1);
                } else {
                    sidebar_split.setSizes([80, 20]);
                }
                document.getElementById("sidebar-dmm").classList.add("hidden");
                document.getElementById("sidebar-osc").classList.remove("hidden");
                resizeAll();
                sidebarShown = !sidebarShown;
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

        initRender();

        initSocket();

        resizeAll();

    }).catch((e) => console.log(e))
}
window.onresize = resizeAll;