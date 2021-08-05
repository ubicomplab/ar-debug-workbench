# Reads in a .sch and a cache.lib file from EEschema and writes
# components and their bounding boxes to a .json file

import os
import sys
from .sexpdata import Symbol, loads, car, cdr


class LibraryComponent:
    def __init__(self, name, units):
        # Symbol name in cache.lib
        self.name = name

        # list of (bbox, pinlist) = ((x1, y1, x2, y2), [SchPin])
        self.units = units

    # applies a rotation matrix r = (a, b, c, d) to a point p = (x, y)
    def calcRotate(self, p, r):
        return (p[0] * r[0] + p[1] * r[1], p[0] * r[2] + p[1] * r[3])

    # calculates the bounding box of an actual component given its position
    # and its rotation matrix r = (a, b, c, d)
    def calcBbox(self, unit, x, y, r):
        bbox = self.units[unit - 1][0]

        minX = bbox[0]
        minY = bbox[1]
        maxX = bbox[2]
        maxY = bbox[3]

        # Apply the rotation matrix to .sch coordinates
        minPoint = self.calcRotate((minX, minY), r)
        maxPoint = self.calcRotate((maxX, maxY), r)

        # Apply to given coordinate position
        return (x + minPoint[0], y + minPoint[1], x + maxPoint[0], y + maxPoint[1])

    # calculates the pin list positions for an actual component given
    # position and rotation matrix r = (a, b, c, d)
    def calcPins(self, unit, x, y, r):
        newlist = list()
        for pin in self.units[unit - 1][1]:
            name = pin.name
            num = pin.num

            pinPos = self.calcRotate((pin.pos[0], pin.pos[1]), r)
            pinEnd = self.calcRotate((pin.end[0], pin.end[1]), r)

            pos = (x + pinPos[0], y + pinPos[1])
            end = (x + pinEnd[0], y + pinEnd[1])

            newlist.append(SchPin(name, num, pos, end))

        return newlist
#  class LibraryComponent

class SchWire:
    def __init__(self, startx, starty, endx, endy, type):
        # starting coordinates
        self.start = (startx, starty)
        self.end = (endx, endy)

        # type ("Wire", "Bus", "Notes", "Entry")
        self.type = type

    def toJsonString(self, offset=""):
        return (
            '{o}{{\n'
            '{o}  "type": "{type}",\n'
            '{o}  "start": {{\n'
            '{o}    "x": {start[0]},\n'
            '{o}    "y": {start[1]}\n'
            '{o}  }},\n'
            '{o}  "end": {{\n'
            '{o}    "x": {end[0]},\n'
            '{o}    "y": {end[1]}\n'
            '{o}  }}\n'
            '{o}}}'
        ).format(o=offset, type=self.type, start=self.start, end=self.end)
#  class SchWire

class SchConnection:
    def __init__(self, x, y):
        # position of junction
        self.pos = (x, y)

    def toJsonString(self, offset=""):
        return (
            '{o}{{\n'
            '{o}  "pos": {{\n'
            '{o}    "x": {pos[0]},\n'
            '{o}    "y": {pos[1]}\n'
            '{o}  }}\n'
            '{o}}}'
        ).format(o=offset, pos=self.pos)
#  class SchConnection

class SchPin:
    def __init__(self, name, num, pos, end):
        # pin name, eg. GND
        self.name = name

        # pin num, eg. 2 or +
        self.num = num

        # (x, y) position
        self.pos = pos

        # (x, y) endpoint
        self.end = end
#  class SchPin

