
import os
try:
    from local_settings import *
except:
    DATA_ROOT = r'D:\board_viz_data'

RECORDINGS_DIR = os.path.join(DATA_ROOT, "recordings")
RECORDINGS_NATIVE_DIR = os.path.join(DATA_ROOT, "recordings_native")
# RECORDINGS_NATIVE_DIR = os.path.join(DATA_ROOT, "recordings_interference")
PROCESSED_RECORDINGS_DIR = os.path.join(DATA_ROOT, "processed")
PREDICTIONS_DIR = os.path.join(DATA_ROOT, "predictions")
CALIBRATION_DIR = os.path.join(DATA_ROOT, "rigid_body_calibration\hand\markers_18_12_05_19_23_00.txt")
PREDICTION_MATLAB_DIR = os.path.join(DATA_ROOT, "MATLAB")
TABFINDER_DIR = os.path.join(DATA_ROOT, "tap_finder")


