var socket;

var topmostdiv = document.getElementById("topmostdiv");

var schid_to_idx = {};  // schid : index in schdata.schematics
var ref_to_id = {};     // ref : refid
var pinref_to_idx = {}; // 'ref.pinnum' : pinidx
var compdict = {};  // refid : comp data (sch + bomentry)
var netdict = {};   // netname : schids
var pindict = {};   // pinidx : pin data (ref, name, num, pos, schid, net)

var numSchematics;
var currentSchematic; // schid (starts at 1)

var highlightedComponent = -1; // refid
var highlightedPin = -1; // pinidx
var highlightedNet = null; // netname

var debugCompPins = null;

// document elements
var searchInputField = null;
var searchNavNum = null;
var searchNavText = null;

var searchNavCurrent = [0, 0];

var drawCrosshair = false;

var sch_zoom_default; // changes for each schematic
var sch_view_minimums = {
    "comp": 0.1,
    "pin": 0.04,
    "net": 0.5
};
var sch_view_maximum = 0.8;
var SCH_CLICK_BUFFER = 20; // how much of a buffer there is around the bbox of sch components
var PIN_BBOX_SIZE = 50; // how big the bbox around a pin is

// Holds svg of schematic and its highlights
var schematic_canvas = {
    transform: {
        x: 0,
        y: 0,
        s: 1,
        panx: 0,
        pany: 0,
        zoom: 0.1 // Overridden on load
    },
    pointerStates: {},
    anotherPointerTapped: false,
    layer: "S",
    bg: document.getElementById("sch_bg"),
    highlight: document.getElementById("sch_hl"),
    img: new Image()
}

display_split = Split(["#schematic-div", "#layout-div"], {
    sizes: [50, 50],
    gutterSize: 5,
    onDragEnd: resizeAll
});
canvas_split = Split(["#front-canvas", "#back-canvas"], {
    sizes: [50, 50],
    gutterSize: 5,
    direction: "vertical",
    onDragEnd: resizeAll
});

var settings = {
    "log-error": true,
    "log-warning": false,
    "find-activate": "key", // 'key', 'auto'
    "find-type": "zoom"     // 'zoom', 'xhair'
};

// ------------- IBOM utils.js ------------ //
var ibom_settings = {
    canvaslayout: "default",
    bomlayout: "default",
    bommode: "ungrouped",
    checkboxes: [],
    checkboxStoredRefs: {},
    darkMode: false,
    highlightpin1: false,
    redrawOnDrag: true,
    boardRotation: 0,
    renderPads: true,
    renderReferences: true,
    renderValues: true,
    renderSilkscreen: true,
    renderFabrication: false,
    renderDnpOutline: false,
    renderTracks: false,
    renderZones: false,
}

var units = {
    prefixes: {
        giga: ["G", "g", "giga", "Giga", "GIGA"],
        mega: ["M", "mega", "Mega", "MEGA"],
        kilo: ["K", "k", "kilo", "Kilo", "KILO"],
        milli: ["m", "milli", "Milli", "MILLI"],
        micro: ["U", "u", "micro", "Micro", "MICRO", "μ", "µ"], // different utf8 μ
        nano: ["N", "n", "nano", "Nano", "NANO"],
        pico: ["P", "p", "pico", "Pico", "PICO"],
    },
    unitsShort: ["R", "r", "Ω", "F", "f", "H", "h"],
    unitsLong: [
        "OHM", "Ohm", "ohm", "ohms",
        "FARAD", "Farad", "farad",
        "HENRY", "Henry", "henry"
    ],
    getMultiplier: function (s) {
        if (this.prefixes.giga.includes(s)) return 1e9;
        if (this.prefixes.mega.includes(s)) return 1e6;
        if (this.prefixes.kilo.includes(s)) return 1e3;
        if (this.prefixes.milli.includes(s)) return 1e-3;
        if (this.prefixes.micro.includes(s)) return 1e-6;
        if (this.prefixes.nano.includes(s)) return 1e-9;
        if (this.prefixes.pico.includes(s)) return 1e-12;
        return 1;
    },
    valueRegex: null,
}

