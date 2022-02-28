// This file is included on all webpages.
// It contains rendering for schematic (svg) and layout (from pcbdata), including highlights.
// Layout rendering taken from Interactive HTML BOM /web/ibom.js, /web/render.js, /web/util.js
// https://github.com/openscopeproject/InteractiveHtmlBom
// Most of this file should not be modified.
// To render additional elements (such as crosshairs or annotations), look for the
// drawHighlightsOnLayer() and drawSchematicHighlights() functions near the bottom.


/** If true, layout will be rendered without s/x/y (which make the layout fill/center in its container) */
var IS_PROJECTOR = false;

/** Holds data for the layout canvases
 * front: layerdict, back: layerdict */
var allcanvas;

/** Holds data for the schematic canvas
 * layerdict */
var schematic_canvas;

/** The parent div of the whole page; contains CSS properties used when rendering things */
var topmostdiv = document.getElementById("topmostdiv");

/** An empty canvas context for performing calculations */
var emptyContext2d = document.createElement("canvas").getContext("2d");

/** The render settings used by the layout (some are deprecated) */
var ibom_settings = {
  // canvaslayout: "default",
  // bomlayout: "default",
  // bommode: "ungrouped",
  // checkboxes: [],
  // checkboxStoredRefs: {},
  // darkMode: false,
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
  renderDrawings: true,
  renderEdgeCuts: true,
}

/** if not null, display multimenu
 *  {hits: [], layer: str} */
var multimenu_active = null;

/** If true, draw a crosshair where the probe currently is. If false, draw a dot. */
var probe_crosshair = false;


// ----- Functions for rendering the layout (DO NOT MODIFY) ----- //
function deg2rad(deg) {
  return deg * Math.PI / 180;
}

function calcFontPoint(linepoint, text, offsetx, offsety, tilt) {
  var point = [
    linepoint[0] * text.width + offsetx,
    linepoint[1] * text.height + offsety
  ];
  // This approximates pcbnew behavior with how text tilts depending on horizontal justification
  point[0] -= (linepoint[1] + 0.5 * (1 + text.justify[0])) * text.height * tilt;
  return point;
}

function drawText(ctx, text, color) {
  if ("ref" in text && !ibom_settings.renderReferences) return;
  if ("val" in text && !ibom_settings.renderValues) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = text.thickness;
  if ("svgpath" in text) {
    ctx.stroke(new Path2D(text.svgpath));
    ctx.restore();
    return;
  }
  ctx.translate(...text.pos);
  ctx.translate(text.thickness * 0.5, 0);
  var angle = -text.angle;
  if (text.attr.includes("mirrored")) {
    ctx.scale(-1, 1);
    angle = -angle;
  }
  var tilt = 0;
  if (text.attr.includes("italic")) {
    tilt = 0.125;
  }
  var interline = text.height * 1.5 + text.thickness;
  var txt = text.text.split("\n");
  // KiCad ignores last empty line.
  if (txt[txt.length - 1] == '') txt.pop();
  ctx.rotate(deg2rad(angle));
  var offsety = (1 - text.justify[1]) / 2 * text.height; // One line offset
  offsety -= (txt.length - 1) * (text.justify[1] + 1) / 2 * interline; // Multiline offset
  for (var i in txt) {
    var lineWidth = text.thickness + interline / 2 * tilt;
    for (var j = 0; j < txt[i].length; j++) {
      if (txt[i][j] == '\t') {
        var fourSpaces = 4 * pcbdata.font_data[' '].w * text.width;
        lineWidth += fourSpaces - lineWidth % fourSpaces;
      } else {
        if (txt[i][j] == '~') {
          j++;
          if (j == txt[i].length)
            break;
        }
        lineWidth += pcbdata.font_data[txt[i][j]].w * text.width;
      }
    }
    var offsetx = -lineWidth * (text.justify[0] + 1) / 2;
    var inOverbar = false;
    for (var j = 0; j < txt[i].length; j++) {
      if (txt[i][j] == '\t') {
        var fourSpaces = 4 * pcbdata.font_data[' '].w * text.width;
        offsetx += fourSpaces - offsetx % fourSpaces;
        continue;
      } else if (txt[i][j] == '~') {
        j++;
        if (j == txt[i].length)
          break;
        if (txt[i][j] != '~') {
          inOverbar = !inOverbar;
        }
      }
      var glyph = pcbdata.font_data[txt[i][j]];
      if (inOverbar) {
        var overbarStart = [offsetx, -text.height * 1.4 + offsety];
        var overbarEnd = [offsetx + text.width * glyph.w, overbarStart[1]];

        if (!lastHadOverbar) {
          overbarStart[0] += text.height * 1.4 * tilt;
          lastHadOverbar = true;
        }
        ctx.beginPath();
        ctx.moveTo(...overbarStart);
        ctx.lineTo(...overbarEnd);
        ctx.stroke();
      } else {
        lastHadOverbar = false;
      }
      for (var line of glyph.l) {
        ctx.beginPath();
        ctx.moveTo(...calcFontPoint(line[0], text, offsetx, offsety, tilt));
        for (var k = 1; k < line.length; k++) {
          ctx.lineTo(...calcFontPoint(line[k], text, offsetx, offsety, tilt));
        }
        ctx.stroke();
      }
      offsetx += glyph.w * text.width;
    }
    offsety += interline;
  }
  ctx.restore();
}

function drawEdge(ctx, scalefactor, edge, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1 / scalefactor, edge.width);
  ctx.lineCap = "round";
  if ("svgpath" in edge) {
    ctx.stroke(new Path2D(edge.svgpath));
  } else {
    ctx.beginPath();
    if (edge.type == "segment") {
      ctx.moveTo(...edge.start);
      ctx.lineTo(...edge.end);
    }
    if (edge.type == "rect") {
      ctx.moveTo(...edge.start);
      ctx.lineTo(edge.start[0], edge.end[1]);
      ctx.lineTo(...edge.end);
      ctx.lineTo(edge.end[0], edge.start[1]);
      ctx.lineTo(...edge.start);
    }
    if (edge.type == "arc") {
      ctx.arc(
        ...edge.start,
        edge.radius,
        deg2rad(edge.startangle),
        deg2rad(edge.endangle));
    }
    if (edge.type == "circle") {
      ctx.arc(
        ...edge.start,
        edge.radius,
        0, 2 * Math.PI);
      ctx.closePath();
    }
    if (edge.type == "curve") {
      ctx.moveTo(...edge.start);
      ctx.bezierCurveTo(...edge.cpa, ...edge.cpb, ...edge.end);
    }
    ctx.stroke();
  }
}

