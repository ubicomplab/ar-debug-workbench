import numpy as np
from shapely.geometry import Point, Polygon, box


def get_pad_polygon(pad, logging=None, cache=True):
    # TODO ibom caches this, but probably unnecessary
    if cache and "poly" in pad:
        return pad["poly"]

    if pad["shape"] == "rect":
        poly = get_rect(pad["size"])
    elif pad["shape"] == "oval":
        poly = get_oblong(pad["size"])
    elif pad["shape"] == "circle":
        poly = get_circle(pad["size"][0] / 2)
    elif pad["shape"] == "roundrect":
        poly = get_chamfered_rect(pad["size"], pad["radius"])
    elif pad["shape"] == "chamfrect":
        poly = get_chamfered_rect(
            pad["size"], pad["radius"], pad["chamfpos"], pad["chamfratio"])
    else:  # "custom"
        if logging:
            logging.error("Custom pads currently not supported")
        #poly = get_poly(pad)

    if cache:
        pad["poly"] = poly
    return poly


def get_rect(size):
    return box(-size[0] / 2, -size[1] / 2, size[0] / 2, size[1] / 2)

def get_oblong(size):
    return get_chamfered_rect(size, min(*size) / 2)

def get_circle(radius):
    return Point(0, 0).buffer(radius)

# approximates a given arc with <precision> number of points
def get_arc(x, y, radius, start_deg, end_deg, precision=50):
    theta = np.radians(np.linspace(start_deg, end_deg, precision))
    xs = x + radius * np.cos(theta)
    ys = y + radius * np.sin(theta)
    return np.column_stack([xs, ys])

# handles chamfered and rounded rectangles
# largely derived from ibom code
def get_chamfered_rect(size, radius, chamfpos=0, chamfratio=0):
    # from ibom: chamfpos is a bitmask, left = 1, right = 2, bottom left = 4, bottom right = 8
    # recall that ibom is in render reference frame, ie. bottom is pos y
    width = size[0]
    height = size[1]
    x = -width / 2
    y = -height / 2
    offset = min(width, height) * chamfratio

    points = np.array([(x, 0)])
    if chamfpos & 4:
        points = np.append(points, [(x, y + height - offset), (x + offset, y + height),
                                    (0, y + height)], axis=0)
    else:
        points = np.append(points, get_arc(
            x + radius, y + radius, radius, 180, 90), axis=0)

    if chamfpos & 8:
        points = np.append(
            points, [(x + width, y + offset), (x + width - offset, y)], (0, y), axis=0)
    else:
        points = np.append(points, get_arc(
            x + width - radius, y + height - radius, radius, 90, 0), axis=0)

    if chamfpos & 2:
        points = np.append(points,
                           [(x + width, y + offset),
                            (x + width - offset, y),
                               (0, y)], axis=0)
    else:
        points = np.append(points, get_arc(
            x + width - radius, y + radius, radius, 0, -90), axis=0)

    if chamfpos & 1:
        points = np.append(points,
                           [(x + offset, y),
                            (x, y + offset),
                               (x, 0)], axis=0)
    else:
        points = np.append(points, get_arc(
            x + radius, y + height - radius, radius, -90, -180), axis=0)

    return Polygon(points)

def get_poly(pad):
    raise NotImplementedError
