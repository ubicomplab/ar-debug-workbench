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

# import package
import pyvisa
#import argparse

# known instruments
# we expect all SCPI-enabled instruments to accept the same basic commands, but we can use this list to assign an instrument type
supported_dmms = ["MODEL DMM6500", "DMM6500"]
supported_oscs = ["MODEL MSO4104", "MSO4104"]

open_resources = []
Instruments = []

# parser = argparse.ArgumentParser('Read value from an Instrument')
# parser.add_argument("--instrument", type=str, help="select an instrument. options: 'dmm', 'osc'")
# parser.add_argument("--function", type=str, help="function for instrument read. examples: voltage, current, resistance")


class Instrument:
    def __init__(self, handle, identifier, type):
        self.handle = handle
        self.identifier = identifier
        self.type = type


class DMM(Instrument):
    def getVoltage(self):
        value = float(self.handle.query(':MEASure:VOLTage:DC?'))
        print("Measured value = " + str(value) + " VDC")
        return value

class Oscilliscope(Instrument):
    #TODO change this method for oscilliscope
    def getVoltageOsc(self):
        value = float(self.handle.query(':MEASure:VOLTage:DC?'))
        print("Measured value = " + str(value) + " VDC")
        return value

# Grabs open resources from PyVisa Resource Manager and appends them to open_resources array
def getResources():
    rm = pyvisa.ResourceManager()
    resources = rm.list_resources()

    if len(resources) == 0:
        print("No resources found")
        return

    for counter in range(len(resources)):
        print("Connecting to resource "+str(counter)+": " + resources[counter])
        open_resources.append(rm.open_resource(resources[counter]))
        print("Connected to: " + open_resources[counter].query("*IDN?"))

# Depending on type on instrument 
def assignResources(open_resources):
    rm = pyvisa.ResourceManager()
    resources = rm.list_resources()

    for counter in range(len(open_resources)):
        if open_resources[counter].query("*IDN?").split(",")[1] in supported_dmms:
            print("Resource "+str(counter)+" is a DMM")
            Instruments.append(DMM(open_resources[counter], open_resources[counter].query("*IDN?").split(",")[1], 'DMM'))
        elif open_resources[counter].query("*IDN?").split(",")[1] in supported_oscs:
            print("Resource "+str(counter)+" is an oscilliscope")
            Instruments.append(Oscilliscope(open_resources[counter], open_resources[counter].query("*IDN?").split(",")[1], 'Oscilliscope'))
        else:
            print("Resource "+str(counter)+" is unknown / unsupported")
            Instruments.append(None)    
    # inst.write("*rst; status:preset; *cls")

# def queryValue(instrumentType, function):
#     if instrumentType == "dmm":
#         if function == "voltage":
#             # TODO need to fix later so it doesn't just take the first instrument 
#             value = float(instruments[0].query(':MEASure:VOLTage:DC?'))
#             print("Measured value = " + str(value) + " VDC")
#             return value

#     elif instrumentType == "osc":
#         if function == "voltage":
#             # TODO need to fix later so it doesn't just take the first instrument 
#             value = float(instruments[0].query(':MEASure:VOLTage:DC?'))
#             print("Measured value = " + str(value) + " VDC")
#             return value

#     else:
#         print("Invalid instrument type provided to queryValue")
#         return

def main():
    getResources()
    assignResources(open_resources)
    #my_DMM = DMM(rm.open_resource(resources[0]), instruments[0].query("*IDN?").split(",")[1])
    Instruments[0].getVoltage()
    #queryValue("dmm", "voltage")
    # for i in range(200):
    #     value = float(instruments[0].query(':MEASure:VOLTage:DC?'))
        

if __name__ == "__main__":
    # args = parser.parse_args()
    #main(args)
    main()