class SchComponent:
    def __init__(self, ref, libcomp, unit, bbox, pins):
        # Component reference, eg. C8
        self.ref = ref

        # Symbol name in cache.lib, eg. arduino_Uno_Rev3-02-TH-eagle-import:C-EU0603-RND
        self.libcomp = libcomp

        # Unit number (starts at 1)
        self.unit = unit

        """
        # (x,y) position, eg. (3100, 7200)
        self.pos = pos

        # (a, b, c, d) rotation matrix, eg. (0, 1, -1, 0)
        self.rot = rot
        """

        # (x1, y1, x2, y2) bounding box, eg. (3020, 7100, 3180, 7400)
        self.bbox = bbox

        # list of Pins
        self.pins = pins

    def toJsonString(self, offset=''):
        pinString = offset + '  "pins": [\n'
        strlist = list()
        for pin in self.pins:
            strlist.append((
                '{o}    {{\n'
                '{o}      "name": "{pin.name}",\n'
                '{o}      "num": "{pin.num}",\n'
                '{o}      "pos": ["{pin.pos[0]}","{pin.pos[1]}"],\n'
                '{o}      "end": ["{pin.end[0]}","{pin.end[1]}"]\n'
                '{o}    }}'
            ).format(o=offset, pin=pin))

        pinString = (
            '{o}  "pins": [\n'
            '{pindata}\n'
            '{o}  ]'
        ).format(o=offset, pindata=",\n".join(strlist))

        return ('{o}{{\n'
                '{o}  "ref": "{ref}",\n'
                '{o}  "libcomp": "{libcomp}",\n'
                '{o}  "unit": "{unit}",\n'
                '{o}  "bbox": [\n'
                '{o}    "{bbox[0]}",\n'
                '{o}    "{bbox[1]}",\n'
                '{o}    "{bbox[2]}",\n'
                '{o}    "{bbox[3]}"\n'
                '{o}  ],\n'
                '{pinstr}\n'
                '{o}}}').format(o=offset, ref=self.ref, libcomp=self.libcomp,
                                unit=self.unit, bbox=self.bbox, pinstr=pinString)
#  class SchComponent

class Schematic:
    def __init__(self, name, dim, pos, components=[], wires=[], connections=[]):
        self.name = name
        self.dim = dim
        self.pos = pos
        self.components = components
        self.wires = wires
        self.connections = connections

    def toJsonString(self, offset=""):
        outputname = self.name.replace("\\", "\\\\")
        out = (
            '{o}{{\n'
            '{o}  "name": "{name}",\n'
            '{o}  "dimensions": {{\n'
            '{o}    "x": {dim[0]},\n'
            '{o}    "y": {dim[1]}\n'
            '{o}  }},\n'
            '{o}  "orderpos": {{\n'
            '{o}    "sheet": {pos[0]},\n'
            '{o}    "total": {pos[1]}\n'
            '{o}  }}'
        ).format(o=offset, name=outputname, dim=self.dim, pos=self.pos)

        if len(self.components) > 0:
            out += ',\n{o}  "components": [\n'.format(o=offset)
            strlist = []
            for comp in self.components:
                strlist.append(comp.toJsonString(offset=(offset + "  ")))
            out += ',\n'.join(strlist)
            out += '\n{o}  ]'.format(o=offset)

        if len(self.wires) > 0:
            out += ',\n{o}  "wires": [\n'.format(o=offset)
            strlist = []
            for wire in self.wires:
                strlist.append(wire.toJsonString(offset=(offset + "  ")))
            out += ',\n'.join(strlist)
            out += '\n{o}  ]'.format(o=offset)

        if len(self.connections) > 0:
            out += ',\n{o}  "connections": [\n'.format(o=offset)
            strlist = []
            for conn in self.connections:
                strlist.append(conn.toJsonString(offset=(offset + "  ")))
            out += ',\n'.join(strlist)
            out += '\n{o}  ]'.format(o=offset)

        out += '\n{o}}}'.format(o=offset)
        return out
#  class Schematic

class NetInfo:
    def __init__(self, code, name, pins):
        self.code = code
        self.name = name
        self.pins = pins

    def toJsonString(self, offset=""):
        outputname = self.name.replace("\\", "\\\\")
        out = (
            '{o}{{\n'
            '{o}  "code": "{code}",\n'
            '{o}  "name": "{name}",\n'
            '{o}  "pins": [\n'
        ).format(o=offset, code=self.code, name=outputname)

        strlist = []
        for pin in self.pins:
            strlist.append((
                '{o}    {{\n'
                '{o}      "ref": "{pin[0]}",\n'
                '{o}      "pin": "{pin[1]}"\n'
                '{o}    }}'
            ).format(o=offset, pin=pin))
        out += ',\n'.join(strlist)
        out += '\n{o}  ]\n'.format(o=offset)

        out += '{o}}}'.format(o=offset)

        return out
