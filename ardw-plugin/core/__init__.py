# Takes the board file path from pcbnew and figures out
# where the .sch, .lib, and .net files are for sch_reader.py

import os

from .sch_reader import parseFiles, outputJSON
from .svg_fix import fix_file

# Takes the path to the project's <projname>.kicad_pcb file
# from pcbnew.GetBoard().GetFileName()
# libpaths holds real paths to any external lib files
"""
Given a board file, figures out where the important files are
and runs parseFiles(), writing the result to output_path
Inputs: logger -- logger to write errors, etc
        pcb_file_path -- real path to board, from pcbnew.py
        output_path -- real path to output file
        extlibpaths -- list of real paths to lib files not in the main directory
Output: none
"""
def parseProject(logger, pcb_file_path, output_path, extlibpaths=[]):
    
    project_dir = os.path.dirname(os.path.realpath(pcb_file_path))

    project_name = os.path.split(pcb_file_path)[1][:-10]

    schfiles = []
    libfiles = []
    for filename in os.listdir(project_dir):
        if filename.endswith(".sch"):
            schname = str(filename[:-4])
            if schname != project_name:
                schfiles.append(schname)
        elif filename.endswith(".lib"):
            libname = str(filename[:-4])
            if libname != (project_name + "-cache"):
                libfiles.append(libname)
    
    logger.info("Parsing '{}' at {}".format(project_name, project_dir))
    schlist, netlist = parseFiles(project_dir, project_name, schfiles, libfiles)
    logger.info("Writing result to {}".format(output_path))
    outputJSON(output_path, schlist, netlist)
