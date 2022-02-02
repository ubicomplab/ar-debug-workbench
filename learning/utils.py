import os

import re
import sys

from settings import *
import pandas as pd
import pickle
import numpy as np
import enum
from enum import Enum, auto
from numpy import array

NUM_RX_COILS = 3  # each coil has 3 axes
NUM_TX_COILS = 3  # each coil has 1 axis

NUM_TX_USED = 3
NUM_RX_USED = 1

OSR = 256
BYTES_PER_SAMPLE = 2

OPTI_POS_NAMES = ['x', 'y', 'z']
OPTI_ROT_NAMES = ['qx', 'qy', 'qz', 'qw'] # for opti
# OPTI_ROT_NAMES = ['qw', 'qx', 'qy', 'qz'] # for vicon # DO NO USE THIS BECAUSE IT WILL BREAK ROTATION.FROM_QUAT
OPTI_NAMES = OPTI_POS_NAMES + OPTI_ROT_NAMES


POS = ['x', 'y', 'z']
# ROT = ['qw', 'qx', 'qy', 'qz']  # Vicon!

ROT = ['qx', 'qy', 'qz', 'qw']  # OptiTrack!
ROT_STANDARD = ['qw', 'qx', 'qy', 'qz']  # standard way rotation data is being saved.

def make_all_names(prefix):
    def make_names(prefix, suffix):
        return [prefix + '_' + x for x in suffix]
    return make_names(prefix, OPTI_NAMES), make_names(prefix, OPTI_POS_NAMES), make_names(prefix, OPTI_ROT_NAMES), make_names(prefix, ROT_STANDARD)


GREY_OPTI, GREY_OPTI_POS, GREY_OPTI_ROT, GREY_ROT = make_all_names('grey')
RED_OPTI, RED_OPTI_POS, RED_OPTI_ROT, RED_ROT = make_all_names('red')
TRAY_OPTI, TRAY_OPTI_POS, TRAY_OPTI_ROT, TRAY_ROT = make_all_names('tray')
BOARD_OPTI, BOARD_OPTI_POS, BOARD_OPTI_ROT, BOARD_ROT = make_all_names('board')


MAG_RAW_NAMES_1 = [f't{tx+1}r1{axis}' for tx in range(NUM_TX_COILS) for axis in 'xyz']
MAG_RAW_NAMES_2 = [f't{tx+1}r2{axis}' for tx in range(NUM_TX_COILS) for axis in 'xyz']
MAG_RAW_NAMES_3 = [f't{tx+1}r3{axis}' for tx in range(NUM_TX_COILS) for axis in 'xyz']
# MAG_RAW_NAMES = MAG_RAW_NAMES_1 + (MAG_RAW_NAMES_2 if NUM_RX_COILS >= 2 else []) + (MAG_RAW_NAMES_3 if NUM_RX_COILS >= 3 else [])
MAG_RAW_NAMES = MAG_RAW_NAMES_1
ALL_MAG_RAW_NAMES = [MAG_RAW_NAMES_1, MAG_RAW_NAMES_2, MAG_RAW_NAMES_3]

MAG_D_NAMES = ['md_'+str(x) for x in range(9)]
MAG_FILT_NAMES = ['m_filt_'+str(x) for x in range(9)]
# COLUMN_NAMES = ['time'] + MAG_RAW_NAMES + MAG_FILT_NAMES + HEAD_OPTI + HAND_OPTI
SEGMENTED_COLUMN_NAMES = ['time'] + MAG_RAW_NAMES

class S(Enum):
    DATA_START = auto()
    DATA_END = auto()


def get_recordings():
    file = os.path.join(RECORDINGS_DIR, "recordings.txt")
    return pd.read_csv(file)


def get_file_id(key):
    files = get_recordings()
    entry = files[files.key == key]
    assert len(entry) == 1, "entry %s not found" % key
    return entry.file_id.iloc[0]


def get_mag_file(key):
    file_id = get_file_id(key)
    return os.path.join(RECORDINGS_DIR, "mag_%s.txt" % file_id)


def get_opti_file(key):
    file_id = get_file_id(key)
    return os.path.join(RECORDINGS_DIR, "natnet_%s.txt" % file_id)


def load_file_by_id(file_id):
    file = os.path.join(RECORDINGS_DIR, "combo_%s.txt" % file_id)
    return pd.read_csv(file, header=None, names=COLUMN_NAMES)


def load_file_by_key(key):
    file_id = get_file_id(key)
    return load_file_by_id(file_id), load_extra_data(key)


def make_extra_file_path(key):
    return os.path.join(RECORDINGS_DIR, "extra_%s.pkl" % key)


def get_recordings_native():
    file = os.path.join(RECORDINGS_NATIVE_DIR, "recordings.txt")

    data = pd.read_csv(file)
    return data


