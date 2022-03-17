import pyrealtime as prt
import struct

from extract_opti_cordinate import extract_cord_layer
from opti_lib import get_opti_source
from projector_calib import projection_draw, get_pixel_point, get_board_position, get_red_pixel_point, \
    ProjectionCalibrate, get_board_rot

CALIBRATE_PROJECTOR = False
CALIBRATE_TIP_POS = False
DEBUG = False
FILTERED = True
SEND_OVER_UDP = True
USE_BOARD = True
RECORD = False
ALPHA = 0.3
ALPHA_BOARD = 0.1


def encode_udp(data):
    if USE_BOARD:
        # print(data['tip_pos'][2])
        return struct.pack("f" * 14,
                           data['red_tip_pixel'][0], data['red_tip_pixel'][1],data['tip_pos'][2],
                           data['red_top_pixel'][0], data['red_top_pixel'][1],
                           data['board'][0], data['board'][1], data['board_pos'][2],
                           data['grey_tip_pixel'][0], data['grey_tip_pixel'][1], data['tip_pos'][5],
                           data['grey_top_pixel'][0], data['grey_top_pixel'][1], data['board_rot'][0])

    return struct.pack("f" * 8, data['red_tip_pixel'][0], data['red_tip_pixel'][1],
                       data['tip_pos_opti'][0], data['tip_pos_opti'][1], data['tip_pos_opti'][2],
                       data['opti']['red']['pos'][0], data['opti']['red']['pos'][1], data['opti']['red']['pos'][2])


def main():
    opti = get_opti_source(show_plot=False, use_board=USE_BOARD, use_tray=False)
    board_rot = get_board_rot(opti)
    # prt.PrintLayer(board_rot)
    # fps = prt.FigureManager(fps=10000)
    # prt.TimePlotLayer(board_rot, ylim=(-200, 200), n_channels=3, fig_manager=fps)
    if RECORD:
        prt.RecordLayer(opti, file_prefix="opti")
    if not CALIBRATE_TIP_POS:
        tip_pos = extract_cord_layer(opti, use_board=USE_BOARD)
        if CALIBRATE_PROJECTOR:
            ProjectionCalibrate(tip_pos, win_width=1920, win_height=1080)
        else:
            red_pixel_point = get_pixel_point(tip_pos, marker="RED_TIP")
            # prt.PrintLayer(red_pixel_point)
            if DEBUG:
                draw = projection_draw(red_pixel_point, win_width=1920, win_height=1080)
            else:
                red_top_pixel = get_pixel_point(opti, marker="RED_TOP")
                grey_pixel_point = get_pixel_point(tip_pos, marker="GREY_TIP")
                grey_top_pixel = get_pixel_point(opti, marker="GREY_TOP")
                if USE_BOARD:
                    board_pixel_point = get_pixel_point(tip_pos, marker="BOARD")
                    board_pos = get_board_position(tip_pos)
                if FILTERED:
                    red_pixel_point = prt.ExponentialFilter(red_pixel_point, alpha=ALPHA)
                    red_top_pixel = prt.ExponentialFilter(red_top_pixel, alpha=ALPHA)
                    grey_pixel_point = prt.ExponentialFilter(grey_pixel_point, alpha=ALPHA)
                    grey_top_pixel = prt.ExponentialFilter(grey_top_pixel, alpha=ALPHA)
                # prt.PrintLayer(grey_pixel_point)
                if SEND_OVER_UDP:
                    data = prt.MergeLayer(None)
                    data.set_input(red_pixel_point, "red_tip_pixel")
                    data.set_input(red_top_pixel, "red_top_pixel")
                    data.set_input(grey_pixel_point, "grey_tip_pixel")
                    data.set_input(grey_top_pixel, "grey_top_pixel")
                    data.set_input(tip_pos, "tip_pos")
                    if USE_BOARD:
                        if FILTERED:
                            board_pixel_point = prt.ExponentialFilter(board_pixel_point, alpha=ALPHA_BOARD)
                        #     board_pos = prt.ExponentialFilter(board_pos, alpha=ALPHA_BOARD)
                            #board_rot = prt.ExponentialFilter(board_rot, alpha=ALPHA_BOARD)
                        data.set_input(board_pixel_point, "board")
                        data.set_input(board_pos, "board_pos")
                        data.set_input(board_rot, "board_rot")

                    prt.UDPWriteLayer(data, port=8052, encoder=encode_udp)
    prt.LayerManager.session().run(show_monitor=False)


if __name__ == "__main__":
    main()