from prt_natnet import NatNetLayer
import pyrealtime as prt
import numpy as np

GREY_PROBE_RIGID_BODY_NAME = b"grey"
RED_PROBE_RIGID_BODY_NAME = b"red"
BOARD_RIGID_BODY_NAME = b"board"
TRAY_RIGID_BODY_NAME = b"tray"


@prt.transformer(multi_output=True)
def parse(data):
    return {'pos': np.array(data[0]), 'rot': np.array(data[1])}


def setup_fig(fig):
    ax1 = fig.add_subplot(421)
    ax2 = fig.add_subplot(422)
    ax3 = fig.add_subplot(423)
    ax4 = fig.add_subplot(424)
    ax5 = fig.add_subplot(425)
    ax6 = fig.add_subplot(426)
    ax7 = fig.add_subplot(427)
    ax8 = fig.add_subplot(428)
    return {f'{GREY_PROBE_RIGID_BODY_NAME}_pos': ax1, f'{GREY_PROBE_RIGID_BODY_NAME}_rot': ax2, f'{RED_PROBE_RIGID_BODY_NAME}_pos': ax3, f'{RED_PROBE_RIGID_BODY_NAME}_rot': ax4,
            f'{TRAY_RIGID_BODY_NAME}_pos': ax5, f'{TRAY_RIGID_BODY_NAME}_rot': ax6, f'{BOARD_RIGID_BODY_NAME}_pos': ax7, f'{BOARD_RIGID_BODY_NAME}_rot': ax8}


def get_opti_source(show_plot=True, use_board=False, use_tray=False):
    bodies = [GREY_PROBE_RIGID_BODY_NAME, RED_PROBE_RIGID_BODY_NAME]
    if use_tray:
        bodies += [TRAY_RIGID_BODY_NAME]
    if use_board:
        bodies += [BOARD_RIGID_BODY_NAME]

    natnet = NatNetLayer(bodies_to_track=bodies, multi_output=True, print_fps=True, track_markers=True)
    # prt.PrintLayer(parse(natnet.get_port(RIGID_BODY_NAME)))
    frame_num = natnet.get_port("frame_num")
    parsed_grey = parse(natnet.get_port(GREY_PROBE_RIGID_BODY_NAME))
    parsed_red = parse(natnet.get_port(RED_PROBE_RIGID_BODY_NAME))
    if use_tray:
        parsed_tray = parse(natnet.get_port(TRAY_RIGID_BODY_NAME))
    if use_board:
        parsed_board = parse(natnet.get_port(BOARD_RIGID_BODY_NAME))
    markers = natnet.get_port('markers')
    # unlabled = natnet.get_port('unlabeled')
    if show_plot:
        fm = prt.FigureManager(setup_fig)
        prt.TimePlotLayer(parsed_grey.get_port('pos'), ylim=(-2, 2), n_channels=3, plot_key=f'{GREY_PROBE_RIGID_BODY_NAME}_pos',
                          fig_manager=fm)
        prt.TimePlotLayer(parsed_grey.get_port('rot'), ylim=(-2,2), n_channels=4, plot_key=f'{GREY_PROBE_RIGID_BODY_NAME}_rot', fig_manager=fm)
        prt.TimePlotLayer(parsed_red.get_port('pos'), ylim=(-2, 2), n_channels=3, plot_key=f'{RED_PROBE_RIGID_BODY_NAME}_pos',
                          fig_manager=fm)
        prt.TimePlotLayer(parsed_red.get_port('rot'), ylim=(-2,2), n_channels=4, plot_key=f'{RED_PROBE_RIGID_BODY_NAME}_rot', fig_manager=fm)
        if use_tray:
            prt.TimePlotLayer(parsed_tray.get_port('rot'), ylim=(-2,2), n_channels=4, plot_key=f'{TRAY_RIGID_BODY_NAME}_rot', fig_manager=fm)
        if use_board:
            prt.TimePlotLayer(parsed_board.get_port('rot'), ylim=(-2,2), n_channels=4, plot_key=f'{BOARD_RIGID_BODY_NAME}_rot', fig_manager=fm)

    data = prt.MergeLayer(None)
    data.set_input(frame_num, "frame_num")
    data.set_input(parsed_grey, "grey")
    data.set_input(parsed_red, "red")
    if use_tray:
        data.set_input(parsed_tray, "tray")
    if use_board:
        data.set_input(parsed_board, "board")
    data.set_input(markers, "markers")
    # data.set_input(unlabled, "unlabeled")
    # prt.PrintLayer(data)
    return data
