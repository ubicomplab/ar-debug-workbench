// Settings, utility functions, and PCB data

var schdata;
var pcbdata;

var schid_to_idx = {};  // schid : index in schdata.schematics
var ref_to_id = {};     // ref : refid
var pinref_to_idx = {}; // 'ref.pinnum' : pinidx
var compdict = {};  // refid : comp data (sch + bomentry)
var netdict = {};   // netname : schids
var pindict = [];   // pinidx : pin data (ref, name, num, pos, schid, net)

var num_schematics;
var current_schematic; // schid (starts at 1)

var settings = {
    "log-error": true,
    "log-warning": true,
    "find-activate": "key", // 'key', 'auto'
    "find-type": "zoom"     // 'zoom', 'xhair'
};


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

// ---- From IBOM web/util.js ---- //
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
// -------------------- //

// Populates the PCB data dictionaries
// Requires populated schdata and pcbdata variables
function initData() {
    if (schdata === undefined || pcbdata === undefined) {
        logerr("Failed to load necessary data");
        return;
    }

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

    num_schematics = schdata.schematics[0].orderpos.total
    current_schematic = 1

    // Build compdict of {refid : ref, libcomp, schids = [], units = {unit : schid, bbox = [], pins = []}}
    schid_to_idx = {};
    compdict = {};
    for (var i in schdata.schematics) {
        var sch = schdata.schematics[i];
        var schid = parseInt(sch.orderpos.sheet);
        schid_to_idx[schid] = i; // this is necessary bc schdata schematics may be out of order
        if (sch.components === undefined) {
            logwarn(`Schematic ${schid}/${num_schematics} ${sch.name} has no components, skipping`);
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
                    logwarn(`Component ${comp.ref} has unit ${unit} multiple times, ignoring repeats`)
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

// Functions to convert between different bbox formats
//      list: [x1, y1, x2, y2]
//      obj: {"minx", "miny", "maxx", "maxy"}
//      pcbnew: {"pos", "relpos", "angle", "size"}
function bboxListToObj(bbox) {
    return {
        "minx": Math.min(bbox[0], bbox[2]),
        "miny": Math.min(bbox[1], bbox[3]),
        "maxx": Math.max(bbox[0], bbox[2]),
        "maxy": Math.max(bbox[1], bbox[3])
    };
}
function bboxObjToList(bbox) {
    return [bbox.minx, bbox.miny, bbox.maxx, bbox.maxy];
}
function bboxPcbnewToList(bbox) {
    // footprint.bbox or .pad
    var relpos = bbox.relpos !== undefined ? bbox.relpos : [0, 0];

    var corner1 = [relpos[0], relpos[1]];
    var corner2 = [relpos[0] + bbox.size[0], relpos[1] + bbox.size[1]];
    corner1 = rotateVector(corner1, bbox.angle);
    corner2 = rotateVector(corner2, bbox.angle);
    return [
        Math.min(corner1[0], corner2[0]) + bbox.pos[0],
        Math.min(corner1[1], corner2[1]) + bbox.pos[1],
        Math.max(corner1[0], corner2[0]) + bbox.pos[0],
        Math.max(corner1[1], corner2[1]) + bbox.pos[1]
    ];
}
function bboxPcbnewToObj(bbox) {
    return bboxListToObj(bboxPcbnewToList(bbox));
}