function getChamferedRectPath(size, radius, chamfpos, chamfratio) {
  // chamfpos is a bitmask, left = 1, right = 2, bottom left = 4, bottom right = 8
  var path = new Path2D();
  var width = size[0];
  var height = size[1];
  var x = width * -0.5;
  var y = height * -0.5;
  var chamfOffset = Math.min(width, height) * chamfratio;
  path.moveTo(x, 0);
  if (chamfpos & 4) {
    path.lineTo(x, y + height - chamfOffset);
    path.lineTo(x + chamfOffset, y + height);
    path.lineTo(0, y + height);
  } else {
    path.arcTo(x, y + height, x + width, y + height, radius);
  }
  if (chamfpos & 8) {
    path.lineTo(x + width - chamfOffset, y + height);
    path.lineTo(x + width, y + height - chamfOffset);
    path.lineTo(x + width, 0);
  } else {
    path.arcTo(x + width, y + height, x + width, y, radius);
  }
  if (chamfpos & 2) {
    path.lineTo(x + width, y + chamfOffset);
    path.lineTo(x + width - chamfOffset, y);
    path.lineTo(0, y);
  } else {
    path.arcTo(x + width, y, x, y, radius);
  }
  if (chamfpos & 1) {
    path.lineTo(x + chamfOffset, y);
    path.lineTo(x, y + chamfOffset);
    path.lineTo(x, 0);
  } else {
    path.arcTo(x, y, x, y + height, radius);
  }
  path.closePath();
  return path;
}

function getOblongPath(size) {
  return getChamferedRectPath(size, Math.min(size[0], size[1]) / 2, 0, 0);
}

function getPolygonsPath(shape) {
  if (shape.path2d) {
    return shape.path2d;
  }
  if ("svgpath" in shape) {
    shape.path2d = new Path2D(shape.svgpath);
  } else {
    var path = new Path2D();
    for (var polygon of shape.polygons) {
      path.moveTo(...polygon[0]);
      for (var i = 1; i < polygon.length; i++) {
        path.lineTo(...polygon[i]);
      }
      path.closePath();
    }
    shape.path2d = path;
  }
  return shape.path2d;
}

function drawPolygonShape(ctx, shape, color) {
  ctx.save();
  ctx.fillStyle = color;
  if (!("svgpath" in shape)) {
    ctx.translate(...shape.pos);
    ctx.rotate(deg2rad(-shape.angle));
  }
  ctx.fill(getPolygonsPath(shape));
  ctx.restore();
}

function drawDrawing(ctx, scalefactor, drawing, color) {
  if (["segment", "arc", "circle", "curve"].includes(drawing.type)) {
    drawEdge(ctx, scalefactor, drawing, color);
  } else if (drawing.type == "polygon") {
    drawPolygonShape(ctx, drawing, color);
  } else {
    drawText(ctx, drawing, color);
  }
}

function getCirclePath(radius) {
  var path = new Path2D();
  path.arc(0, 0, radius, 0, 2 * Math.PI);
  path.closePath();
  return path;
}

function getCachedPadPath(pad) {
  if (!pad.path2d) {
    // if path2d is not set, build one and cache it on pad object
    if (pad.shape == "rect") {
      pad.path2d = new Path2D();
      pad.path2d.rect(...pad.size.map(c => -c * 0.5), ...pad.size);
    } else if (pad.shape == "oval") {
      pad.path2d = getOblongPath(pad.size);
    } else if (pad.shape == "circle") {
      pad.path2d = getCirclePath(pad.size[0] / 2);
    } else if (pad.shape == "roundrect") {
      pad.path2d = getChamferedRectPath(pad.size, pad.radius, 0, 0);
    } else if (pad.shape == "chamfrect") {
      pad.path2d = getChamferedRectPath(pad.size, pad.radius, pad.chamfpos, pad.chamfratio)
    } else if (pad.shape == "custom") {
      pad.path2d = getPolygonsPath(pad);
    }
  }
  return pad.path2d;
}

function drawPad(ctx, pad, color, outline) {
  ctx.save();
  ctx.translate(...pad.pos);
  ctx.rotate(deg2rad(pad.angle));
  if (pad.offset) {
    ctx.translate(...pad.offset);
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  var path = getCachedPadPath(pad);
  if (outline) {
    ctx.stroke(path);
  } else {
    ctx.fill(path);
  }
  ctx.restore();
}

function drawPadHole(ctx, pad, padHoleColor) {
  if (pad.type != "th") return;
  ctx.save();
  ctx.translate(...pad.pos);
  ctx.rotate(deg2rad(pad.angle));
  ctx.fillStyle = padHoleColor;
  if (pad.drillshape == "oblong") {
    ctx.fill(getOblongPath(pad.drillsize));
  } else {
    ctx.fill(getCirclePath(pad.drillsize[0] / 2));
  }
  ctx.restore();
}

// Note: outlineColor and outline are always null and false (we don't draw pin1 outlines)
function drawFootprint(ctx, layer, scalefactor, footprint, padColor, padHoleColor, outlineColor, highlight, outline) {
  if (highlight) {
    // draw bounding box
    if (footprint.layer == layer) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.translate(...footprint.bbox.pos);
      ctx.rotate(deg2rad(-footprint.bbox.angle));
      ctx.translate(...footprint.bbox.relpos);
      ctx.fillStyle = padColor;
      ctx.fillRect(0, 0, ...footprint.bbox.size);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = padColor;
      ctx.strokeRect(0, 0, ...footprint.bbox.size);
      ctx.restore();
    }
  }
  // draw drawings
  if (ibom_settings.renderDrawings) {
    for (var drawing of footprint.drawings) {
      if (drawing.layer == layer) {
        drawDrawing(ctx, scalefactor, drawing.drawing, padColor);
      }
    }
  }
  // draw pads
  if (ibom_settings.renderPads) {
    for (var pad of footprint.pads) {
      if (pad.layers.includes(layer)) {
        drawPad(ctx, pad, padColor, outline);
        if (pad.pin1 && ibom_settings.highlightpin1) {
          drawPad(ctx, pad, outlineColor, true);
        }
      }
    }
    for (var pad of footprint.pads) {
      drawPadHole(ctx, pad, padHoleColor);
    }
  }
}

