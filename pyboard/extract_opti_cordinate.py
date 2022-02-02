import struct
import numpy as np
import math
from scipy.spatial.transform import Rotation as R
import pyrealtime as prt
import pickle
import os
from settings import DATA_ROOT

USE_BOARD = False
calib = 1


@prt.transformer
def extract_cord(data):

    global red_tip
    global calib
    global grey_tip

    if calib:
        red_tip = pickle.load(open(os.path.join(DATA_ROOT, 'calibration', 'red_calib.pkl'), 'rb'))
        grey_tip = pickle.load(open(os.path.join(DATA_ROOT, 'calibration', 'grey_calib.pkl'), 'rb'))
        calib = 0

    grey_pos = data['grey']['pos']
    red_pos = data['red']['pos']
    grey_rot = R.from_quat(data['grey']['rot'])
    red_rot = R.from_quat(data['red']['rot'])

    grey_markers_adj = grey_pos + grey_rot.apply(grey_tip)
    red_markers_adj = red_pos + red_rot.apply(red_tip)

    if USE_BOARD:
        board_pos = data['board']['pos']
        return [red_markers_adj[0], red_markers_adj[1], red_markers_adj[2], grey_markers_adj[0], grey_markers_adj[1], grey_markers_adj[2], board_pos[0], board_pos[1], board_pos[2]]
    return [red_markers_adj[0], red_markers_adj[1], red_markers_adj[2], grey_markers_adj[0], grey_markers_adj[1], grey_markers_adj[2]]


def extract_cord_layer(data, use_board=False):
    global USE_BOARD
    USE_BOARD = use_board
    pos = extract_cord(data)
    return pos
