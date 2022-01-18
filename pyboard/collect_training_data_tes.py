import pyrealtime as prt
import struct

from extract_opti_cordinate import extract_cord
from opti_lib import get_opti_source
from projector_calib import ProjectorLayer, projection_draw, get_current_pixel_point

CALIBRATE = False
FILTERED = False
SEND_OVER_UDP = True


def encode_udp(data):
    return struct.pack("f" * 2, data[0], data[1])


def main():
    opti = get_opti_source(show_plot=False, use_board=False, use_tray=False)
    tip_pos = extract_cord(opti)
    pixel_point = get_current_pixel_point(tip_pos, calibrate=CALIBRATE)
    # current_pixel_point = ProjectorLayer(tip_pos, name="projector")
    # buffered_data = prt.BufferLayer(pixel_point, buffer_size=10)
    # prt.ScatterPlotLayer(buffered_data, xlim=(0, 1920), ylim=(-1080, 0))

    if FILTERED:
        pixel_point = prt.ExponentialFilter(pixel_point, alpha=0.1)
    if not CALIBRATE:
        draw = projection_draw(pixel_point, win_width=1920, win_height=1080)
    if SEND_OVER_UDP:
        prt.UDPWriteLayer(pixel_point, port=8052, encoder=encode_udp)
    prt.LayerManager.session().run(show_monitor=False)


if __name__ == "__main__":
    main()