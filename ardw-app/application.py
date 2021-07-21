from flask import Flask
from flask import render_template, send_from_directory

import json
import logging
import os


logging.basicConfig(
    filename="ardw.log",
    filemode="w",
    encoding="utf-8",
    level="DEBUG",
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logging.info("Server started")

schdata = None
pcbdata = None

with open("./data/schdata.json", "r") as schfile:
    schdata = json.load(schfile)

with open("./data/pcbdata.json", "r") as pcbfile:
    pcbdata = json.load(pcbfile)

if schdata is None or pcbdata is None:
    logging.error("Failed to load sch or pcb data, exiting...")
    exit()

num_schematics = schdata["schematics"][0]["orderpos"]["total"]

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/main")
def main_page():
    return render_template("main.html")

@app.route("/projector")
def projector_page():
    return render_template("projector.html")

@app.route("/schdata")
def get_schdata():
    return json.dumps(schdata)

@app.route("/pcbdata")
def get_pcbdata():
    return json.dumps(pcbdata)

@app.route("/sch<schid>")
def get_schematic_svg(schid):
    schid = int(schid)
    for schematic in schdata["schematics"]:
        if int(schematic["orderpos"]["sheet"]) != schid:
            continue

        filename = str(schematic["name"]).strip() + ".svg"
        dirpath = os.path.join(os.path.dirname(os.path.realpath(__file__)), "data")

        if not os.path.isfile(os.path.join(dirpath, filename)):
            # KiCad doubles the sheet name when creating svgs
            # for additional schematic sheets
            filename = str(schematic["name"]) + filename

        if not os.path.isfile(os.path.join(dirpath, filename)):
            logging.error(f"Missing file for schid {schid}")
        else:
            return send_from_directory(dirpath, filename)
    return ""