#  class NetInfo

"""
Given two tuples (minX, minY, maxX, maxY), finds combined
"""
def minmax(t1, t2):
    return (
        min(t1[0], t2[0]),
        min(t1[1], t2[1]),
        max(t1[2], t2[2]),
        max(t1[3], t2[3])
    )

"""
Parses a 'DRAW' in a lib file into an array of units,
each with a bounding box and pin list
"""
def parseDraw(libfile, name, unit_count):
    # list of (minX, minY, maxX, maxY), for index = (unit # - 1)
    unit_boxes = [(1000, 1000, -1000, -1000)] * unit_count

    # list of [SchPin], for index = (unit # - 1)
    unit_pins = []
    for _ in range(unit_count):
        unit_pins.append([])

    # Fast forward to next DRAW
    line = libfile.readline()
    while line:
        if line.startswith("DRAW"):
            break
        else:
            line = libfile.readline()

    # Get the first data line
    line = libfile.readline()

    while not line.startswith("ENDDRAW"):
        tokens = line.split()
        if tokens[0] == "A" or tokens[0] == "C":
            # arc
            x = int(tokens[1])
            y = int(tokens[2])
            r = int(tokens[3])
            if tokens[0] == "A":
                u = int(tokens[6])
            else:
                u = int(tokens[4])

            coordrange = (x - r, y - r, x + r, y + r)

            if u == 0:
                # apply to all
                for i in range(unit_count):
                    unit_boxes[i] = minmax(unit_boxes[i], coordrange)
            else:
                unit_boxes[u - 1] = minmax(unit_boxes[u - 1], coordrange)
        elif tokens[0] == "X":
            # pin
            u = int(tokens[9])

            # Get data needed for bbox
            x = int(tokens[3])
            y = int(tokens[4])

            coordrange = (x, y, x, y)

            # Get remaining data for pin list
            pname = tokens[1]
            pnum = tokens[2]
            plen = int(tokens[5])
            orientation = tokens[6]

            # Recall that in .lib files, y increases up and x increases right
            if (orientation == "U"):
                end = (x, y + plen)
            elif (orientation == "D"):
                end = (x, y - plen)
            elif (orientation == "L"):
                end = (x - plen, y)
            else:  # "R"
                end = (x + plen, y)

            if u == 0:
                # apply to all
                for i in range(unit_count):
                    unit_boxes[i] = minmax(unit_boxes[i], coordrange)
                    unit_pins[i].append(SchPin(pname, pnum, (x, y), end))
            else:
                unit_boxes[u - 1] = minmax(unit_boxes[u - 1], coordrange)
                unit_pins[u - 1].append(SchPin(pname, pnum, (x, y), end))
        elif tokens[0] == "S":
            # rect
            x1 = int(tokens[1])
            y1 = int(tokens[2])
            x2 = int(tokens[3])
            y2 = int(tokens[4])
            u = int(tokens[5])

            coordrange = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))

            if u == 0:
                # apply to all
                for i in range(unit_count):
                    unit_boxes[i] = minmax(unit_boxes[i], coordrange)
            else:
                unit_boxes[u - 1] = minmax(unit_boxes[u - 1], coordrange)
        elif tokens[0] == "P":
            # polygon
            # ignoring "B" bezier curve for now, because there's no documentation
            u = int(tokens[2])
            n = int(tokens[1])
            for i in range(0, n):
                x = int(tokens[2 * i + 5])
                y = int(tokens[2 * i + 6])
                coordrange = (x, y, x, y)
                if u == 0:
                    # apply to all
                    for i in range(unit_count):
                        unit_boxes[i] = minmax(unit_boxes[i], coordrange)
                else:
                    unit_boxes[u - 1] = minmax(unit_boxes[u - 1], coordrange)

        line = libfile.readline()

    units = [(unit_boxes[i], unit_pins[i]) for i in range(unit_count)]
    return LibraryComponent(name, units)