function drawEdgeCuts(canvas, scalefactor) {
  var ctx = canvas.getContext("2d");
  var edgecolor = getComputedStyle(topmostdiv).getPropertyValue('--pcb-edge-color');
  for (var edge of pcbdata.edges) {
    drawEdge(ctx, scalefactor, edge, edgecolor);
  }
}

function drawPins(canvas, layer, highlight) {
  if (!highlight) {
    // Background "pins", ie. pads, are already drawn by drawFootprints()
    return;
  }

  var style = getComputedStyle(topmostdiv);
  var ctx = canvas.getContext("2d");

  var highlight_list = [];
  if (current_selection.type === "pin") {
    highlight_list.push({
      "val": current_selection.val,
      "color": style.getPropertyValue('--pad-color-highlight')
    });
  } else {
    for (let probe_name in probes) {
      let probe_info = probes[probe_name];
      if (probe_info.selection && probe_info.selection.type == "pin") {
        highlight_list.push({
          "val": probe_info.selection.val,
          "color": probe_info.color.sel
        });
      }
    }
  }

  for (let highlight of highlight_list) {
    let pinidx = highlight.val;
    let pin = pindict[pinidx];
    if (pin == undefined) {
      logerr(`highlighted pin ${pinidx} is not in pindict`);
      return;
    }
    // Trusting that every pin in pindict has a corresponding comp with a valid refid
    let pads = pcbdata.footprints[ref_to_id[pin.ref]].pads;
    let padDrawn = false;
    for (let pad of pads) {
      // padname should match pin.num, not pin.name
      if (pad.padname == pin.num && pad.layers.includes(layer)) {
        drawPad(ctx, pad, highlight.color, false);
        padDrawn = true;
      }
    }
    if (padDrawn && ibom_settings.renderPads) {
      // redraw all pad holes because some pads may overlap
      for (let pad of pads) {
        drawPadHole(ctx, pad, style.getPropertyValue('--pad-hole-color'));
      }
    }
  }
}

function drawFootprints(canvas, layer, scalefactor, highlight) {
  var style = getComputedStyle(topmostdiv);
  var ctx = canvas.getContext("2d");

  ctx.lineWidth = 3 / scalefactor;

  if (highlight) {
    var highlight_list = [];
    if (current_selection.type == "comp") {
      highlight_list.push({
        "val": current_selection.val,
        "color": style.getPropertyValue('--pad-color-highlight')
      });
    } else {
      for (let probe_name in probes) {
        let probe_info = probes[probe_name];
        if (probe_info.selection && probe_info.selection.type == "comp") {
          highlight_list.push({
            "val": probe_info.selection.val,
            "color": probe_info.color.sel
          });
        }
      }
    }

    for (let highlight_info of highlight_list) {
      drawFootprint(ctx, layer, scalefactor, pcbdata.footprints[highlight_info.val],
        highlight_info.color, style.getPropertyValue('--pad-hole-color'),
        null, highlight, false);
    }
  } else {
    for (let footprint of pcbdata.footprints) {
      drawFootprint(ctx, layer, scalefactor, footprint,
        style.getPropertyValue('--pad-color'), style.getPropertyValue('--pad-hole-color'),
        null, highlight, false);
    }
  }
}

function drawBgLayer(layername, canvas, layer, scalefactor, edgeColor, polygonColor, textColor) {
  var ctx = canvas.getContext("2d");
  for (var d of pcbdata.drawings[layername][layer]) {
    if (["segment", "arc", "circle", "curve", "rect"].includes(d.type)) {
      drawEdge(ctx, scalefactor, d, edgeColor);
    } else if (d.type == "polygon") {
      drawPolygonShape(ctx, d, polygonColor);
    } else {
      drawText(ctx, d, textColor);
    }
  }
}

function drawTracks(canvas, layer, color, highlight, highlight_dict) {
  ctx = canvas.getContext("2d");
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (var track of pcbdata.tracks[layer]) {
    if (highlight) {
      if (track.net in highlight_dict) {
        ctx.strokeStyle = highlight_dict[track.net].track
      } else {
        continue;
      }
    }
    ctx.lineWidth = track.width;
    ctx.beginPath();
    if ('radius' in track) {
      ctx.arc(
        ...track.center,
        track.radius,
        deg2rad(track.startangle),
        deg2rad(track.endangle));
    } else {
      ctx.moveTo(...track.start);
      ctx.lineTo(...track.end);
    }
    ctx.stroke();
  }
}

function drawZones(canvas, layer, color, highlight, highlight_dict) {
  ctx = canvas.getContext("2d");
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = "round";
  for (var zone of pcbdata.zones[layer]) {
    if (highlight) {
      if (zone.net in highlight_dict) {
        ctx.strokeStyle = highlight_dict[zone.net].zone;
        ctx.fillStyle = highlight_dict[zone.net].zone;
      } else {
        continue;
      }
    }
    if (!zone.path2d) {
      zone.path2d = getPolygonsPath(zone);
    }
    ctx.fill(zone.path2d);
    if (zone.width > 0) {
      ctx.lineWidth = zone.width;
      ctx.stroke(zone.path2d);
    }
  }
}

function clearCanvas(canvas, color = null) {
  var ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
}