function initUtils() {
    var allPrefixes = units.prefixes.giga
        .concat(units.prefixes.mega)
        .concat(units.prefixes.kilo)
        .concat(units.prefixes.milli)
        .concat(units.prefixes.micro)
        .concat(units.prefixes.nano)
        .concat(units.prefixes.pico);
    var allUnits = units.unitsShort.concat(units.unitsLong);
    units.valueRegex = new RegExp("^([0-9\.]+)" +
        "\\s*(" + allPrefixes.join("|") + ")?" +
        "(" + allUnits.join("|") + ")?" +
        "(\\b.*)?$", "");
    units.valueAltRegex = new RegExp("^([0-9]*)" +
        "(" + units.unitsShort.join("|") + ")?" +
        "([GgMmKkUuNnPp])?" +
        "([0-9]*)" +
        "(\\b.*)?$", "");
    for (var bom_type of ["both", "F", "B"]) {
        for (var row of pcbdata.bom[bom_type]) {
            row.push(parseValue(row[1], row[3][0][0]));
        }
    }
}

function parseValue(val, ref) {
    var inferUnit = (unit, ref) => {
        if (unit) {
            unit = unit.toLowerCase();
            if (unit == 'Ω' || unit == "ohm" || unit == "ohms") {
                unit = 'r';
            }
            unit = unit[0];
        } else {
            ref = /^([a-z]+)\d+$/i.exec(ref);
            if (ref) {
                ref = ref[1].toLowerCase();
                if (ref == "c") unit = 'f';
                else if (ref == "l") unit = 'h';
                else if (ref == "r" || ref == "rv") unit = 'r';
                else unit = null;
            }
        }
        return unit;
    };
    val = val.replace(/,/g, "");
    var match = units.valueRegex.exec(val);
    var unit;
    if (match) {
        val = parseFloat(match[1]);
        if (match[2]) {
            val = val * units.getMultiplier(match[2]);
        }
        unit = inferUnit(match[3], ref);
        if (!unit) return null;
        else return {
            val: val,
            unit: unit,
            extra: match[4],
        }
    }
    match = units.valueAltRegex.exec(val);
    if (match && (match[1] || match[4])) {
        val = parseFloat(match[1] + "." + match[4]);
        if (match[3]) {
            val = val * units.getMultiplier(match[3]);
        }
        unit = inferUnit(match[2], ref);
        if (!unit) return null;
        else return {
            val: val,
            unit: unit,
            extra: match[5],
        }
    }
    return null;
}
// ---------------------------------------- //

function logerr(msg) {
    if (settings["log-error"]) {
        console.log("Error: " + msg);
    }
}

function logwarn(msg) {
    if (settings["log-warning"]) {
        console.log("Warning: " + msg);
    }
}

