import numpy as np
from shapely.geometry import Point

from boardgeometry.geometry import get_pad_polygon

def deg2rad(deg):
    return deg * np.pi / 180.

def rotate_vec(v, angle_deg):
    angle_rad = deg2rad(angle_deg)
    return (v[0] * np.cos(angle_rad) - v[1] * np.sin(angle_rad),
            v[0] * np.sin(angle_rad) + v[1] * np.cos(angle_rad))

def point_in_footprint(x, y, footprint):
    bbox = footprint["bbox"]
    v = (x - bbox["pos"][0], y - bbox["pos"][1])
    v = rotate_vec(v, bbox["angle"])
    return bbox["relpos"][0] <= v[0] and v[0] <= bbox["relpos"][0] + bbox["size"][0] and \
        bbox["relpos"][1] <= v[1] and v[1] <= bbox["relpos"][1] + bbox["size"][1]

def point_in_pad(x, y, pad):
    v = [x - pad["pos"][0], y - pad["pos"][1]]
    # TODO figure out why in js this is neg but footprint angle is pos
    v = rotate_vec(v, -pad["angle"])
    if "offset" in pad:
        v = (v[0] - pad["offset"][0], v[1] - pad["offset"][1])
    return Point(*v).within(get_pad_polygon(pad))

# from ibom, don't know what exactly it does
def point_within_dist_to_arc(x, y, xc, yc, radius, start_deg, end_deg, d):
    dx = x - xc
    dy = y - yc
    r_sq = dx * dx + dy * dy
    rmin = max(0, radius - d)
    rmax = radius + d

    if r_sq < rmin * rmin or r_sq > rmax * rmax:
        return False
    
    angle1 = deg2rad(start_deg) % (2 * np.pi)
    dx1 = xc + radius * np.cos(angle1) - x
    dy1 = yc + radius * np.sin(angle1) - y
    if dx1 * dx1 + dy1 * dy1 <= d * d:
        return True

    angle2 = deg2rad(end_deg) % (2 * np.pi)
    dx2 = xc + radius * np.cos(angle2) - x
    dy2 = yc + radius * np.sin(angle2) - y
    if dx2 * dx2 + dy2 * dy2 <= d * d:
        return True

    angle = np.arctan2(dy, dx) % (2 * np.pi)
    if angle1 > angle2:
        return angle >= angle2 or angle <= angle1
    else:
        return angle >= angle1 and angle <= angle2

# from ibom, don't know what exactly it does
def point_within_dist_to_seg(x, y, x1, y1, x2, y2, d):
    a = x - x1
    b = y - y1
    c = x2 - x1
    d = y2 - y1

    dot = a * c + b * d
    len_sq = c * c + d * d
    if len_sq == 0:
        dx = x - x1
        dy = y - y1
    else:
        param = dot / len_sq
        if param < 0:
            xx = x1
            yy = y1
        elif param > 1:
            xx = x2
            yy = y2
        else:
            xx = x1 + param * c
            yy = y1 + param * d
        dx = x - xx
        dy = y - yy
    return dx * dx + dy * dy <= d * d

def bbox_hitscan(x, y, pcbdata, layer=None):
    result = []
    for i, footprint in enumerate(pcbdata["footprints"]):
        if (not layer or layer == footprint["layer"]) \
                and point_in_footprint(x, y, footprint):
            result.append(i)
    return result

def pin_hitscan(x, y, pcbdata, pinref_to_idx, layer=None, renderPads=True):
    if not renderPads:
        return []
    result = []
    for footprint in pcbdata["footprints"]:
        for pad in footprint["pads"]:
            if (not layer or layer in pad["layers"]) \
                    and point_in_pad(x, y, pad):
                pin_name = f"{footprint['ref']}.{pad['padname']}"
                if pin_name in pinref_to_idx:
                    result.append(pinref_to_idx[pin_name])
    return result

def net_hitscan(x, y, pcbdata, layer=None, renderPads=True, renderTracks=False):
    nets_hit = set()
    if "tracks" in pcbdata and layer and renderTracks:
        # do this
        for track in pcbdata["tracks"][layer]:
            if "radius" in track and point_within_dist_to_arc():
                nets_hit.add(track["net"])
            elif point_within_dist_to_seg():
                nets_hit.add(track["net"])
    if renderPads:
        # do this
        for footprint in pcbdata["footprints"]:
            for pad in footprint["pads"]:
                if (not layer or layer in pad["layers"]) \
                        and point_in_pad(x, y, pad) and "net" in pad:
                    nets_hit.add(pad["net"])

    return list(nets_hit)

def hitscan(x, y, pcbdata, pinref_to_idx, layer=None, renderPads=True, renderTracks=False):
    hits = [{"type": "comp", "val": hit} for hit in bbox_hitscan(x, y, pcbdata, layer)]
    hits += [{"type": "pin", "val": hit} for hit in pin_hitscan(x, y, pcbdata, pinref_to_idx, layer, renderPads)]
    hits += [{"type": "net", "val": hit} for hit in net_hitscan(x, y, pcbdata, layer, renderPads, renderTracks)]
    return hits