def load_opti_metadata(key):
    files = get_recordings()
    entry = files[files.key == key]
    assert len(entry) == 1, "entry %s not found" % key
    file_id = entry.file_id.iloc[0]
    file = os.path.join(RECORDINGS_DIR, "opti_%s.txt" % file_id)

    include_tray = entry.use_tray.iloc[0]
    include_markers = entry.use_markers.iloc[0]

    return file, include_tray, include_markers


def load_opti_data(key):
    file, include_board, include_markers = load_opti_metadata(key)
    if os.path.exists(file+".pkl"):
        df = pickle.load(open(file+".pkl", 'rb'))
        return df, include_board, include_markers

    # columns = ['frame_wrist'] + [f"wrist_{x}" for x in OPTI_NAMES] + ['frame_finger'] + \
    #           [f"finger_{x}" for x in OPTI_NAMES] #+ ['frame_palm'] + [f"palm_{x}" for x in OPTI_NAMES]
    columns = ['frame_wrist'] + [f"grey_{x}" for x in OPTI_NAMES] + \
              [f"red_{x}" for x in OPTI_NAMES]
    if include_board:
        columns += [f"board_{x}" for x in OPTI_NAMES]
    if include_markers:
        columns += ['marker_grey', 'marker_red']
        if include_board:
            columns += ['marker_tray']
    temp = []

    def extract(data):
        if len(data) == 3:
            return data[0], data[1], data[2]
        else:
            return data[0], data[1], data[2], data[3]

    def extract_body(body_data):
        return extract(body_data['pos']) + extract(body_data['rot'])

    with open(file, 'rb') as f:
        size = os.fstat(f.fileno()).st_size
        for i, line in enumerate(f):
            if i % 1000 == 0:
                progress(f.tell() / size)
            m = eval(line)

            if include_board:
                a = [m['frame_num'], *[i for i in (extract_body(m['grey']) + extract_body(m['red']) + extract_body(m['board']))]]
            else:
                a = [m['frame_num'], *[i for i in (extract_body(m['grey']) + extract_body(m['red']))]]
            if include_markers:
                a += m['markers'][b'grey'], m['markers'][b'red']
                if include_board:
                    a += m['markers'][b'board']
            temp.append(a)
    progress(1)
    df = pd.DataFrame(temp, columns=columns)
    pickle.dump(df, open(file+".pkl", 'wb'))

    return df, include_board, include_markers


def load_vicon_data(key):
    print("loading vicon file")
    files = get_recordings_native()
    entry = files[files.key == key]
    assert len(entry) == 1, "entry %s not found" % key
    file_id = entry.file_id.iloc[0]
    file = os.path.join(RECORDINGS_NATIVE_DIR, "vicon_%s.txt" % file_id)
    data = np.loadtxt(file, delimiter=',')

    columns = ['time', 'frame', 'head_frame'] + [f"head_{x}" for x in OPTI_NAMES] + ['hand_frame'] + [f"mag_controller_v9_{x}" for x in OPTI_NAMES]
    df = pd.DataFrame(data, columns=columns)
    df["frame"] = df['frame'].astype('int')
    df["head_frame"] = df['head_frame'].astype('int')
    df["hand_frame"] = df['hand_frame'].astype('int')

    return df


def load_native_data(key):

    def convert_to_volts(data):
        center = 0x800000 >> int(((256 / OSR) - 1) * 3)
        if BYTES_PER_SAMPLE == 2:
            center = center >> 8
        return (data - np.array(center)) / (np.array(center) - 1) * -1.2

    files = get_recordings_native()
    entry = files[files.key == key]
    assert len(entry) == 1, "entry %s not found" % key
    file_id = entry.file_id.iloc[0]
    file = os.path.join(RECORDINGS_NATIVE_DIR, "native_data_%s.txt" % file_id)

    data = np.loadtxt(file, delimiter=',')
    frame_numbers = data[:, 0:2]
    return -np.sign(data[:, 2:]) * convert_to_volts(np.abs(data[:, 2:])), frame_numbers  # TODO: the -1.2 here fixes a bug in cmagnets
    #
    # all_data = []
    # all_frame = []
    # with open(file, 'rb') as f:
    #     for line in f:
    #         frame_split = line.find(b',')
    #         frame = eval(line[0:frame_split].decode('utf-8'))
    #         data = list(eval(line[frame_split+1:].decode('utf-8')))
    #         all_frame.append(frame)
    #         all_data.append(convert_to_volts(data).tolist())
    #
    # return np.array(all_data)