function drawNets(canvas, layer, highlight) {
  var style = getComputedStyle(topmostdiv);
  var ctx = canvas.getContext("2d");

  var highlight_dict = {};
  if (highlight) {
    if (current_selection.type == "net") {
      highlight_dict[current_selection.val] = {
        "pad": style.getPropertyValue('--pad-color-highlight'),
        "track": style.getPropertyValue("--track-color-highlight"),
        "zone": style.getPropertyValue("--zone-color-highlight")
      }
    } else {
      for (let probe_name in probes) {
        let probe_info = probes[probe_name];
        if (probe_info.selection && probe_info.selection.type == "net") {
          highlight_dict[probe_info.selection.val] = {
            "pad": probe_info.color.sel,
            "track": probe_info.color.sel,
            "zone": probe_info.color.zone
          }
        }
      }
    }
  }

  if (ibom_settings.renderTracks) {
    drawTracks(canvas, layer, style.getPropertyValue("--track-color"), highlight, highlight_dict);
  }
  if (ibom_settings.renderZones) {
    drawZones(canvas, layer, style.getPropertyValue("--zone-color"), highlight, highlight_dict);
  }
  if (ibom_settings.renderPads && highlight) {
    for (var footprint of pcbdata.footprints) {
      // draw pads
      var padDrawn = false;
      for (var pad of footprint.pads) {
        if (pad.net in highlight_dict && pad.layers.includes(layer)) {
          drawPad(ctx, pad, highlight_dict[pad.net].pad, false);
          padDrawn = true;
        }
      }
      if (padDrawn) {
        // redraw all pad holes because some pads may overlap
        for (var pad of footprint.pads) {
          drawPadHole(ctx, pad, style.getPropertyValue('--pad-hole-color'));
        }
      }
    }
  }
}

function drawBackground(canvasdict, clear = true) {
  if (clear) {
    clearCanvas(canvasdict.bg);
    clearCanvas(canvasdict.fab);
    clearCanvas(canvasdict.silk);
  }

  drawNets(canvasdict.bg, canvasdict.layer, false);
  drawFootprints(canvasdict.bg, canvasdict.layer, canvasdict.transform.s * canvasdict.transform.zoom, false);

  if (ibom_settings.renderEdgeCuts) {
    drawEdgeCuts(canvasdict.bg, canvasdict.transform.s);
  }

  var style = getComputedStyle(topmostdiv);
  var edgeColor = style.getPropertyValue('--silkscreen-edge-color');
  var polygonColor = style.getPropertyValue('--silkscreen-polygon-color');
  var textColor = style.getPropertyValue('--silkscreen-text-color');
  if (ibom_settings.renderSilkscreen) {
    drawBgLayer(
      "silkscreen", canvasdict.silk, canvasdict.layer,
      canvasdict.transform.s * canvasdict.transform.zoom,
      edgeColor, polygonColor, textColor);
  }
  edgeColor = style.getPropertyValue('--fabrication-edge-color');
  polygonColor = style.getPropertyValue('--fabrication-polygon-color');
  textColor = style.getPropertyValue('--fabrication-text-color');
  if (ibom_settings.renderFabrication) {
    drawBgLayer(
      "fabrication", canvasdict.fab, canvasdict.layer,
      canvasdict.transform.s * canvasdict.transform.zoom,
      edgeColor, polygonColor, textColor);
  }
}

function prepareCanvas(canvas, flip, transform, rotate) {
  var ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  var fontsize = 1.55;
  ctx.scale(transform.zoom, transform.zoom);
  ctx.translate(transform.panx, transform.pany);
  if (flip) {
    ctx.scale(-1, 1);
  }
  ctx.translate(transform.x, transform.y);
  if (rotate) {
    ctx.rotate(deg2rad(ibom_settings.boardRotation));
  }
  ctx.scale(transform.s, transform.s);
}

function prepareLayer(canvasdict) {
  var flip = (canvasdict.layer == "B");
  for (var c of ["bg", "fab", "silk", "highlight"]) {
    if (canvasdict[c]) {
      prepareCanvas(canvasdict[c], flip, canvasdict.transform, canvasdict.layer !== "S");
    }
  }
}

function rotateVector(v, angle) {
  angle = deg2rad(angle);
  return [
    v[0] * Math.cos(angle) - v[1] * Math.sin(angle),
    v[0] * Math.sin(angle) + v[1] * Math.cos(angle)
  ];
}

/** Rotates a bounding box by the board rotation setting */
function applyRotation(bbox) {
  var corners = [
    [bbox.minx, bbox.miny],
    [bbox.minx, bbox.maxy],
    [bbox.maxx, bbox.miny],
    [bbox.maxx, bbox.maxy],
  ];
  corners = corners.map((v) => rotateVector(v, ibom_settings.boardRotation));
  return {
    minx: corners.reduce((a, v) => Math.min(a, v[0]), Infinity),
    miny: corners.reduce((a, v) => Math.min(a, v[1]), Infinity),
    maxx: corners.reduce((a, v) => Math.max(a, v[0]), -Infinity),
    maxy: corners.reduce((a, v) => Math.max(a, v[1]), -Infinity),
  }
}

/**
 * Calculates the scaling and translating factors (transform.s/x/y)
 * so that the layout fills and is centered in the space it has,
 * independent of user zoom and panning (transform.zoom/panx/pany)
 */
function recalcLayerScale(layerdict, width, height, rotate) {
  if (IS_PROJECTOR) {
    layerdict.transform.s = 1;
    layerdict.transform.x = 0;
    layerdict.transform.y = 0;
  } else {
    var bbox;
    if (rotate) {
      bbox = applyRotation(pcbdata.edges_bbox);
    } else {
      bbox = pcbdata.edges_bbox;
    }
    var scalefactor = 0.98 * Math.min(
      width / (bbox.maxx - bbox.minx),
      height / (bbox.maxy - bbox.miny)
    );
    if (scalefactor < 0.1) {
      scalefactor = 1;
    }
    layerdict.transform.s = scalefactor;
    var flip = (layerdict.layer == "B");
    if (flip) {
      layerdict.transform.x = -((bbox.maxx + bbox.minx) * scalefactor + width) * 0.5;
    } else {
      layerdict.transform.x = -((bbox.maxx + bbox.minx) * scalefactor - width) * 0.5;
    }
    layerdict.transform.y = -((bbox.maxy + bbox.miny) * scalefactor - height) * 0.5;
  }
  for (var c of ["bg", "fab", "silk", "highlight"]) {
    canvas = layerdict[c];
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = (width / devicePixelRatio) + "px";
      canvas.style.height = (height / devicePixelRatio) + "px";
    }
  }
}

