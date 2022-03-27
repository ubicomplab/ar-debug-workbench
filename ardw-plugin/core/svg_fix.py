# Changes svg width/height to be proportional to their viewbox
# This is necessary for the scaling and zooming of the schematic to work

import os
import re
import sys

def fix_file(svgpath, outpath=None):
    if not os.path.isfile(svgpath):
        print("Error: file not found at {}".format(svgpath))
        return

    with open(svgpath, "r") as file:
        data = file.readlines()

    for linenum in range(len(data)):
        line = data[linenum]
        matchpattern = 'width="(.*)" height="(.*)" viewBox=" *([0-9]*) ([0-9]*) ([0-9]*) ([0-9]*) *"'
        match = re.search(matchpattern, line)
        if not match is None:
            print("Match found in line {}".format(linenum))
            width = int(match.groups()[4]) // 10
            height = int(match.groups()[5]) // 10
            replacepattern = 'width="{}" height="{}" viewBox="\g<3> \g<4> \g<5> \g<6>"'.format(width, height)
            data[linenum] = re.sub(matchpattern, replacepattern, line)
            break

    if outpath is None:
        outpath = svgpath
    with open(outpath, "w") as file:
        file.writelines(data)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python svg_fix.py <path_to_svg>")

    svgpath = sys.argv[1]

    fix_file(svgpath)

    