function initData() {
    ref_to_id = {};
    var bomdict = {};
    for (var bomentry of pcbdata.bom.both.slice()) {
        // Entries may have multiple components
        for (var ref of bomentry[3]) {
            ref_to_id[ref[0]] = ref[1];
            singular = [bomentry[0], bomentry[1], bomentry[2], [ref], bomentry[4], bomentry[5]];
            bomdict[ref[1]] = singular;
        }
    }

    numSchematics = schdata.schematics[0].orderpos.total
    currentSchematic = 1

    // Build compdict of {refid : ref, libcomp, schids = [], units = {unit : schid, bbox = [], pins = []}}
    schid_to_idx = {};
    compdict = {};
    for (var i in schdata.schematics) {
        var sch = schdata.schematics[i];
        var schid = parseInt(sch.orderpos.sheet);
        schid_to_idx[schid] = i; // this is necessary bc schdata schematics may be out of order
        if (sch.components === undefined) {
            console.log(`Schematic ${schid}/${numSchematics} ${sch.name} has no components, skipping`);
            continue;
        }
        for (var comp of sch.components) {
            var refid = ref_to_id[comp.ref];

            if (refid === undefined) {
                // We have a component not found in the pcbnew data
                logwarn(`Component ${comp.ref} found in schematic but not in layout (was ignored)`);
                continue;
            }

            var unit = parseInt(comp.unit);

            if (refid in compdict) {
                if (!(compdict[refid].schids.includes(schid))) {
                    compdict[refid].schids.push(schid);
                }
                if (unit in compdict[refid].units) {
                    logerr(`Component ${comp.ref} has unit ${unit} multiple times`)
                    continue;
                }
            } else {
                compdict[refid] = {
                    "ref": comp.ref,
                    "libcomp": comp.libcomp,
                    "schids": [schid],
                    //"bomentry": bomdict[refid],
                    "units": {}
                };
            }

            compdict[refid].units[unit] = {
                "num": unit,
                "schid": schid,
                "bbox": comp.bbox,
                "pins": comp.pins
            };
        }
    }

    // For each pin in each net, assign the appropriate net to the pin in compdict
    // Also, populate netdict with {name : schids, pins}
    netdict = {};
    for (var i in schdata.nets) {
        var netinfo = schdata.nets[i];
        var schids = [];
        for (var netpin of netinfo.pins) {
            var refid = ref_to_id[netpin.ref];
            if (compdict[refid] == undefined) {
                logwarn(`ref ${netpin.ref} with a pin in net ${netinfo.name} wasn't found (was ignored)`);
                continue;
            }
            for (var unitnum in compdict[refid].units) {
                for (var unitpinidx in compdict[refid].units[unitnum].pins) {
                    // netpin.pin should match unitpin.num, not unitpin.name
                    if (netpin.pin == compdict[refid].units[unitnum].pins[unitpinidx].num) {
                        // Storing the net (as netname) in the pin for future use in pindict
                        compdict[refid].units[unitnum].pins[unitpinidx]["net"] = netinfo.name;

                        var schid = compdict[refid].units[unitnum].schid
                        if (!schids.includes(schid)) {
                            schids.push(schid);
                        }
                    }
                }
            }
        }
        if (schids.length == 0) {
            logwarn(`net ${netinfo.name} has no valid pins (left out of netlist)`);
            continue;
        }
        netdict[netinfo.name] = {
            "schids": schids,
            "pins": []
        }
    }

    // All pins get put into one big "dict" with arbitrary pinidx
    pinref_to_idx = {};
    pinidx = 0;
    pindict = [];
    for (var refid in compdict) {
        for (var unitnum in compdict[refid].units) {
            var unit = compdict[refid].units[unitnum];
            for (var pin of unit.pins) {
                pin["ref"] = compdict[refid].ref;
                pin["schid"] = unit.schid;
                if (pin["net"] == undefined) {
                    pin["net"] = null;
                } else if (pin["net"] in netdict) {
                    netdict[pin["net"]]["pins"].push(pinidx);
                }
                let pin_name = `${pin["ref"]}.${pin["num"]}`;
                if (pinref_to_idx[pin_name] !== undefined) {
                    logwarn(`pin name ${pin_name} is not unique`);
                } else {
                    pinref_to_idx[pin_name] = pinidx;
                }
                pindict.push(pin);
                pinidx++;
            }
        }
    }
}

function appendSelectionDiv(parent, val, type) {
    var div = document.createElement("div");
    div.addEventListener("click", () => {
        clickedType[type](val);
        parent.classList.add("hidden");
    });
    if (type === "comp") {
        div.innerHTML = `Component ${compdict[val].ref}`;
    } else if (type === "pin") {
        div.innerHTML = `Pin ${pindict[val].ref}.${pindict[val].num}`;
    } else {
        div.innerHTML = `Net ${val}`;
    }
    parent.appendChild(div);
}

