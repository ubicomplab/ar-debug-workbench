"""
Simple read through SCPI

Requires PyVISA, PyVISA-py
pip install pyvisa
pip install pyvisa-py

Confirm proper PyVISA-py installation with
python -m visa info

If using a USB resource, requires PyUSB which in turn requires USB driver library such as libusb 1.0

pip intall pyusb
brew install libusb
may need to restart terminal/computer after libusb installation
"""

from flask import Flask, render_template, Response, request, redirect, url_for
# import package
import pyvisa
import logging
import visa

# import argparse

app = Flask(__name__)
host = "127.0.0.1"
port = 8080

# known instruments
# we expect all SCPI-enabled instruments to accept the same basic commands, but we can use this list to assign an instrument type
supported_dmms = ["MODEL DMM6500", "DMM6500"]
supported_oscs = ["MODEL MSO4104", "MSO4104"]

dmms = []
oscs = []

# Oscilliscope channel
channel = 2

# parser = argparse.ArgumentParser('Read value from an Instrument')
# parser.add_argument("--instrument", type=str, help="select an instrument. options: 'dmm', 'osc'")
# parser.add_argument("--function", type=str, help="function for instrument read. examples: voltage, current, resistance")

rm = pyvisa.ResourceManager()
resources = rm.list_resources()

# @app.route("/")
def index():
    return (
        """
        <input type="button" id="voltage" value="voltage">
        <input type="button" id="resistance" value="resistance">
        """
    )


# rendering the HTML page which has the button
@app.route('/instrument_panel')
def json():
    return render_template('instrument_panel.html')

def initializeInstruments():
    if len(resources) == 0:
        logging.warning("No resources found")
        return

    for counter in range(len(resources)):
        logging.info(f"Connecting to resource {counter}: {resources[counter]}")

        if "USB" in resources[counter]:
            current_resource = rm.open_resource(resources[counter])
            logging.info(f"Connected to: {current_resource.query('*IDN?')}")
            if current_resource.query("*IDN?").split(",")[1] in supported_dmms:
                logging.info(f"Resource {counter} is a supported DMM")
                dmms.append(current_resource)

            elif current_resource.query("*IDN?").split(",")[1] in supported_oscs:
                logging.info(f"Resource {counter} is a supported oscilliscope")
                oscs.append(current_resource)
                current_resource.write('VERBOSE ON')

            else:
                logging.info(f"Resource {current_resource} isn't a supported DMM or oscilliscope")
        else:
            logging.info(f"{resources[counter]} isn't a USB device. Can't connect.")

    # inst.write("*rst; status:preset; *cls")

def releaseInstruments():
    dmms = []
    oscs = []
    print("attempting to close insturments")
    rm.close()
    print("closed insturments")

    # inst.write("*rst; status:preset; *cls")

# @app.route('/voltageMode')
# def voltageMode():
#         MODE = "voltage"
#         return MODE
#
# @app.route('/resistanceMode')
# def resistanceMode():
#         MODE = "resistance"
#         return MODE

@app.route('/queryValue/<function>')
def queryValue(instrumentType="dmm", function="no_function"):
    if instrumentType == "dmm":

        for attempt in range(5):
            if function == "no_function":
                # return Response("--------", mimetype='text')
                if __name__ == "__main__":
                    return Response("Please select a function", mimetype='text')
                return None

            try:
                value = None
                if function == "voltage":
                    value = float(dmms[0].query(':MEASure:VOLTage:DC?'))
                    # logging.info(f"Measured value = {value} VDC")
                    # return Response(str(value), mimetype='text')

                if function == "resistance":
                    value = float(dmms[0].query(':MEAS:RES?'))
                    # logging.info(f"Measured value = {value} ohms")
                    # return Response(str(value), mimetype='text')

                if function == "diode":
                    value = float(dmms[0].query(':MEASure:DIODe?'))
                    # logging.info(f"Measured value = {value} VDC")
                    # return Response(str(value), mimetype='text')

                if function == "continuity":
                    value = float(dmms[0].query(':MEAS:CONT?'))
                    # logging.info(f"Measured value = {value}")
                    # return Response(str(value), mimetype='text')

                if function == "dc_current":
                    value = float(dmms[0].query(':MEAS:CURR:DC?'))
                    # logging.info(f"Measured value = {value} A")
                    # return Response(str(value), mimetype='text')

                if value:
                    if __name__ == "__main__":
                        return Response(str(value), mimetype='text')
                    else:
                        return value
            
            except:
                print("Instrument can't communicate -- resetting")
                releaseInstruments()

                print("loading new pyvisa resouce manager")
                rm = pyvisa.ResourceManager()
                resources = rm.list_resources()

                print("Reinitializing...")
                initializeInstruments()
                print("Reinitialized...")

            else:
                break


    elif instrumentType == "osc":
        if function == "frequency":
            # oscs[0].write('MEASU:FREQ CHAN' + str(channel))
            # oscs[0].write(':MEASUrement:IMMed:SOUrce1 CH' + str(channel))
            # oscs[0].write(':MEASUrement:IMMed:TYPe FREQuency')
            # value = str(oscs[0].query(':MEASUrement:IMMed:VALue?'))
            oscs[0].write(':MEASUrement:MEAS1:STATE ON')
            oscs[0].write(':MEASUrement:MEAS1:SOUrce1 CH' + str(channel))
            oscs[0].write(':MEASUrement:MEAS1:TYPe FREQuency')
            value = str(oscs[0].query(':MEASUrement:MEAS1:VALue?'))
            logging.info(f"Measured value = {value} Hz")
            return value

        if function == "pduty":
            oscs[0].write(':MEASUrement:MEAS1:STATE ON')
            oscs[0].write(':MEASUrement:MEAS1:SOUrce1 CH' + str(channel))
            oscs[0].write(':MEASUrement:MEAS1:TYPe PDUTY')
            value = str(oscs[0].query(':MEASUrement:MEAS1:VALue?'))
            logging.info(f"Measured value = {value} %")
            return value

    else:
        logging.info("Invalid instrument type provided to queryValue")
        return


if __name__ == "__main__":
    # args = parser.parse_args()
    # main(args)

    initializeInstruments()
    app.run(host=host, port=port, threaded=True, debug=True)

    # queryValue("dmm", "voltage")
    # queryValue("osc", "frequency")
