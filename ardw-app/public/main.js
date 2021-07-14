var socket = io();

var topmostdiv = document.getElementById("topmostdiv");

var schid_to_pos = {}; // schid : index in schdata.schematics
var ref_to_id = {}; // ref : refid
var bomdict = {};   // refid : bomentry
var compdict = {};  // refid : comp data (sch + bomentry)

var highlightedFootprints = [];
var highlightedNet = null;
var lastClicked = -1;

var numSchematics;
var currentSchematic; // schid (starts at 1)

var sch_zoom_default; // different for each schematic
var sch_click_buffer = 20; // how much of a buffer there is around the bbox of sch components

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

// ------------- IBOM utils.js ------------ //
var settings = {
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

function initData() {
    ref_to_id = {};
    bomdict = {};
    for (var bomentry of pcbdata.bom.both.slice()) {
        // Entries may have multiple components
        for (var ref of bomentry[3]) {
            ref_to_id[ref[0]] = ref[1];
            singular = [bomentry[0], bomentry[1], bomentry[2], [ref], bomentry[4], bomentry[5]];
            bomdict[ref[1]] = singular;
        }
    }

    // TODO handle components with multiple bboxes (across schematics)
    schid_to_pos = {};
    compdict = {};
    for (var i in schdata.schematics) {
        var sch = schdata.schematics[i];
        var schid = parseInt(sch.orderpos.sheet);
        schid_to_pos[schid] = i; // this is necessary bc schdata schematics may be out of order
        for (var comp of sch.components) {
            var refid = ref_to_id[comp.ref];

            if (refid === undefined) {
                // We have a component not found in the pcbnew data
                console.log(`Component ${comp.ref} found in schematic but not in layout`);
                continue;
            }

            if (refid in compdict) {
                if (!(schid in compdict[refid].schids)) {
                    compdict[refid].schids.push(schid);
                }
                compdict[refid].boxes.push({
                    "box": comp.bbox,
                    "schid": schid
                });
            } else {
                comp["bomentry"] = bomdict[refid];
                comp["schids"] = [schid];
                comp["boxes"] = [{
                    "box": comp.bbox,
                    "schid": schid
                }]
                compdict[refid] = comp;
            }
        }
    }

    numSchematics = schdata.schematics[0].orderpos.total
    currentSchematic = 1
}
// ---------------------------------------- //

// Holds svg of schematic and its highlights
var schematic_canvas = {
    transform: {
        x: 0,
        y: 0,
        s: 1,
        panx: 0,
        pany: 0,
        zoom: 0.1 // Temp aesthetic thing
    },
    pointerStates: {},
    anotherPointerTapped: false,
    layer: "S",
    bg: document.getElementById("sch_bg"),
    highlight: document.getElementById("sch_hl"),
    img: new Image()
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
    //schematic_canvas.img.src = "./svgs/A64-OlinuXino_Rev_G.svg";
    switchSchematic(1);
}

function switchSchematic(schid) {
    schematic_canvas.img.src = `http://${window.location.host}/sch${schid}`;
    currentSchematic = schid;

    resizeCanvas(schematic_canvas);

    schdim = schdata.schematics[schid_to_pos[schid]].dimensions;
    
    xfactor = parseFloat(schematic_canvas.bg.width) / parseFloat(schdim.x)
    yfactor = parseFloat(schematic_canvas.bg.height) / parseFloat(schdim.y)

    sch_zoom_default = Math.min(xfactor, yfactor) / schematic_canvas.transform.s;
    resetTransform(schematic_canvas);
}

function drawSchematicHighlights() {
    var style = getComputedStyle(topmostdiv);

    var canvas = schematic_canvas.highlight;
    prepareCanvas(canvas, false, schematic_canvas.transform);
    clearCanvas(canvas);
    var ctx = canvas.getContext("2d");
    if (highlightedFootprints.length > 0) {
        for (var refid of highlightedFootprints) {
            for (var bbox of compdict[refid].boxes) {
                if (bbox.schid == currentSchematic) {
                    var box = bbox.box.map((b) => parseFloat(b));
            
                    ctx.beginPath();
                    ctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
                    ctx.fillStyle = style.getPropertyValue("--schematic-highlight-fill-color");
                    ctx.strokeStyle = style.getPropertyValue("--schematic-highlight-line-color");
                    ctx.lineWidth = style.getPropertyValue("--schematic-highlight-line-width");
                    ctx.fill();
                    ctx.stroke();

                    // TODO increase stroke width!
                }
            }
        }
    }
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

        initRender();

        initSchematicCanvas();

        resizeAll();

    }).catch((e) => console.log(e))
}
window.onresize = resizeAll;