/** Redraw a specific canvas (if canvas was not resized) */
function redrawCanvas(layerdict) {
  if (layerdict.layer === "S") {
    // schematic
    drawCanvasImg(layerdict, 0, 0);
    drawSchematicHighlights();
  } else {
    // layout (original)
    prepareLayer(layerdict);
    drawBackground(layerdict);
    drawHighlightsOnLayer(layerdict);
  }
}

/** Fully redraw a specific canvas */
function resizeCanvas(layerdict) {
  if (layerdict === undefined) {
    return;
  }
  var canvasdivid = {
    "F": "front-canvas",
    "B": "back-canvas",
    "S": "schematic-canvas"
  }[layerdict.layer];
  var width = document.getElementById(canvasdivid).clientWidth * devicePixelRatio;
  var height = document.getElementById(canvasdivid).clientHeight * devicePixelRatio;
  recalcLayerScale(layerdict, width, height, layerdict.layer !== "S");
  redrawCanvas(layerdict);
}

/** Triggers a full redraw of schematic and layout views */
function resizeAll() {
  resizeCanvas(allcanvas.front);
  resizeCanvas(allcanvas.back);
  resizeCanvas(schematic_canvas);
}

/** Resets zoom and pan to default (fill screen and center) */
function resetTransform(layerdict) {
  if (layerdict.layer === "S") {
    layerdict.transform.zoom = sch_zoom_default;
    var t = layerdict.transform;

    var vw = layerdict.bg.width / (t.zoom * t.s);
    var vh = layerdict.bg.height / (t.zoom * t.s);

    var centerx = schdata.schematics[schid_to_idx[current_schematic]].dimensions.x / 2;
    var centery = schdata.schematics[schid_to_idx[current_schematic]].dimensions.y / 2;

    layerdict.transform.panx = ((vw / 2) - centerx) * t.s - t.x;
    layerdict.transform.pany = ((vh / 2) - centery) * t.s - t.y;
  } else {
    layerdict.transform.panx = 0;
    layerdict.transform.pany = 0;
    layerdict.transform.zoom = 1;
  }
  redrawCanvas(layerdict);
}

/** Triggers redraw of highlights on layout */
function drawHighlights() {
  drawHighlightsOnLayer(allcanvas.front);
  drawHighlightsOnLayer(allcanvas.back);
}
// ----- End of layout render functions ----- //


// ----- Functions for rendering the schematic (DO NOT MODIFY) ----- //
/** Draws an image file (ie. schematic svg) on the canvas background */
function drawCanvasImg(layerdict, x = 0, y = 0, backgroundColor = null) {
  var canvas = layerdict.bg;
  prepareCanvas(canvas, false, layerdict.transform);
  clearCanvas(canvas, backgroundColor);
  canvas.getContext("2d").drawImage(layerdict.img, x, y);
}

/** Draws a rectangle on the given context
 * box: [x1, y1, x2, y2] */
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

/** Returns a box: [x1, y1, x2, y2] around a pin pos */
function pinBoxFromPos(pos) {
  pos = pos.map((p) => parseInt(p));
  return [
    pos[0] - PIN_BBOX_SIZE,
    pos[1] - PIN_BBOX_SIZE,
    pos[0] + PIN_BBOX_SIZE,
    pos[1] + PIN_BBOX_SIZE
  ];
}
// ----- End of schematic render functions ----- //


// ----- Functions for initialization and handling clicks (DO NOT MODIFY) ----- //
function handlePointerDown(e, layerdict) {
  if (e.button != 0 && e.button != 1) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  if (!e.hasOwnProperty("offsetX")) {
    // The polyfill doesn't set this properly
    e.offsetX = e.pageX - e.currentTarget.offsetLeft;
    e.offsetY = e.pageY - e.currentTarget.offsetTop;
  }

  layerdict.pointerStates[e.pointerId] = {
    distanceTravelled: 0,
    lastX: e.offsetX,
    lastY: e.offsetY,
    downTime: Date.now(),
  };
}

function handlePointerLeave(e, layerdict) {
  e.preventDefault();
  e.stopPropagation();

  if (!ibom_settings.redrawOnDrag) {
    redrawCanvas(layerdict);
  }

  delete layerdict.pointerStates[e.pointerId];
}

function handlePointerUp(e, layerdict) {
  if (!e.hasOwnProperty("offsetX")) {
    // The polyfill doesn't set this properly
    e.offsetX = e.pageX - e.currentTarget.offsetLeft;
    e.offsetY = e.pageY - e.currentTarget.offsetTop;
  }

  e.preventDefault();
  e.stopPropagation();

  if (e.button == 2) {
    // Reset pan and zoom on right click.
    resetTransform(layerdict);
    layerdict.anotherPointerTapped = false;
    return;
  }

  // We haven't necessarily had a pointermove event since the interaction started, so make sure we update this now
  var ptr = layerdict.pointerStates[e.pointerId];
  if (ptr === undefined) {
    // This is just here to suppress the console error when you click and drag out of the canvas
    return;
  }
  ptr.distanceTravelled += Math.abs(e.offsetX - ptr.lastX) + Math.abs(e.offsetY - ptr.lastY);

  if (e.button == 0 && ptr.distanceTravelled < 10 && Date.now() - ptr.downTime <= 500) {
    if (Object.keys(layerdict.pointerStates).length == 1) {
      if (layerdict.anotherPointerTapped) {
        // This is the second pointer coming off of a two-finger tap
        resetTransform(layerdict);
      } else {
        // This is just a regular tap
        handleMouseClick(layerdict, e);
      }
      layerdict.anotherPointerTapped = false;
    } else {
      // This is the first finger coming off of what could become a two-finger tap
      layerdict.anotherPointerTapped = true;
    }
  } else {
    if (!ibom_settings.redrawOnDrag) {
      redrawCanvas(layerdict);
    }
    layerdict.anotherPointerTapped = false;
  }

  delete layerdict.pointerStates[e.pointerId];
}

