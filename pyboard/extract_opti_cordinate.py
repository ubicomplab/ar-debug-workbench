import struct
import numpy as np
import math
from scipy.spatial.transform import Rotation as R
import pyrealtime as prt
import pickle
import os
from settings import DATA_ROOT
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

    # return [grey_pos, grey_rot.as_quat(), red_pos, red_rot.as_quat(), grey_markers_adj, red_markers_adj]
    # return np.hstack((red_markers_adj[0], red_markers_adj[1]))
    return [red_markers_adj[0], 0, red_markers_adj[2]]
    # return red_markers_adj

    # return [grey_markers_adj, red_markers_adj]


def encode_udp_tip_opti(data):
    # return struct.pack("f" * 6, float(data[0][0]), float(data[0][1]), float(data[0][2]), float(data[1][0]),
    #                    float(data[1][1]), float(data[1][2]))
    return struct.pack("f" * 20, float(data[0][0]), float(data[0][1]), float(data[0][2]),
                       float(data[1][0]), float(data[1][1]), float(data[1][2]), float(data[1][3]),
                       float(data[2][0]), float(data[2][1]), float(data[2][2]),
                       float(data[3][0]), float(data[3][1]), float(data[3][2]), float(data[3][3]),
                       float(data[4][0]), float(data[4][1]), float(data[4][2]),
                       float(data[5][0]), float(data[5][1]), float(data[5][2])
                       )