def load_raw_mag(key):
    files = get_recordings()
    entry = files[files.key == key]
    assert len(entry) == 1, "entry %s not found" % key
    file_id = entry.file_id.iloc[0]

    file = os.path.join(RECORDINGS_DIR, "mag_%s.txt" % file_id)

    if os.path.exists(file.replace(".txt", ".pkl")):
        with open(file.replace(".txt", ".pkl"), 'rb') as f:
            result = pickle.load(f)
    else:
        all_data = []
        with open(file, 'rb') as f:
            size = os.fstat(f.fileno()).st_size
            for i, line in enumerate(f):
                if i % 1000 == 0:
                    progress(f.tell() / size)
                # time_split = line.find(b',')
                data = eval(line.decode('utf-8'))
                all_data += data
            progress(1)

        result = np.array(all_data)
        pickle.dump(result, open(file.replace(".txt", ".pkl"), 'wb'))

    if result.shape[1] == 11:
        # has frame numbers
        return result[:, 2:], result[:, 0:2]
    else:
        # no frame numbers
        return result, None


def load_buffer_data(key):
    files = get_recordings()
    entry = files[files.key == key]
    assert len(entry) == 1, "entry %s not found" % key
    file_id = entry.file_id.iloc[0]

    file = os.path.join(RECORDINGS_DIR, "mag_%s.txt" % file_id)

    all_data = []
    with open(file, 'rb') as f:
        for line in f:
            time_split = line.find(b',')
            data = eval(line[time_split+1:].decode('utf-8'))
            all_data += data

    return np.array(all_data)


REGEX_SEG = re.compile(r"([-\d\.e]+),\[([-\d\.e]+), ([-\d\.e]+), ([-\d\.e]+), ([-\d\.e]+), ([-\d\.e]+), ([-\d\.e]+), ([-\d\.e]+), ([-\d\.e]+), ([-\d\.e]+)\]")
def load_online_segmented_data(key):
    files = get_recordings()
    entry = files[files.key == key]
    assert len(entry) == 1, "entry %s not found" % key
    file_id = entry.file_id.iloc[0]

    file = os.path.join(RECORDINGS_DIR, "mag_%s.txt" % file_id)

    df = []
    with open(file, 'rb') as f:
        for line in f:
            row = {}
            m = REGEX_SEG.search(line.decode('utf-8'))
            try:
                row["time"] = float(m.group(1))
            except:
                return pd.read_csv(file, header=None, names=["time"] + MAG_RAW_NAMES)
            for i in range(9):
                row[MAG_RAW_NAMES[i]] = float(m.group(i+2))

            df.append(row)

        return pd.DataFrame(df)


def load_extra_data(key):
    try:
        with open(make_extra_file_path(key), 'rb') as f:
            return pickle.load(f)
    except:
        print("No pickle file...")
        return {}


def save_segmented_data(data, key,  variant=""):
    file = get_segmented_file(key, variant)
    np.savetxt(file, data)


def save_mean_segmented_data(data, key,  variant=""):
    file = get_mean_segmented_file(key, variant)
    np.savetxt(file, data)


def load_segmented_data(key,  variant=""):
    file = get_segmented_file(key, variant)
    return np.loadtxt(file)


def load_results(key,  variant=""):
    file = get_results_file(key, variant)
    data = np.loadtxt(file, delimiter=',')
    pos_test = data[:, 0:3]
    pos_test_pred = data[:, 3:]
    return pos_test, pos_test_pred


def save_extra_data(key, data):
    with open(make_extra_file_path(key), 'wb') as f:
        pickle.dump(data, f)


# def save_data(data, key, variant="", norm_data=None):
#     file = get_processed_file(key, variant)
#     data = data.fillna(0)
#     data.to_csv(file, header=True, index=True)
#     if norm_data is not None:
#         file = get_normdata_file(key, variant)
#         pickle.dump(norm_data, open(file, 'wb'))
def save_join_angle(features, key, variant=""):
    file = get_jointAngle_file(key, variant)
    np.savetxt(file, features)


def save_preds_unity(data, key, variant=""):
    file = get_pred_unit_file(key, variant)
    np.savetxt(file, data)


def save_tabfinder(data, key, variant=""):
    file = get_tab_file(key, variant)
    np.savetxt(file, data)


def save_hand_model(data, key, variant=""):
    file = get_hand_model_file(key, variant)
    np.savetxt(file, data)

def save_data(features, pos, rot, key, variant=""):
    all_data = np.hstack((features, pos, rot))
    file = get_processed_file(key, variant)
    np.savetxt(file, all_data)


def load_data(key, variant=""):
    file = get_processed_file(key, variant)
    data = pd.read_csv(file, index_col=0, header=0)
    return data


def load_norm_data(key, variant):
    file = get_normdata_file(key, variant)
    return pickle.load(open(file, 'rb'))


def save_extracted_data(data, key):
    file = get_extracted_file(key)
    data.to_csv(file, header=True, index=False)