function handlePointerMove(e, layerdict) {
  if (!layerdict.pointerStates.hasOwnProperty(e.pointerId)) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  if (!e.hasOwnProperty("offsetX")) {
    // The polyfill doesn't set this properly
    e.offsetX = e.pageX - e.currentTarget.offsetLeft;
    e.offsetY = e.pageY - e.currentTarget.offsetTop;
  }

  var thisPtr = layerdict.pointerStates[e.pointerId];

  var dx = e.offsetX - thisPtr.lastX;
  var dy = e.offsetY - thisPtr.lastY;

  // If this number is low on pointer up, we count the action as a click
  thisPtr.distanceTravelled += Math.abs(dx) + Math.abs(dy);

  if (Object.keys(layerdict.pointerStates).length == 1) {
    // This is a simple drag
    layerdict.transform.panx += devicePixelRatio * dx / layerdict.transform.zoom;
    layerdict.transform.pany += devicePixelRatio * dy / layerdict.transform.zoom;
  } else if (Object.keys(layerdict.pointerStates).length == 2) {
    var otherPtr = Object.values(layerdict.pointerStates).filter((ptr) => ptr != thisPtr)[0];

    var oldDist = Math.sqrt(Math.pow(thisPtr.lastX - otherPtr.lastX, 2) + Math.pow(thisPtr.lastY - otherPtr.lastY, 2));
    var newDist = Math.sqrt(Math.pow(e.offsetX - otherPtr.lastX, 2) + Math.pow(e.offsetY - otherPtr.lastY, 2));

    var scaleFactor = newDist / oldDist;

    if (scaleFactor != NaN) {
      layerdict.transform.zoom *= scaleFactor;

      var zoomd = (1 - scaleFactor) / layerdict.transform.zoom;
      layerdict.transform.panx += devicePixelRatio * otherPtr.lastX * zoomd;
      layerdict.transform.pany += devicePixelRatio * otherPtr.lastY * zoomd;
    }
  }

  thisPtr.lastX = e.offsetX;
  thisPtr.lastY = e.offsetY;

  if (ibom_settings.redrawOnDrag) {
    redrawCanvas(layerdict);
  }
}