function zoomToSelection(layerdict) {
    console.log("Finding selection");
    let t = layerdict.transform;
    // console.log(`current transform px / py / z is ${t.panx} / ${t.pany} / ${t.zoom}`);

    var boxes = [];
    var targetsize;

    if (layerdict.layer === "S") {
        if (highlightedComponent !== -1) {
            var comp = compdict[highlightedComponent];
            for (let unitnum in comp.units) {
                let unit = comp.units[unitnum];
                if (unit.schid == currentSchematic) {
                    boxes.push(unit.bbox);
                }
            }
            targetsize = sch_view_minimums["comp"];
        }
        if (highlightedPin !== -1) {
            var pin = pindict[highlightedPin];
            if (pin.schid == currentSchematic) {
                boxes.push(pinBoxFromPos(pin.pos));
            }
            targetsize = sch_view_minimums["pin"];
        }
        if (highlightedNet !== null) {
            for (let pinidx in pindict) {
                let pin = pindict[pinidx];
                if (pin.schid == currentSchematic && pin.net == highlightedNet) {
                    boxes.push(pinBoxFromPos(pin.pos));
                }
            }
            targetsize = sch_view_minimums["net"];
        }
    } else {
        // layout canvas F or B
        if (highlightedComponent !== -1) {

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
        console.log("Zooming")
        if (maxrat > sch_view_maximum) {
            targetsize = sch_view_maximum;
        }
        var schdim = schdata.schematics[schid_to_idx[currentSchematic]].dimensions;
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
    var newpy = ((newvh / 2) - centery) * t.s - t.y;
    layerdict.transform.panx = newpx;
    layerdict.transform.pany = newpy;
    resizeAll();
}

function crosshairOnSelection(canvas, layer) {
    var pos = [];
    if (highlightedComponent !== -1) {
        pos = pcbdata.footprints[highlightedComponent].bbox.pos;
    }
    if (highlightedPin !== -1) {
        console.log("Crosshair for pins WIP");
    }
    if (highlightedNet !== null) {
        console.log("Crosshair not available for nets");
    }

    if (pos.length > 0 && pcbdata.footprints[highlightedComponent].layer == layer) {
        var style = getComputedStyle(topmostdiv);
        var ctx = canvas.getContext("2d");
        ctx.strokeStyle = style.getPropertyValue("--pcb-crosshair-line-color");
        ctx.lineWidth = style.getPropertyValue("--pcb-crosshair-line-width");
        ctx.beginPath();
        ctx.moveTo(0, pos[1]);
        ctx.lineTo(300, pos[1]);
        ctx.stroke();
        ctx.moveTo(pos[0], 0);
        ctx.lineTo(pos[0], 300);
        ctx.stroke();
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
                } else {
                    drawCrosshair = !drawCrosshair;
                    drawHighlights();
                }
            }
        }
    }, true);

    // Schematic selection
    var schSelectionDisplay = document.getElementById("sch-selection");
    for (let i = 1; i <= numSchematics; i++) {
        let div = document.createElement("div");
        div.innerHTML = `${i}. ${schdata.schematics[schid_to_idx[i]].name}`;
        div.innerHTML += `<span>&#9666;</span>`;
        div.addEventListener("click", () => {
            switchSchematic(i);
        });
        if (i == currentSchematic) {
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

        if (highlightedComponent !== -1) {
            let comp = compdict[highlightedComponent];
            let unit = Object.values(comp.units)[searchNavCurrent[0] - 1];
            searchNavText.innerText = `${comp.ref} ${unit.num}`;
            if (unit.schid != currentSchematic) {
                switchSchematic(unit.schid);
            }
            // TODO emphasize this unit somehow
        }
        if (highlightedNet !== null) {
            let pin = pindict[netdict[highlightedNet]["pins"][searchNavCurrent[0] - 1]];
            searchNavText.innerText = `${pin.ref}.${pin.num}`;
            if (pin.schid != currentSchematic) {
                switchSchematic(pin.schid);
            }
            // TODO emphasize this pin somehow
        }
    }
}

function drawCanvasImg(layerdict, x = 0, y = 0, backgroundColor = null) {
    var canvas = layerdict.bg;
    prepareCanvas(canvas, false, layerdict.transform);
    clearCanvas(canvas, backgroundColor);
    canvas.getContext("2d").drawImage(layerdict.img, x, y);
}

