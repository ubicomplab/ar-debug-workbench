from sympy import Point, Circle, Polygon

# DEPRECATED

def get_pad_polygon(pad):
    # TODO ibom caches this, but probably unnecessary
    if pad["shape"] == "rect":
        poly = get_rect(pad["size"])
    elif pad["shape"] == "oval":
        poly = get_oblong(pad["size"])
    elif pad["shape"] == "circle":
        poly = get_circle(pad["size"][0] / 2)
    elif pad["shape"] == "roundrect":
        poly = get_chamfered_rect(pad["size"], pad["radius"], 0, 0)
    elif pad["shape"] == "chamfrect":
        poly = get_chamfered_rect(pad["size"], pad["radius"], pad["chamfpos"], pad["chamfratio"])
    else: # "custom"
        poly = get_poly(pad)
    return poly

def get_rect(size):
    return Polygon(Point(-size[0] / 2, -size[1] / 2),
        Point(-size[0] / 2, size[1] / 2),
        Point(size[0] / 2, size[1] / 2),
        Point(size[0] / 2, -size[1] / 2))

def get_oblong(size):
    return get_chamfered_rect(size, min(*size) / 2, 0, 0)

def get_circle(radius):
    return Circle(Point(0, 0), radius)

def get_chamfered_rect(size, radius, chamfpos, chamfratio):
    # from ibom: chamfpos is a bitmask, left = 1, right = 2, bottom left = 4, bottom right = 8
    return


class ChamferedRect:
    def __init__(self, size, radius, chamfpos, chamfratio):
        self.rect = get_rect(size)