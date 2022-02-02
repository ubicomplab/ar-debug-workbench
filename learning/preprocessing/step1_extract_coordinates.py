import os
import pickle
# import quaternion
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import numpy as np
import pandas as pd
from scipy.spatial.transform import Rotation as R
# from preprocessing.optiTrackMarkers import get_opti_marker
from settings import DATA_ROOT
from utils import load_opti_data, \
    save_extracted_opti_data, progress, GREY_OPTI_POS, RED_OPTI_ROT, GREY_OPTI_ROT, \
    RED_OPTI_POS, BOARD_OPTI_ROT, BOARD_OPTI_POS

TRIAL = "red_calib"


def main():
    df_opti = extract_coordinates_opti(TRIAL)
    save_extracted_opti_data(df_opti, TRIAL)


def fix_frame_opti(opti_data, start_frame, use_tray, use_markers):
    start = opti_data.index[start_frame]
    end = opti_data.index[start_frame + 1]
    # assert (opti_data.head_frame.iloc[start_frame] == opti_data.hand_frame.iloc[start_frame])
    # assert (opti_data.head_frame.iloc[start_frame + 1] == opti_data.hand_frame.iloc[start_frame + 1])
    missing_frames = np.linspace(start + 1, end - 1, end - start - 1).astype('int')
    for missing_frame in missing_frames:
        opti_data.loc[missing_frame] = None
        if use_markers:
            opti_data.at[missing_frame, 'marker_finger'] = opti_data.at[start, 'marker_finger']
            opti_data.at[missing_frame, 'marker_wrist'] = opti_data.at[start, 'marker_wrist']
            if use_tray:
                opti_data.at[missing_frame, 'marker_palm'] = opti_data.at[start, 'marker_palm']
    return opti_data


def handle_missing_frames_opti(opti_data, use_tray, use_markers):
    print("Interpolating missing opti frames")

    # first let's deal with frame drops (probably from dropped UDP packets)
    opti_data = opti_data.set_index('frame_wrist')
    duplicate_frames = np.where(np.diff(opti_data.index.values) == 0)[0]
    # print(len(opti_data))
    opti_data.drop(opti_data.index[duplicate_frames], inplace=True)
    # print(len(opti_data))

    assert (np.sum(np.diff(opti_data.index.values) == 0) == 0)  # this won't work if we have duplicated frame numbers
    frames_to_fix, = np.where(np.diff(opti_data.index.values) != 1)
    # print(frames_to_fix)
    for frame in frames_to_fix:
        opti_data = fix_frame_opti(opti_data, frame, use_tray, use_markers)
    progress(1)
    opti_data = opti_data.sort_index()
    opti_data.interpolate(inplace=True)
    print(f"Interpolated {len(frames_to_fix)} missing frames")
    return opti_data


def extract_coordinates_opti(key):
    print("processing opti file")
    opti_data, use_board, use_markers = load_opti_data(key)
    print("done loading opti file")

    opti_data = handle_missing_frames_opti(opti_data, use_board, use_markers)
    markers = 0
    grey_pos = opti_data[GREY_OPTI_POS].values
    red_pos = opti_data[RED_OPTI_POS].values
    grey_rot = R.from_quat(opti_data[GREY_OPTI_ROT].values).inv()
    red_rot = R.from_quat(opti_data[RED_OPTI_ROT].values).inv()
    if use_board:
        board_pos = opti_data[BOARD_OPTI_POS].values
        board_rot = R.from_quat(opti_data[BOARD_OPTI_ROT].values).inv()

    red_tip = pickle.load(open(os.path.join(DATA_ROOT, 'calibration', 'red_calib.pkl'), 'rb'))
    grey_tip = pickle.load(open(os.path.join(DATA_ROOT, 'calibration', 'grey_calib.pkl'), 'rb'))

    grey_markers_adj = grey_pos + grey_rot.inv().apply(grey_tip)
    red_markers_adj = red_pos + red_rot.inv().apply(red_tip)

    # grey_markers_adj = grey_rot.apply(grey_pos - grey_tip)
    # red_markers_adj = red_rot.apply(red_pos - red_tip)

    two_tip_dist = grey_markers_adj - red_markers_adj
    plt.figure()
    plt.plot(np.linalg.norm(two_tip_dist, axis=1))

    plt.figure()
    plt.plot(grey_markers_adj)
    plt.figure()
    plt.plot(red_markers_adj)
    # plt.figure()
    # plt.plot(board_pos)
    # plt.figure()
    # plt.plot(board_pos)
    plt.show()

    return(package_data_opti(opti_data, grey_markers_adj, red_markers_adj, board_pos, board_rot.as_quat(), markers,
                             use_board, use_markers))


def package_data_opti(opti_data, grey_markers_adj, red_markers_adj, board_pos, board_rot, markers, use_board,
                      use_markers):
    if use_board:
        data = np.concatenate((grey_markers_adj, red_markers_adj, board_pos, board_rot), axis=1)
        labels = ['g_x', 'g_y', 'g_z', 'r_x', 'r_y', 'r_z', 'board_x', 'board_y', 'board_z', 'board_qw', 'board_qx',
                  'board_qy', 'board_qz']
    else:
        data = np.concatenate((grey_markers_adj, red_markers_adj), axis=1)
        labels = ['g_x', 'g_y', 'g_z', 'g_qw', 'g_qx', 'g_qy', 'g_qz', 'r_x', 'r_y', 'r_z', 'r_qw', 'r_qx', 'r_qy',
                  'r_qz']

    if use_markers:
        data = np.concatenate((data, markers), axis=1)
        labels += [f"m{i}" for i in range(markers.shape[1])]

    concat = pd.DataFrame(data=data, columns=labels)
    return concat


if __name__ == "__main__":
    main()