#  parseDraw()

"""
DEPRECATED
Parses a 'DRAW' in a lib file into a bounding box and pins
"""
def parseDraw_DEPRECATED(libfile, name):
    # values for bbox
    minX = 1000
    minY = 1000
    maxX = -1000
    maxY = -1000

    # values for pins
    pins = list()

    # Fast forward to next DRAW
    line = libfile.readline()
    while line:
        if line.startswith("DRAW"):
            break
        else:
            line = libfile.readline()

    # Get the first data line
    line = libfile.readline()

    while not line.startswith("ENDDRAW"):
        tokens = line.split()
        if tokens[0] == "A" or tokens[0] == "C":
            # arc or circle
            x = int(tokens[1])
            y = int(tokens[2])
            r = int(tokens[3])

            minX = min(minX, x - r)
            minY = min(minY, y - r)
            maxX = max(maxX, x + r)
            maxY = max(maxY, y + r)
        elif tokens[0] == "X":
            # pin

            # Get data needed for bbox
            x = int(tokens[3])
            y = int(tokens[4])
            minX = min(minX, x)
            minY = min(minY, y)
            maxX = max(maxX, x)
            maxY = max(maxY, y)

            # Get remaining data for pin list
            pname = tokens[1]
            pnum = tokens[2]
            plen = int(tokens[5])
            orientation = tokens[6]

            # Recall that in .lib files, y increases up and x increases right
            if (orientation == "U"):
                end = (x, y + plen)
            elif (orientation == "D"):
                end = (x, y - plen)
            elif (orientation == "L"):
                end = (x - plen, y)
            else:  # "R"
                end = (x + plen, y)

            pins.append(SchPin(pname, pnum, (x, y), end))
        elif tokens[0] == "S":
            # rect
            x1 = int(tokens[1])
            y1 = int(tokens[2])
            x2 = int(tokens[3])
            y2 = int(tokens[4])

            minX = min(minX, x1)
            minY = min(minY, y1)
            maxX = max(maxX, x2)
            maxY = max(maxY, y2)
        elif tokens[0] == "P" or tokens[0] == "B":
            # polygon or bezier curve
            n = int(tokens[1])
            for i in range(0, n):
                x = int(tokens[2 * i + 5])
                y = int(tokens[2 * i + 6])
                minX = min(minX, x)
                minY = min(minY, y)
                maxX = max(maxX, x)
                maxY = max(maxY, y)

        line = libfile.readline()

    return LibraryComponent(name, (minX, minY, maxX, maxY), pins)
#  parseDraw_DEPRECATED()

"""
Input: libfile -- file with Eeschema schematic library file format
       libname -- string with name of library (append to front of component names)
Output: dictionary of refname: LibComponent
"""
def readLibFile(libfile, libname):
    libDict = {}

    line = libfile.readline()

    if not line.startswith("EESchema-LIBRARY"):
        # Unexpected file format
        return None

    while line:
        if line.startswith("DEF"):
            tokens = line.split()
            name = tokens[1]
            unit_count = int(tokens[7])
            if libname:
                name = libname + "_" + name
            libDict[name] = parseDraw(libfile, name, unit_count)

        line = libfile.readline()

    return libDict
#  readLibFile()

"""
Checks that the schematic file format is as expected,
then returns the dimensions of the schematic (width, height)
and its position in the schematic order (self, total)
"""
def readHeader(schfile):
    line = schfile.readline()

    if not line.startswith("EESchema Schematic File"):
        # Unexpected file format
        return None

    while line:
        if line.startswith("$Descr"):
            tokens = line.split()
            dim = (int(tokens[2]), int(tokens[3]))
            line = schfile.readline()
        elif line.startswith("Sheet"):
            tokens = line.split()
            pos = (int(tokens[1]), int(tokens[2]))
            return dim, pos
        else:
            line = schfile.readline()

    # Never found a $Descr or a Sheet
    return None, None
