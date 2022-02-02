import pickle
from scipy.sparse.linalg import lsqr
import numpy as np
from scipy.spatial.transform import Rotation as R
from utils import load_opti_data, progress, GREY_OPTI_POS, RED_OPTI_ROT, GREY_OPTI_ROT, RED_OPTI_POS

CALIBRATION_KEY = "red_calib"


def main():
    tip = calibrate(CALIBRATION_KEY)
    pickle.dump(tip, open(CALIBRATION_KEY+".pkl", 'wb'))


def fix_frame_opti(opti_data, start_frame, use_palm, use_markers):
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
            if use_palm:
                opti_data.at[missing_frame, 'marker_palm'] = opti_data.at[start, 'marker_palm']
    return opti_data


def handle_missing_frames_opti(opti_data, use_palm, use_markers):
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
        opti_data = fix_frame_opti(opti_data, frame, use_palm, use_markers)
    progress(1)
    opti_data = opti_data.sort_index()
    opti_data.interpolate(inplace=True)
    print(f"Interpolated {len(frames_to_fix)} missing frames")
    return opti_data


def find_tip_pose(pos, rot):
    pos = pos[::30]
    rot = rot[::30]
    size_of_eq = int(len(pos) * (len(pos) - 1) / 2)
    rotation = []
    position = []
    for index in range(len(pos)):
        for index2 in range(index+1, len(pos)):
            # rotation += R.from_dcm(rot[index].as_dcm() - rot[index2].as_dcm())
            rotation.append(rot[index].as_dcm() - rot[index2].as_dcm())
            position += [pos[index2] - pos[index]]
    position = np.reshape(position, (size_of_eq * 3, 1))
    rotation = np.reshape(rotation, (size_of_eq * 3, 3))

    # tip, res, rank, s = np.linalg.lstsq(rotation, position)
    tip, istop, itn, r1norm = lsqr(rotation, position)[:4]
    return tip


def calibrate(key):
    print("processing opti file")
    opti_data, use_palm, use_markers = load_opti_data(key)
    print("done loading opti file")

    opti_data = handle_missing_frames_opti(opti_data, use_palm, use_markers)
    grey_pos = opti_data[GREY_OPTI_POS].values
    red_pos = opti_data[RED_OPTI_POS].values
    grey_rot = R.from_quat(opti_data[GREY_OPTI_ROT].values)
    red_rot = R.from_quat(opti_data[RED_OPTI_ROT].values)

    if CALIBRATION_KEY == "red_calib":
        tip = find_tip_pose(red_pos, red_rot)
    else:
        tip = find_tip_pose(grey_pos, grey_rot)

    print(tip)
    return tip


if __name__ == "__main__":
    main()
