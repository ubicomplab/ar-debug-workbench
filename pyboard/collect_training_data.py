import pyrealtime as prt
import serial
import math
import numpy as np
import struct
from scipy import signal

from controller_lib import get_device_data
from extract_opti_cordinate import extract_cord, encode_udp_tip_opti
from opti_lib import get_opti_source
from projector_calib import ProjectorLayer, DrawingPane
from projector_calibration import projector

USE_NATNET = True
RECORD = False
USE_BOARD = False
USE_TRAY = False
EXTRACT_COORD = True


def main():
    # data, adc = get_device_data(show_plot=True)
    # prt.TimePlotLayer(data.get_port("count"), n_channels=1, window_size=1000, ylim=(0,50))
    # segmented = segment_data(data, show_plot=True)
    # if RECORD:
    #     prt.RecordLayer(data.get_port("raw_data"), file_prefix="mag-raw")

    if USE_NATNET:
        opti = get_opti_source(show_plot=False, use_board=USE_BOARD, use_tray=USE_TRAY)
        if EXTRACT_COORD:
            tip_pos = extract_cord(opti)
            # projector(tip_pos)
            # key_inptut = prt.InputLayer()
            # all_data = prt.MergeLayer(tip_pos, trigger=prt.LayerTrigger.LAYER, trigger_source="key", discard_old=True)
            # all_data.set_input(key_inptut, "key")
            # key = input()
            # if key == 'c':
            ProjectorLayer(tip_pos,  name="projector")
            # pane = DrawingPane(tip_pos, xlim=(-np.pi / 2, np.pi / 2), ylim=(-np.pi / 2, np.pi / 2),
            #                    buffer_size=2000, scroll_speed=0)

            # prt.PrintLayer(tip_pos)
            # prt.UDPWriteLayer(tip_pos, port=8052, encoder=encode_udp_tip_opti)

    if RECORD:
        # prt.RecordLayer(adc, file_prefix="mag")
        if USE_NATNET:
            # prt.PrintLayer(opti)
            prt.RecordLayer(opti, file_prefix="opti")

    prt.LayerManager.session().run()


if __name__ == "__main__":
    main()