#  readHeader()

"""
Parses the current component in a schematic file
Expects the file pointer to have just read the "$Comp" line
"""
def parseComponent(schfile, compDict):
    # We've already read the "$Comp" line
    lineL = schfile.readline().split()
    lineU = schfile.readline().split()

    line = schfile.readline()  # update this now so that we can use it later
    lineP = line.split()

    if lineL[0] != "L" or lineU[0] != "U" or lineP[0] != "P":
        # Unexpected file format
        print("Error: Invalid component in schematic file")
        return None

    # for some reason, ':' is used in .sch and '_' is used in .lib
    libcomp = lineL[1].replace(":", "_")

    unit = int(lineU[1])

    if libcomp not in compDict:
        print("Component {} missing from libraries".format(libcomp))
        compDict[libcomp] = LibraryComponent("COULD NOT FIND {}".format(libcomp), [(0, 0, 0, 0), []])
    
    cacheComp = compDict[libcomp]

    pos = (int(lineP[1]), int(lineP[2]))

    # Skip field lines and redundant position line
    while line:
        if line.startswith("\t"):
            break
        else:
            line = schfile.readline()

    # Get rotation info
    rotline = schfile.readline().split()
    # Note: the spec guarantees that these values are either -1, 0, or 1
    rot = (int(rotline[0]), int(rotline[1]), int(rotline[2]), int(rotline[3]))
    
    bbox = cacheComp.calcBbox(unit, pos[0], pos[1], rot)
    pins = cacheComp.calcPins(unit, pos[0], pos[1], rot)

    # Fast forward to the end of the component
    while line:
        if line.startswith("$EndComp"):
            break
        else:
            line = schfile.readline()

    return SchComponent(lineL[2], libcomp, unit, bbox, pins)
#  parseComponent()

"""
Parses all components, wires, and connections in a schematic file into
3 corresponding lists of Sch_ elements
Input: schfile -- sch file pointing to start of an item (ie. at header)
       componentDict -- dict of library components
Output: lists of components, wires, and connections in schfile
"""
def buildLists(schfile, componentDict):
    compList = list()
    wireList = list()
    juncList = list()

    line = schfile.readline()

    while line:
        if line.startswith("$Comp"):
            compList.append(parseComponent(schfile, componentDict))
        elif line.startswith("Wire"):
            types = line.split()
            vals = schfile.readline().split()
            wireList.append(SchWire(int(vals[0]), int(vals[1]), int(vals[2]), int(vals[3]), types[1]))
        elif line.startswith("Entry"):
            vals = schfile.readline().split()
            wireList.append(SchWire(int(vals[0]), int(vals[1]), int(vals[2]), int(vals[3]), "Entry"))
        elif line.startswith("Connection"):
            values = line.split()
            juncList.append(SchConnection(int(values[2]), int(values[3])))

        line = schfile.readline()

    return compList, wireList, juncList
#  buildLists()

"""
Parses a single schematic file into a Schematic object
Inputs: schname -- name of schematic file (without extension)
        schpath -- relative path to schematic file
        compDict -- dictionary of LibComponent
Output: Schematic corresponding to given file
"""
def parseSchFile(schname, schpath, compDict):
    with open(schpath) as schfile:
        dim, pos = readHeader(schfile)
        if dim is None:
            schfile.close()
            print("Error: unexpected file format in {}".format(schpath))
            return None

        compList, wireList, juncList = buildLists(schfile, compDict)

        schfile.close()

    return Schematic(schname, dim, pos, compList, wireList, juncList)
#  parseSchFile()

def getraw(s):
    if isinstance(s, Symbol):
        return s.value()
    else:
        return s


