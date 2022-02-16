// This file is included on all webpages.
// It contains settings, data, and other general global variables,
// as well as a handful of utility functions.


/** raw schematic json file */
var schdata;
/** raw layout json file */
var pcbdata;

/** schid : index in schdata.schematics */
var schid_to_idx = {};
/** ref : refid */
var ref_to_id = {};
/** 'ref.pinnum' : pinidx */
var pinref_to_idx = {};

/** refid : ref, schids, units={unitnum : schid, bbox, pins=[pinidx]} */
var compdict = {};
/** netname : schids, pins=[pinidx] */
var netdict = {};
/** pinidx : pin = {ref, name, num, pos, schid, net} */
var pindict = [];

var num_schematics;
var current_schematic; // schid (starts at 1)

/** A handful of application settings */
var settings = {
  "log-error": true,
  "log-warning": true,
  "find-activate": "key", // 'key', 'auto'
  "find-type": "xhair",   // 'zoom', 'xhair'
  "tool-selection-display": "icon",  // 'xhair', 'icon'
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

/**
 * Returns the display name for the element, based on type
 * @param {*} element Must be {type, val}
 */
function getElementName(element) {
  switch (element.type) {
    case "comp":
      return `Component ${compdict[element.val].ref}`;
    case "pin":
      return `Pin ${pindict[element.val].ref}.${pindict[element.val].num}`;
    case "net":
      return `Net ${element.val}`;
    case "deselect":
      return "Cancel"
  }
}

/**
 * Forces the given input field to only accept numeric input
 * @param {*} input Expects input[type="text"]
 */
function forceNumericInput(input) {
  input.addEventListener("input", () => {
    if (/^-?\d*.?\d*$/.test(input.value)) {
      // all good
      input.oldValue = input.value;
    } else {
      if (input.hasOwnProperty("oldValue")) {
        input.value = input.oldValue;
      } else {
        input.value = "";
      }
    }
  });
}

// ----- From IBOM web/util.js ----- //
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

/** Initializes some IBOM unit parsing (TODO may be unnecessary now) */
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

/** Populates the appropriate variables with data from the server,
 * from array corresponding to urls ["schdata", "pcbdata", "datadicts"] */
function initData(data) {
  schdata = data[0];
  pcbdata = data[1];

  schid_to_idx = data[2]["schid_to_idx"]
  ref_to_id = data[2]["ref_to_id"]
  pinref_to_idx = data[2]["pinref_to_idx"]
  compdict = data[2]["compdict"]
  netdict = data[2]["netdict"]
  pindict = data[2]["pindict"]
}

// Functions to convert between different bbox formats
//      list: [x1, y1, x2, y2]
//      obj: {"minx", "miny", "maxx", "maxy"}
//      pcbnew: {"pos", "relpos", "angle", "size"}

/** [x1, y1, x2, y2] => [minx, miny, maxx, maxy] */
function bboxListSort(bbox) {
  return [
    Math.min(bbox[0], bbox[2]),
    Math.min(bbox[1], bbox[3]),
    Math.max(bbox[0], bbox[2]),
    Math.max(bbox[1], bbox[3])
  ];
}
/** [x1, y1, x2, y2] => {"minx", "miny", "maxx", "maxy"} */
function bboxListToObj(bbox) {
  return {
    "minx": Math.min(bbox[0], bbox[2]),
    "miny": Math.min(bbox[1], bbox[3]),
    "maxx": Math.max(bbox[0], bbox[2]),
    "maxy": Math.max(bbox[1], bbox[3])
  };
}
/** {"minx", "miny", "maxx", "maxy"} => [x1, y1, x2, y2] */
function bboxObjToList(bbox) {
  return [bbox.minx, bbox.miny, bbox.maxx, bbox.maxy];
}
/** {"pos", "relpos", "angle", "size"} => [x1, y1, x2, y2] */
function bboxPcbnewToList(bbox) {
  var corner1;
  var corner2;
  if (bbox.relpos === undefined) {
    // footprint.pad
    corner1 = [-bbox.size[0] / 2, -bbox.size[1] / 2];
    corner2 = [bbox.size[1] / 2, bbox.size[1] / 2];
  } else {
    // footprint.bbox
    corner1 = [bbox.relpos[0], bbox.relpos[1]];
    corner2 = [bbox.relpos[0] + bbox.size[0], bbox.relpos[1] + bbox.size[1]];
    corner1 = rotateVector(corner1, bbox.angle);
    corner2 = rotateVector(corner2, bbox.angle);
  }

  return [
    Math.min(corner1[0], corner2[0]) + bbox.pos[0],
    Math.min(corner1[1], corner2[1]) + bbox.pos[1],
    Math.max(corner1[0], corner2[0]) + bbox.pos[0],
    Math.max(corner1[1], corner2[1]) + bbox.pos[1]
  ];
}
/** {"pos", "relpos", "angle", "size"} => {"minx", "miny", "maxx", "maxy"} */
function bboxPcbnewToObj(bbox) {
  return bboxListToObj(bboxPcbnewToList(bbox));
}


/** Converts page offset coords (eg. from event.offsetX) to layout coords*/
function offsetToLayoutCoords(point, layerdict) {
  var t = layerdict.transform;
  if (layerdict.layer == "B") {
    point[0] = (devicePixelRatio * point[0] / t.zoom - t.panx + t.x) / -t.s;
  } else {
    point[0] = (devicePixelRatio * point[0] / t.zoom - t.panx - t.x) / t.s;
  }
  point[1] = (devicePixelRatio * point[1] / t.zoom - t.y - t.pany) / t.s;
  return rotateVector(point, -ibom_settings.boardRotation);
}
/** Converts layout coords to page client coords (eg. from event.clientX) */
function layoutToClientCoords(point, layer) {
  var layerdict = (layer == "F" ? allcanvas.front : allcanvas.back);
  var t = layerdict.transform;
  var v = rotateVector(point, ibom_settings.boardRotation);
  if (layer == "B") {
    v[0] = (v[0] * -t.s + t.panx - t.x) * t.zoom / devicePixelRatio;
  } else {
    v[0] = (v[0] * t.s + t.panx + t.x) * t.zoom / devicePixelRatio;
  }
  v[1] = (v[1] * t.s + t.pany + t.y) * t.zoom / devicePixelRatio;
  var offset_parent = layerdict.bg.offsetParent;
  // Last step is converting from offset coords to client coords
  return [v[0] + offset_parent.offsetLeft, v[1] + offset_parent.offsetTop]
}
