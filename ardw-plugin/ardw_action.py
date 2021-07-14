
import json
import logging
import os
import sys
import time
import traceback

import pcbnew
from .ibom.pcbparser import PcbnewParser, generate_bom, round_floats
from .ibom.pcbparser import Config

class ARDebugWorkbenchPlugin(pcbnew.ActionPlugin, object):

    def defaults(self):
        self.name = "AR Debug Workbench Plugin"
        self.category = "Read PCB"
        self.pcbnew_icon_support = hasattr(self, "show_toolbar_button")
        self.show_toolbar_button = True
        self.icon_file_name = os.path.join(os.path.dirname(__file__), 'icon.png')
        self.description = "Extracts pcbnew data for AR Debug Workbench"

    def Run(self):

        plugin_dir = os.path.dirname(os.path.realpath(__file__))
        log_file = os.path.join(plugin_dir, "ardw_plugin.log")

        logging.basicConfig(level=logging.DEBUG,
                            filename=log_file,
                            filemode='w',
                            format='%(asctime)s %(name)s %(lineno)d:%(message)s',
                            datefmt='%m-%d %H:%M:%S')
        logger = logging.getLogger("ARDW Plugin")
        
        logger.info("Plugin executed on: " + repr(sys.platform))
        logger.info("Plugin executed with python version: " + repr(sys.version))

        try:
            config = Config("test")

            board = pcbnew.GetBoard()
            pcb_file_path = board.GetFileName()
            parser = PcbnewParser(pcb_file_path, config, logger, board)

            logger.info("Parsing pcbdata")
            pcbdata, components = parser.parse()
            if not pcbdata and not components:
                logger.error("Failed to parse PCB data")

            logger.info("Generating bom data")
            pcbdata["bom"] = generate_bom(components, config)
            pcbdata_str = json.dumps(round_floats(pcbdata, 6))

            logger.info("Writing json file")
            project_dir = os.path.dirname(os.path.realpath(pcb_file_path))
            project_dir_name = os.path.split(project_dir)[1]
            json_path = os.path.join(project_dir, "pcbdata.json")

            with open(json_path, "w") as json_file:
                json_file.write(pcbdata_str)

            logger.info("Done")

        except Exception as _:
            logger.error(traceback.format_exc())