def parseNetFile(filepath):
    if not os.path.isfile(filepath):
        return []
    nets = []
    with open(filepath) as file:
        data = loads(file.read())

        netdata = None
        for d in range(1, len(data)):
            if car(data[d]).value() == "nets":
                netdata = cdr(data[d])
                break
        
        if netdata is None:
            print("Error: Couldn't parse net data")
            return None

        for netinfo in netdata:
            code = netinfo[1][1]
            name = getraw(netinfo[2][1])
            pins = []
            for i in range(3, len(netinfo)):
                # (ref, pin)
                pins.append((getraw(netinfo[i][1][1]), getraw(netinfo[i][2][1])))

            nets.append(NetInfo(code, name, pins))

        file.close()

    return nets
#  parseNetFile()


def parseLibraries(cachepath, libfiles, libpaths):
    libComponents = dict()

    libfiles.append("")
    libpaths.append(cachepath)

    for i in range(len(libpaths)):
        with open(libpaths[i]) as file:
            newComponents = readLibFile(file, libfiles[i])
            if newComponents is None:
                print("Error: unable to read {} library file".format(libfiles[i] if libfiles[i] else "cache"))
            libComponents.update(newComponents)
            
            file.close()

    return libComponents
#  parseLibraries()

"""
Parses the given project into a list of Schematic and list of NetInfo
By default, uses [projname].sch, [projname]-cache.lib, and [projname].net
All files must be in the same folder
Inputs: folderpath -- relative path to folder with desired files
        projname -- name of the project, which determines file names
        schfiles -- name of additional schematic files, without .sch
        libfiles -- names of additional library files, without .lib
Output: list of Schematic from .sch files
        list of NetInfo from .net file
"""
def parseFiles(folderpath, projname, schfiles=[], libfiles=[]):
    if folderpath[-1] != "/":
        folderpath += "/"

    # These are names not file paths, so we don't want the extensions
    schfiles = [file[:-4] if file[-4:] == ".sch" else file for file in schfiles]
    libfiles = [file[:-4] if file[-4:] == ".lib" else file for file in libfiles]

    cachepath = folderpath + projname + "-cache.lib"
    libpaths = [folderpath + libfile + ".lib" for libfile in libfiles]
    compDict = parseLibraries(cachepath, libfiles, libpaths)

    # Add default schematic to list
    schfiles = [projname] + schfiles
    schpaths = [folderpath + schfile + ".sch" for schfile in schfiles]

    schlist = []
    for i in range(len(schfiles)):
        schlist.append(parseSchFile(schfiles[i], schpaths[i], compDict))

    netpath = folderpath + projname + ".net"
    netlist = parseNetFile(netpath)

    return schlist, netlist
#  parseFiles()

"""
Inputs: outpath -- file path to desired output file (should be .json)
        schlist -- list of Schematic
        netlist -- list of NetInfo
Output: writes JSON to given file
"""
def outputJSON(outpath, schlist, netlist):
    with open(outpath, "w") as outfile:
        outfile.write('{\n')

        if len(schlist) == 0:
            sys.exit("Fatal: No valid schematics found")

        outfile.write('  "schematics": [\n')
        strlist = []
        for sch in schlist:
            strlist.append(sch.toJsonString("    "))
        outfile.write(',\n'.join(strlist))
        outfile.write('\n  ]')

        if len(netlist) > 0:
            outfile.write(
                ',\n'
                '  "nets": [\n'
            )
            strlist = []
            for net in netlist:
                strlist.append(net.toJsonString("    "))
            outfile.write(',\n'.join(strlist))
            outfile.write('\n  ]')

        outfile.write('\n}')
        outfile.close()
#  outputJSON()


if __name__ == "__main__":
    """
    schlist, netlist = parseFiles(
        folderpath="./shio_fpc/",
        projname="shio"
    )
    outputJSON("shio-schdata.json", schlist, netlist)
    """

    
    schlist, netlist = parseFiles(
        folderpath="./A64-OlinuXino hardware revision G/",
        projname="A64-OlinuXino_Rev_G",
        schfiles=["NAND Flash , eMMC, T-Card and Audio",
                  "USB&HDMI,WiFi&BT,Ethernet,LCD",
                  "Power Supply, Extensions and MiPi-DSI "],
        libfiles=["A64-OlinuXino_Rev_G"]
    )

    outputJSON("olinuxino-schdata.json", schlist, netlist)
    
