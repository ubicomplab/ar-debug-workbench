import pyrealtime as prt
import numpy as np

from extract_opti_cordinate import extract_cord
from opti_lib import get_opti_source
from projector_calib import ProjectorLayer, DrawingPane, projection_draw


def gen_dummy_data(counter):
    data = np.random.randint(100, size=(1,))
    return ','.join([str(x) for x in data.tolist()])

def gen_randn_data(counter):
    return np.random.randn(1)

def gen_randn_list(counter):
    return np.random.randn(1)[0], np.random.randn(1)[0]


def main():
    opti = get_opti_source(show_plot=False, use_board=False, use_tray=False)
    tip_pos = extract_cord(opti)
    # prt.PrintLayer(tip_pos)
    currentPixelPoint = ProjectorLayer(tip_pos, name="projector")

    buffered_data = prt.BufferLayer(currentPixelPoint, buffer_size=10)
    # prt.ScatterPlotLayer(buffered_data, xlim=(0, 1920), ylim=(-1080, 0))
    # pane = DrawingPane(currentPixelPoint, xlim=(0, 1920), ylim=(-1080, 0),
    #                    buffer_size=10, scroll_speed=0)
    draw = projection_draw(currentPixelPoint, win_width=1920, win_height=1080)

    # x = prt.InputLayer(gen_randn_data, rate=30, name="dummy x")
    # y = prt.InputLayer(gen_randn_data, rate=30, name="dummy y")
    #
    # data = prt.stack((x, y))
    # # Buffer some data and plot the entire buffer
    # buffered_data = prt.BufferLayer(data, buffer_size=10)
    # prt.ScatterPlotLayer(buffered_data, xlim=(-10,10), ylim=(-10,10))

    # # Use internal buffer
    # prt.AggregateScatterPlotLayer(data, buffer_size=500, xlim=(-1,1), ylim=(-1,1))
    #
    # # Without using numpy
    # list_data = prt.InputLayer(gen_randn_list, rate=30)
    # prt.AggregateScatterPlotLayer(list_data, buffer_size=500, xlim=(-1,1), ylim=(-1,1))

    prt.LayerManager.session().run(show_monitor=False)


if __name__ == "__main__":
    main()