function addMouseHandlers(div, layerdict) {
    div.addEventListener("pointerdown", function (e) {
        handlePointerDown(e, layerdict);
    });
    div.addEventListener("pointermove", function (e) {
        handlePointerMove(e, layerdict);
    });
    div.addEventListener("pointerup", function (e) {
        handlePointerUp(e, layerdict);
    });
    var pointerleave = function (e) {
        handlePointerLeave(e, layerdict);
    }
    div.addEventListener("pointercancel", pointerleave);
    div.addEventListener("pointerleave", pointerleave);
    div.addEventListener("pointerout", pointerleave);

    div.onwheel = function (e) {
        handleMouseWheel(e, layerdict);
    }
    for (var element of [div, layerdict.bg, layerdict.fab, layerdict.silk, layerdict.highlight]) {
        if (element) {
            element.addEventListener("contextmenu", function (e) {
                e.preventDefault();
            }, false);
        }
    }
}

function initSchematicCanvas() {
    addMouseHandlers(document.getElementById("schematic-canvas"), schematic_canvas);

    var bg = schematic_canvas.bg;
    var hl = schematic_canvas.highlight;

    var ratio = window.devicePixelRatio || 1;

    // Increase the canvas dimensions by the pixel ratio (display size controlled by CSS)
    bg.width *= ratio;
    bg.height *= ratio;
    hl.width *= ratio;
    hl.height *= ratio;

    schematic_canvas.img.onload = function () {
        drawCanvasImg(schematic_canvas, 0, 0);
    };
    switchSchematic(1);
}

function switchSchematic(schid) {
    schematic_canvas.img.src = `http://${window.location.host}/sch${schid}`;
    currentSchematic = schid;

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
    resetTransform(schematic_canvas);
}

function pinBoxFromPos(pos) {
    pos = pos.map((p) => parseInt(p));

    return [
        pos[0] - PIN_BBOX_SIZE,
        pos[1] - PIN_BBOX_SIZE,
        pos[0] + PIN_BBOX_SIZE,
        pos[1] + PIN_BBOX_SIZE
    ];
}

function drawSchBox(ctx, box) {
    var style = getComputedStyle(topmostdiv);

    ctx.beginPath();
    ctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    ctx.fillStyle = style.getPropertyValue("--schematic-highlight-fill-color");
    ctx.strokeStyle = style.getPropertyValue("--schematic-highlight-line-color");
    ctx.lineWidth = style.getPropertyValue("--schematic-highlight-line-width");
    ctx.fill();
    ctx.stroke();
}

function drawSchematicHighlights() {
    var canvas = schematic_canvas.highlight;
    prepareCanvas(canvas, false, schematic_canvas.transform);
    clearCanvas(canvas);
    var ctx = canvas.getContext("2d");
    if (highlightedComponent !== -1) {
        if (compdict[highlightedComponent] == undefined) {
            logerr(`highlighted refid ${highlightedComponent} not in compdict`);
            return;
        }
        for (var unitnum in compdict[highlightedComponent].units) {
            var unit = compdict[highlightedComponent].units[unitnum];
            if (unit.schid == currentSchematic) {
                var box = unit.bbox.map((b) => parseFloat(b));
                drawSchBox(ctx, box);
            }
        }
    }
    if (highlightedPin !== -1) {
        if (pindict[highlightedPin] == undefined) {
            logerr(`highlighted pinidx ${highlightedPin} not in pindict`);
            return;
        }
        var pin = pindict[highlightedPin];
        if (pin.schid == currentSchematic) {
            drawSchBox(ctx, pinBoxFromPos(pin.pos));
        } else {
            logwarn(`current pin ${pin.ref} / ${pin.num} is on schid ${pin.schid},` +
                `but we are on schid ${currentSchematic}`);
        }
    }
    if (debugCompPins !== null) {
        for (var pin of pindict) {
            if (pin.ref == debugCompPins && pin.schid == currentSchematic) {
                drawSchBox(ctx, pinBoxFromPos(pin.pos));
            }
        }
    }
    if (highlightedNet !== null) {
        for (var pin of pindict) {
            if (pin.schid == currentSchematic && pin.net == highlightedNet) {
                drawSchBox(ctx, pinBoxFromPos(pin.pos));
            }
        }
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

window.onload = () => {
    data_urls = ["schdata", "pcbdata"]
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

        initSchematicCanvas();

        initSocket();

        resizeAll();

    }).catch((e) => console.log(e))
}
window.onresize = resizeAll;