def save_extracted_opti_data(data, key):
    file = ensure_dir(get_extracted_opti_file(key))
    data.to_csv(file, header=True, index=False)
    with open(file.replace('.csv', '.pkl'), 'wb') as f:
        pickle.dump(data, f)


def save_extracted_vicon_data(data, key):
    file = get_extracted_vicon_file(key)
    data.to_csv(file, header=True, index=False)


def load_extracted_data(key):
    file = get_extracted_file(key)
    return pd.read_csv(file, header=0)


def load_extracted_opti_data(key):

    file = get_extracted_opti_file(key)

    with open(file.replace('.csv', '.pkl'), 'rb') as f:
        return pickle.load(f)

    # return pd.read_csv(file, header=0)


def load_extracted_vicon_data(key):
    file = get_extracted_vicon_file(key)
    return pd.read_csv(file, header=0)


def save_resampled_data(mag_data, pos, rot, markers, wrist_pos, wrist_rot, key, variant=""):
    all_data = np.hstack((mag_data, pos, rot, wrist_pos, wrist_rot, markers))
    file = get_resampled_file(key, variant)
    np.savetxt(file, all_data)#, fmt='%.18e %.18e %.18e %.18e %.18e %.18e %.18e %.18e %.18e %.18e %.18e %.18e %.18e "%s"')

    with open(file.replace('.csv', '.pkl'), 'wb') as f:
        pickle.dump(all_data, f)


def load_jointAngle_data(key, variant=""):
    file = get_jointAngle_file(key, variant)
    all_data = np.loadtxt(file)
    return all_data


def load_pos_pred(key, variant=""):
    file = get_pred_file(key, variant)
    return pd.read_csv(file, header=0)


def load_resampled_data(key, variant="", raw=False):

    file = get_resampled_file(key, variant)
    with open(file.replace('.csv', '.pkl'), 'rb') as f:
        all_data = pickle.load(f)
    # all_data = np.loadtxt(file)
    if raw:
        return all_data
    else:
        mag_data = all_data[:, 0:9]
        pos = all_data[:, 9:12]
        rot = all_data[:, 12:16]
        markers = all_data[:, 16:]
        return mag_data, pos, rot, markers


def save_data_rnn(data, key):
    file = get_processed_file("rnn_"+key)
    index = np.array(list(range(len(data))))
    np.savetxt(file, np.hstack((np.atleast_2d(index).T, data)), delimiter=',')


def get_jointAngle_file(key, variant=""):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "jointAngle_%s_%s.csv" % (variant, key))


def get_processed_file(key, variant=""):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "processed_%s_%s.csv" % (variant, key))


def get_hand_model_file(key, variant=""):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "handModel_%s_%s.csv" % (variant, key))


def get_pred_file(key, variant=""):
    return os.path.join(PREDICTION_MATLAB_DIR, "jointAngle_to_pos%s_%s.csv" % (variant, key))


def get_pred_unit_file(key, variant=""):
    return os.path.join(PREDICTION_MATLAB_DIR, "jointAngle_to_pos_unity%s_%s.csv" % (variant, key))


def get_tab_file(key, variant=""):
    return os.path.join(TABFINDER_DIR, "tabfinder%s_%s.csv" % (variant, key))


def get_normdata_file(key, variant):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "normdata_%s_%s.pkl" % (variant, key))


def get_extracted_file(key):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "extracted_%s.csv" % key)


def get_extracted_opti_file(key):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "extracted_opti_%s.csv" % key)


def get_extracted_vicon_file(key):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "extracted_vicon_%s.csv" % key)


def get_resampled_file(key, variant=""):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "resampled_%s_%s.csv" % (variant, key))


def get_segmented_file(key, variant=""):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "segmented_%s_%s.csv" % (variant, key))


def get_results_file(key, variant=""):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "results_%s_%s.csv" % (variant, key))


def get_mean_segmented_file(key, variant=""):
    return os.path.join(PROCESSED_RECORDINGS_DIR, "mean_%s_%s.csv" % (variant, key))


def save_predictions(key, dataset, preds):
    file = os.path.join(PREDICTIONS_DIR, "predictions_%s_%s.txt" % (key, dataset))
    np.savetxt(file, preds)


def load_predictions(key, dataset):
    file = os.path.join(PREDICTIONS_DIR, "predictions_%s_%s.txt" % (key, dataset))
    return np.loadtxt(file)


def progress(val):
    sys.stdout.write('\r')
    sys.stdout.write("[%-80s] %d%%" % ('=' * int(val * 80), val*100))
    sys.stdout.flush()
    if val == 1:
        print()


def ensure_dir(path):
    head, tail = os.path.split(path)
    root, ext = os.path.split(tail)
    if len(ext) == 0:
        dir = path
    else:
        dir = head
    if not os.path.exists(dir):
        print("Creating", dir)
        os.makedirs(dir)
    return path