function handleMouseWheel(e, layerdict) {
  e.preventDefault();
  e.stopPropagation();
  var t = layerdict.transform;
  var wheeldelta = e.deltaY;
  if (e.deltaMode == 1) {
    // FF only, scroll by lines
    wheeldelta *= 30;
  } else if (e.deltaMode == 2) {
    wheeldelta *= 300;
  }
  var m = Math.pow(1.1, -wheeldelta / 40);
  // Limit amount of zoom per tick.
  if (m > 2) {
    m = 2;
  } else if (m < 0.5) {
    m = 0.5;
  }
  t.zoom *= m;
  var zoomd = (1 - m) / t.zoom;
  t.panx += devicePixelRatio * e.offsetX * zoomd;
  t.pany += devicePixelRatio * e.offsetY * zoomd;
  redrawCanvas(layerdict);
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

/** Initializes the layout view and populates allcanvas */
function initLayout() {
  allcanvas = {
    front: {
      transform: {
        x: 0,
        y: 0,
        s: 1,
        panx: 0,
        pany: 0,
        zoom: 1,
      },
      pointerStates: {},
      anotherPointerTapped: false,
      bg: document.getElementById("F_bg"),
      fab: document.getElementById("F_fab"),
      silk: document.getElementById("F_slk"),
      highlight: document.getElementById("F_hl"),
      layer: "F",
    },
    back: {
      transform: {
        x: 0,
        y: 0,
        s: 1,
        panx: 0,
        pany: 0,
        zoom: 1,
      },
      pointerStates: {},
      anotherPointerTapped: false,
      bg: document.getElementById("B_bg"),
      fab: document.getElementById("B_fab"),
      silk: document.getElementById("B_slk"),
      highlight: document.getElementById("B_hl"),
      layer: "B",
    }
  };
}

/** Initializes the schematic view and populates schematic_canvas */
function initSchematic() {
  schematic_canvas = {
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

  // Increase the canvas dimensions by the pixel ratio (display size controlled by CSS)
  let ratio = window.devicePixelRatio || 1;
  schematic_canvas.bg.width *= ratio;
  schematic_canvas.bg.height *= ratio;
  schematic_canvas.highlight.width *= ratio;
  schematic_canvas.highlight.height *= ratio;

  schematic_canvas.img.onload = function () {
    redrawCanvas(schematic_canvas);

    // Smoother transition, but screws with auto zoom when switching sheets
    // resetTransform(schematic_canvas);
  };
  switchSchematic(1);
}

/** Initializes the mouse handlers for layout and schematic.
 * Must be run after initLayout() and initSchematic() */
function initMouseHandlers() {
  addMouseHandlers(document.getElementById("front-canvas"), allcanvas.front);
  addMouseHandlers(document.getElementById("back-canvas"), allcanvas.back);
  addMouseHandlers(document.getElementById("schematic-canvas"), schematic_canvas);
}
// ----- End click handling functions ----- //


/**
 * Draw the highlight layer for a layout canvas
 * For now, this is also the place to add extra visual components,
 * such as crosshairs and tooltips (put at the bottom of the function)
 */
 function drawHighlightsOnLayer(canvasdict, clear = true) {
  if (clear) {
    clearCanvas(canvasdict.highlight);
  }

  drawNets(canvasdict.highlight, canvasdict.layer, true);
  drawFootprints(canvasdict.highlight, canvasdict.layer, canvasdict.transform.s * canvasdict.transform.zoom, true);
  drawPins(canvasdict.highlight, canvasdict.layer, true);

  if (draw_crosshair) {
    drawCrosshair(canvasdict);
  }

  drawToolLocations(canvasdict);

  if (IS_PROJECTOR) {
    drawFPS(canvasdict);
    drawCurrentSelection(canvasdict);
    if (multimenu_active !== null && multimenu_active.layer == canvasdict.layer) {
      // drawMultiMenu(canvasdict, multimenu_active.hits)
      drawMultiMenu3(canvasdict, multimenu_active.hits);
    }
  }

}

/**
 * Draw the highlight layer for the schematic canvas
 * For now, this is also the place to add extra visual components,
 * such as corsshairs and tooltips (put at the bottom of the function)
 */
function drawSchematicHighlights() {
  var canvas = schematic_canvas.highlight;
  prepareCanvas(canvas, false, schematic_canvas.transform);
  clearCanvas(canvas);
  var ctx = canvas.getContext("2d");
  if (current_selection.type === "comp") {
    if (compdict[current_selection.val] == undefined) {
      logerr(`highlighted refid ${current_selection.val} not in compdict`);
      return;
    }
    for (var unitnum in compdict[current_selection.val].units) {
      var unit = compdict[current_selection.val].units[unitnum];
      if (unit.schid == current_schematic) {
        var box = unit.bbox.map((b) => parseFloat(b));
        drawSchBox(ctx, box);
      }
    }
  }
  if (current_selection.type === "pin") {
    if (pindict[current_selection.val] == undefined) {
      logerr(`highlighted pinidx ${current_selection.val} not in pindict`);
      return;
    }
    var pin = pindict[current_selection.val];
    if (pin.schid == current_schematic) {
      drawSchBox(ctx, pinBoxFromPos(pin.pos));
    } else {
      logwarn(`current pin ${pin.ref} / ${pin.num} is on schid ${pin.schid},` +
        `but we are on schid ${current_schematic}`);
    }
  }
  if (current_selection.type === "net") {
    for (var pin of pindict) {
      if (pin.schid == current_schematic && pin.net == current_selection.val) {
        drawSchBox(ctx, pinBoxFromPos(pin.pos));
      }
    }
  }
  if (draw_crosshair) {
    console.log("draw sch x")
    drawCrosshair(schematic_canvas);
  }
}


function crosshairOnBox(layerdict, box, color=null) {
  var canvas = layerdict.highlight;
  var style = getComputedStyle(topmostdiv);
  var ctx = canvas.getContext("2d");
  var line_width;
  var stroke_style;
  if (layerdict.layer === "S") {
    stroke_style = style.getPropertyValue("--schematic-crosshair-line-color");
    line_width = style.getPropertyValue("--schematic-crosshair-line-width");
  } else {
    stroke_style = style.getPropertyValue("--pcb-crosshair-line-color");
    line_width = style.getPropertyValue("--pcb-crosshair-line-width");
  }
  if (color !== null) {
    stroke_style = color;
  }
  // scale line_width based on effective zoom
  line_width /= layerdict.transform.s * layerdict.transform.zoom;

  ctx.strokeStyle = stroke_style;
  ctx.lineWidth = line_width;
  ctx.beginPath();
  ctx.moveTo((box[0] + box[2]) / 2, -CROSSHAIR_LENGTH);
  ctx.lineTo((box[0] + box[2]) / 2, box[1]);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo((box[0] + box[2]) / 2, box[3]);
  ctx.lineTo((box[0] + box[2]) / 2, CROSSHAIR_LENGTH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-CROSSHAIR_LENGTH, (box[1] + box[3]) / 2);
  ctx.lineTo(box[0], (box[1] + box[3]) / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(box[2], (box[1] + box[3]) / 2);
  ctx.lineTo(CROSSHAIR_LENGTH, (box[1] + box[3]) / 2);
  ctx.stroke();
}

function drawCrosshair(layerdict) {
  var box = target_boxes[layerdict.layer];
  if (box === null || box.length === 0) {
    return;
  }

  crosshairOnBox(layerdict, bboxListSort(box));
}

var r = 30;
var t = 15;
var l = 2;

function circleAtPoint(layerdict, coords, color, radius) {
  var s = 1 / (layerdict.transform.s * layerdict.transform.zoom);
  s = 1 / layerdict.transform.zoom;

  var canvas = layerdict.highlight;
  var style = getComputedStyle(topmostdiv);
  var ctx = canvas.getContext("2d");

  ctx.fillStyle = color;
  ctx.strokeStyle = "black";
  ctx.lineWidth = l * s;
  ctx.beginPath();
  ctx.arc(coords.x, coords.y, radius * s, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function crosshairAtPoint(layerdict, coords, color) {
  box = [coords.x, coords.y, coords.x, coords.y];
  crosshairOnBox(layerdict, box, color);
}

function drawToolLocations(layerdict) {
  var radius = IS_PROJECTOR ? 6 : 1;
  for (let probe_name in probes) {
    let probe_info = probes[probe_name];
    if (probe_info.location !== null) {
      circleAtPoint(layerdict, probe_info.location, probe_info.color.loc, radius);
    }
  }
}

function toolIconAtPoint(layerdict, coords, color) {
  var s = 1 / (layerdict.transform.s * layerdict.transform.zoom);

  var canvas = layerdict.highlight;
  var style = getComputedStyle(topmostdiv);
  var ctx = canvas.getContext("2d");

  var flip = layerdict.layer === "B" ? -1 : 1;

  ctx.fillStyle = color;
  ctx.strokeStyle = "black";
  ctx.lineWidth = l * s;
  ctx.beginPath();
  ctx.arc(coords.x + r * s * flip, coords.y - r * s, r * s, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
  ctx.lineTo(coords.x, coords.y - t * s);
  ctx.lineTo(coords.x + t * s * flip, coords.y);
  ctx.fill();
}

function boxFromPoint(coords, size=1) {
  return [coords.x - size / 2, coords.y - size / 2, coords.x + size / 2, coords.y + size / 2];
}


const times = [];
let fps;

function refreshLoop() {
  window.requestAnimationFrame(() => {
    const now = performance.now();
    while (times.length > 0 && times[0] <= now - 1000) {
      times.shift();
    }
    times.push(now);
    fps = times.length;
    refreshLoop();
  });
}
refreshLoop();

function drawFPS(layerdict) {
  if (!IS_PROJECTOR) {
    return;
  }
  var canvas = layerdict.highlight;
  var ctx = canvas.getContext("2d");
  var fontsize = 40;
  var padding = 20;
  ctx.font = `${fontsize / transform.z}px sans-serif`;
  ctx.fillStyle = "black";
  ctx.beginPath();
  var cornerpt = undoProjectorTransform(padding, padding);
  ctx.rect(cornerpt.x, cornerpt.y, fontsize * 4 / transform.z, fontsize * 1.5 / transform.z);
  ctx.fill();
  ctx.fillStyle = "white";
  var textpt = undoProjectorTransform(padding, padding + fontsize)
  ctx.fillText(`FPS: ${fps}`, textpt.x, textpt.y);
}

var fps_interval = window.setInterval(() => {
  if (IS_PROJECTOR) {
    drawFPS(allcanvas.front);
  } else {
    // console.log(fps);
  }
}, 500)

function drawCurrentSelection(canvasdict) {
  var style = getComputedStyle(topmostdiv);
  var ctx = canvasdict.highlight.getContext("2d");

  var fontsize = 40;
  var origin = {"x": 20, "y": 120}

  ctx.fillStyle = style.getPropertyValue('--pad-color-highlight');
  ctx.font = `${fontsize / transform.z}px sans-serif`;

  var textpt = undoProjectorTransform(origin.x, origin.y)
  ctx.fillText(`Current Selection: ${getElementName(current_selection)}`, textpt.x, textpt.y);
  if (active_session_is_recording) {
    textpt = undoProjectorTransform(origin.x, origin.y + fontsize * 1.25);
    ctx.fillText(`Pos Probe: ${getElementName(probes.pos.selection)}`, textpt.x, textpt.y);
    textpt = undoProjectorTransform(origin.x, origin.y + fontsize * 1.25 * 2);
    ctx.fillText(`Neg Probe: ${getElementName(probes.neg.selection)}`, textpt.x, textpt.y);
  }
}

function drawMultiMenu(canvasdict, hits) {
  if (hits.length > 4) {
    console.log("Error: too many hits")
    return;
  }
  var canvas = canvasdict.highlight;
  var style = getComputedStyle(topmostdiv);
  var ctx = canvas.getContext("2d");

  var flip = canvasdict.layer === "B" ? -1 : 1;

  var centerpoint = [50, 100]
  var offset_len = 25
  var offset_deltas = [[-offset_len, 0], [0, -offset_len], [offset_len, 0], [0, offset_len]]

  ctx.fillStyle = style.getPropertyValue('--pad-color-highlight');
  ctx.strokeStyle = style.getPropertyValue('--pad-color-highlight');
  ctx.font = "4px sans-serif";

  for (let i in hits) {
    let hit = hits[i];
    let text = getElementName(hit);
    ctx.fillText(text, centerpoint[0] + offset_deltas[i][0], centerpoint[1] + offset_deltas[i][1], 50)
  }
}

var testmm = {
  "hits": [
    {"type": "pin", "val": 15},
    {"type": "pin", "val": 20},
    {"type": "pin", "val": 165},
    {"type": "net", "val": "GND"}
  ],
  "layer": "F"
}

function drawMultiMenu3(canvasdict, hits) {
  var style = getComputedStyle(topmostdiv);
  var canvas = canvasdict.highlight;
  var ctx = canvas.getContext("2d");

  var fontsize = 40;
  var row_padding = 10;

  var anchor = {"x": 1000, "y": 20}
  var row_width = 300;

  // ceil not floor so that if we have an odd number, the top has more
  var midpoint = Math.ceil(hits.length / 2);

  var origin = {
    "x": anchor.x + row_width / 2,
    "y": anchor.y + (fontsize + row_padding) * (midpoint + 0.5)
  }

  ctx.fillStyle = style.getPropertyValue('--pad-color-highlight');
  ctx.strokeStyle = style.getPropertyValue('--pad-color-highlight');
  ctx.lineWidth = 1 / transform.z;
  ctx.font = `${fontsize / transform.z}px sans-serif`;

  let point = {"x": anchor.x, "y": anchor.y};
  drawHLine(ctx, point, row_width, undoProjectorTransform);
  for (let i = 0; i < hits.length; i++) {
    if (i == midpoint) {
      // If we're at the midpoint of the list, move us down one extra row
      point.y += fontsize + row_padding;
      drawHLine(ctx, point, row_width, undoProjectorTransform);
    }
    point.y += fontsize;
    let tpoint = undoProjectorTransform(point.x + row_padding, point.y);
    ctx.fillText(getElementName(hits[i]), tpoint.x, tpoint.y, row_width - row_padding)
    point.y += row_padding;
    drawHLine(ctx, point, row_width, undoProjectorTransform);
  }

  var endpos = {
    "x": origin.x,
    "y": origin.y + (fontsize + row_padding) * probe_end_delta
  }
  circleAtPoint(canvasdict, undoProjectorTransform(endpos.x, endpos.y), "blue", 10);
}

function drawHLine(ctx, point, len, transform_fn=null) {
  var end = {"x": point.x + len, "y": point.y}
  if (transform_fn !== null) {
    point = transform_fn(point.x, point.y);
    end = transform_fn(end.x, end.y);
  }
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function undoProjectorTransform(x, y) {
  if (!IS_PROJECTOR) {
    logerr("Called undoProjectorTransform() from main page");
    return;
  }
  return {"x": x / transform.z - transform.tx, "y": y / transform.z - transform.ty}
}

