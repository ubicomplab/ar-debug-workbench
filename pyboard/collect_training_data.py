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
RECORD = True
USE_BOARD = False
USE_TRAY = False
EXTRACT_COORD = True


def gen_dummy_data(counter):
    data = np.random.randint(100, size=(1,))
    return ','.join([str(x) for x in data.tolist()])


def main():
    # data, adc = get_device_data(show_plot=True)
    # prt.TimePlotLayer(data.get_port("count"), n_channels=1, window_size=1000, ylim=(0,50))
    # segmented = segment_data(data, show_plot=True)
    # if RECORD:
    #     prt.RecordLayer(data.get_port("raw_data"), file_prefix="mag-raw")

    if USE_NATNET:
        opti = get_opti_source(show_plot=True, use_board=USE_BOARD, use_tray=USE_TRAY)
        # prt.PrintLayer(opti)
        # tip_pos = prt.InputLayer(gen_dummy_data, rate=30, name="dummy input")
        # prt.PrintLayer(tip_pos)
        # prt.ScatterPlotLayer(tip_pos, xlim=(-1, 1), ylim=(-1, 1))
    #     if EXTRACT_COORD:
    #         tip_pos = extract_cord(opti)
    #         prt.PrintLayer(tip_pos)
    #         buffered_data = prt.BufferLayer(tip_pos, buffer_size=10)
    #         prt.ScatterPlotLayer(buffered_data, xlim=(-10, 10), ylim=(-10, 10))
    # #         # projector(tip_pos)
    # #         # key_inptut = prt.InputLayer()
    # #         # all_data = prt.MergeLayer(tip_pos, trigger=prt.LayerTrigger.LAYER, trigger_source="key", discard_old=True)
    # #         # all_data.set_input(key_inptut, "key")
    # #         # key = input()
    # #         # if key == 'c':
    # #         projection_matrix = ProjectorLayer(tip_pos,  name="projector")
    # #         all_data = prt.MergeLayer(None)
    # #         # all_data = prt.MergeLayer(projection_matrix, trigger=prt.LayerTrigger.LAYER, trigger_source="projector", discard_old=True)
    # #         all_data.set_input(tip_pos, "pos")
    # #         all_data.set_input(projection_matrix, "projector")
    # #         # prt.PrintLayer(all_data)
    # #         # DrawingPane(tip_pos, xlim=(-np.pi / 2, np.pi / 2), ylim=(-np.pi / 2, np.pi / 2),
    # #         #                    buffer_size=2000, scroll_speed=0)
    # #         # prt.PrintLayer(tip_pos)
    # #         # pane = DrawingPane(tip_pos, xlim=(-np.pi / 2, np.pi / 2), ylim=(-np.pi / 2, np.pi / 2),
    # #         #                    buffer_size=2000, scroll_speed=-0.002)
    # #         # prt.PrintLayer(tip_pos)
    # #         # prt.UDPWriteLayer(tip_pos, port=8052, encoder=encode_udp_tip_opti)
    # #
    if RECORD:
        if USE_NATNET:
            # prt.PrintLayer(opti)
            prt.RecordLayer(opti, file_prefix="opti")

    prt.LayerManager.session().run()


if __name__ == "__main__":
    main()

