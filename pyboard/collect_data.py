import pyrealtime as prt
import struct

from extract_opti_cordinate import extract_cord_layer
from opti_lib import get_opti_source
from projector_calib import projection_draw, get_current_pixel_point, get_board_position, get_current_board_pixel_point, \
    get_top_pixel_point

CALIBRATE_PROJECTOR = False
CALIBRATE_TIP_POS = False
DEBUG = False
FILTERED = False
SEND_OVER_UDP = True
USE_BOARD = True
RECORD = False


def encode_udp(data):
    if USE_BOARD:
        return struct.pack("f" * 6, data['red_tip_pixel'][0], data['red_tip_pixel'][1],
                           data['red_top_pixel'][0], data['red_top_pixel'][1],
                           data['board'][0], data['board'][1])
    return struct.pack("f" * 8, data['red_tip_pixel'][0], data['red_tip_pixel'][1],
                       data['tip_pos_opti'][0], data['tip_pos_opti'][1], data['tip_pos_opti'][2],
                       data['opti']['red']['pos'][0], data['opti']['red']['pos'][1], data['opti']['red']['pos'][2])


def main():
    opti = get_opti_source(show_plot=False, use_board=USE_BOARD, use_tray=False)
    if RECORD:
        prt.RecordLayer(opti, file_prefix="opti")
    if not CALIBRATE_TIP_POS:
        tip_pos = extract_cord_layer(opti, use_board=USE_BOARD)
        red_pixel_point = get_current_pixel_point(tip_pos, calibrate=CALIBRATE_PROJECTOR, marker="RED")
        red_top_pixel = get_top_pixel_point(opti)
        if USE_BOARD:
            board_pixel_point = get_current_board_pixel_point(tip_pos)
            # prt.PrintLayer(board_pixel_point)
        # prt.PrintLayer(board_pixel_point)
        # gray_pixel_point = get_current_pixel_point(tip_pos, calibrate=CALIBRATE, marker="GRAY")
        if USE_BOARD:
            board_pos = get_board_position(tip_pos)
        if FILTERED:
            red_pixel_point = prt.ExponentialFilter(red_pixel_point, alpha=0.1)
            # gray_pixel_point = prt.ExponentialFilter(gray_pixel_point, alpha=0.1)
        if not CALIBRATE_PROJECTOR and DEBUG:
            draw = projection_draw(red_pixel_point, win_width=1920, win_height=1080)
        if SEND_OVER_UDP:
            data = prt.MergeLayer(None)
            data.set_input(red_pixel_point, "red_tip_pixel")
            data.set_input(red_top_pixel, "red_top_pixel")
            # data.set_input(opti, "opti")
            # data.set_input(gray_pixel_point, "grey_tip_pixel")
            if USE_BOARD:
                data.set_input(board_pixel_point, "board")
            prt.UDPWriteLayer(data, port=8052, encoder=encode_udp)
    prt.LayerManager.session().run(show_monitor=False)


if __name__ == "__main__":
    main()