import matplotlib.pyplot as plt
import pyrealtime as prt
import numpy as np
# import cv2 as cv
import math
import pickle
import os
import pygame
from scipy.spatial.transform import Rotation as R
import matplotlib.cm as cm
from matplotlib.widgets import Button

FRAME_SIZE = [1920, 1080]
# size of checkerboard squares to project
GRID_SIZE = [4, 3]
NUM_CAPTURES = (GRID_SIZE[0]+1) * (GRID_SIZE[1]+1)
thickeness = 2
radius = 20
circleColor = (1, 0, 0)
textColor = (0.5, 0.5, 0.5)
text = "Please place probe tip accurately on corner circled in blue. Press any key to capture position"
CALIBRATION = True
board_calib = 1
red_calib = 1


class projection_draw(prt.PyGameLayer):
    def __init__(self, *arg, **kwargs):
        super().__init__(*arg, **kwargs)

    def initialize(self):
        self.screen = pygame.display.set_mode((1920, 1080), pygame.FULLSCREEN|pygame.NOFRAME)
        super().initialize()

    def draw(self):

        pygame.display.update()
        self.screen.fill((200, 200, 255))
        data = self.get_data()
        pygame.draw.circle(self.screen, (0, 0, 0), (int(data[0]), - int(data[1])), 5)


class ProjectionCalibrate(prt.PyGameLayer):
    def __init__(self, *arg, **kwargs):
        super().__init__(*arg, **kwargs)
        self.capturedWorldPoints = np.ones((4, NUM_CAPTURES))
        self.imagePoints = np.ones((3, NUM_CAPTURES))
        # Projection matrix
        self.projectionMatrix = np.empty((3, 4))
        self.checkerBoard = np.zeros((FRAME_SIZE[1], FRAME_SIZE[0]))
        if FRAME_SIZE[0] % GRID_SIZE[0] != 0:
            print(
                "Frame width %i is not a multiple of checkerboard width %i. Use exact divsor for maximum precision." % (
                FRAME_SIZE[0], GRID_SIZE[0]))

        if FRAME_SIZE[1] % GRID_SIZE[1] != 0:
            print(
                "Frame height %i is not a multiple of checkerboard height %i. Use exact divsor for maximum precision." % (
                FRAME_SIZE[1], GRID_SIZE[1]))

        for row in range(0, np.shape(self.checkerBoard)[0]):
            for col in range(0, np.shape(self.checkerBoard)[1]):
                if ((math.floor(row / (FRAME_SIZE[1] / GRID_SIZE[1]))) + (
                math.floor(col / (FRAME_SIZE[0] / GRID_SIZE[0])))) % 2 == 0:
                    self.checkerBoard[row, col] = 1

        self.row = 0
        self.col = 0
        self.time_to_wait = 0
        self.saveWorldPoint = 0
        # self.display_surface = pygame.display.set_mode((3440, 1440), pygame.FULLSCREEN | pygame.NOFRAME)

    def initialize(self):
        self.screen = pygame.display.set_mode((3440, 1440), pygame.FULLSCREEN|pygame.NOFRAME)

        # self.screen = pygame.display.set_mode((1920, 1080))
        super().initialize()

    def draw(self):
        pygame.display.update()
        data = self.get_data()
        data = [data[0], data[1], 0]
        self.time_to_wait += 1
        if self.time_to_wait % 450 == 0:
            image = pygame.image.load(
                os.path.join("checkerBoard_images", "checkerBoardWithCircle" + str(self.row) + str(self.col) + ".png"))
            self.screen.fill((255, 255, 255))
            self.screen.blit(image, (0, 0))
            # pygame.display.update()
            self.saveWorldPoint = 1
        elif self.saveWorldPoint and self.time_to_wait % 300 == 0:
            capturedWorldPoints, imagePoints = get_world_pos(data, self.capturedWorldPoints, self.imagePoints,
                                                             self.row, self.col)
            self.capturedWorldPoints = capturedWorldPoints
            self.imagePoints = imagePoints
            self.saveWorldPoint = 0
            self.col += 1
            if self.col == GRID_SIZE[1] + 1:
                self.col = 0
                self.row += 1
            if self.row == GRID_SIZE[0] + 1:
                self.calib = 1
                # cv.destroyAllWindows()
                projectionMatrix = np.linalg.lstsq(self.capturedWorldPoints.T, self.imagePoints.T)[0].T
                self.projectionMatrix = projectionMatrix

                pickle.dump(self.projectionMatrix, open("projectionMatrix.pkl", 'wb'))
                pickle.dump(self.capturedWorldPoints, open("capturedWorldPoints.pkl", 'wb'))
                pickle.dump(self.imagePoints, open("imagePoints.pkl", 'wb'))
                print(self.projectionMatrix)
                print(self.capturedWorldPoints)

        # pygame.display.update()
        # self.screen.fill((200, 200, 255))


def get_world_pos(data, capturedWorldPoints, imagePoints, row, col):
    center = (row * (FRAME_SIZE[0] // GRID_SIZE[0]), col * (FRAME_SIZE[1] // GRID_SIZE[1]))
    bleh = row * 4 + col
    imagePoints[0:2, bleh] = center[0:2]
    print(data)
    capturedWorldPoints[0:3, row * 4 + col] = data
    return capturedWorldPoints, imagePoints


class ProjectorLayer(prt.TransformMixin, prt.ThreadLayer):
    def __init__(self, *arg, **kwargs):
        self.data = None
        self.calib = 0
        # world points in homogeneous coordinates
        """
        [X_1  X_2  X_3  ... X_n]
        [Y_1  Y_2  Y_3  ... Y_n]
        [Z_1  Z_2  Z_3  ... Z_n]
        [ 1    1    1   ...  1 ]
        """
        self.capturedWorldPoints = np.ones((4, NUM_CAPTURES))
        # image points in homogeneous coordinates
        """
        [u_1  u_2  u_3  ... u_n]
        [v_1  v_2  v_3  ... v_n]
        [ 1    1    1   ...  1 ]
        """
        self.imagePoints = np.ones((3, NUM_CAPTURES))
        # Projection matrix
        self.projectionMatrix = np.empty((3, 4))
        self.checkerBoard = np.zeros((FRAME_SIZE[1], FRAME_SIZE[0]))
        # if CALIBRATION:
        #     # self.display_surface = pygame.display.set_mode((3440, 1440), pygame.FULLSCREEN|pygame.NOFRAME)
        #     self.display_surface = pygame.display.set_mode((3440, 1440))


        if FRAME_SIZE[0] % GRID_SIZE[0] != 0:
            print(
                "Frame width %i is not a multiple of checkerboard width %i. Use exact divsor for maximum precision." % (
                FRAME_SIZE[0], GRID_SIZE[0]))

        if FRAME_SIZE[1] % GRID_SIZE[1] != 0:
            print(
                "Frame height %i is not a multiple of checkerboard height %i. Use exact divsor for maximum precision." % (
                FRAME_SIZE[1], GRID_SIZE[1]))

        for row in range(0, np.shape(self.checkerBoard)[0]):
            for col in range(0, np.shape(self.checkerBoard)[1]):
                if ((math.floor(row / (FRAME_SIZE[1] / GRID_SIZE[1]))) + (
                math.floor(col / (FRAME_SIZE[0] / GRID_SIZE[0])))) % 2 == 0:
                    self.checkerBoard[row, col] = 1

        self.row = 0
        self.col = 0
        self.time_to_wait = 0
        self.saveWorldPoint = 0

        super().__init__(*arg, **kwargs)

    def transform(self, data):
        data = [data[0], data[1], 0]
        # print(data)
        if not CALIBRATION:
            if not self.calib:
                self.projectionMatrix = pickle.load(open("projectionMatrix.pkl", 'rb'))
                self.capturedWorldPoints = pickle.load(open("capturedWorldPoints.pkl", 'rb'))
                # self.capturedWorldPoints = pickle.load(open("imagePoints.pkl", 'rb'))
                self.calib = 1

        elif CALIBRATION and not self.calib:
            self.time_to_wait += 1
            if self.time_to_wait % 15 == 0:
                image = pygame.image.load(os.path.join("checkerBoard_images", "checkerBoardWithCircle" + str(self.row) + str(self.col) + ".png"))
                # self.display_surface.fill((255, 255, 255))
                # self.display_surface.blit(image, (0, 0))
                pygame.display.update()
                self.saveWorldPoint = 1
            elif self.saveWorldPoint and self.time_to_wait % 12 == 0:
                capturedWorldPoints, imagePoints = get_world_pos(data, self.capturedWorldPoints, self.imagePoints,
                                                                 self.row, self.col)
                self.capturedWorldPoints = capturedWorldPoints
                self.imagePoints = imagePoints
                self.saveWorldPoint = 0
                self.col += 1
                if self.col == GRID_SIZE[1] + 1:
                    self.col = 0
                    self.row += 1
                if self.row == GRID_SIZE[0] + 1:
                    self.calib = 1
                    # cv.destroyAllWindows()
                    projectionMatrix = np.linalg.lstsq(self.capturedWorldPoints.T, self.imagePoints.T)[0].T
                    self.projectionMatrix = projectionMatrix

                    pickle.dump(self.projectionMatrix, open("projectionMatrix.pkl", 'wb'))
                    pickle.dump(self.capturedWorldPoints, open("capturedWorldPoints.pkl", 'wb'))
                    pickle.dump(self.imagePoints, open("imagePoints.pkl", 'wb'))
                    print(self.projectionMatrix)
                    print(self.capturedWorldPoints)

        currentWorldPoint = np.array(data)
        currentWorldPoint = np.append(currentWorldPoint, [1])
        currentPixelPoint = np.matmul(self.projectionMatrix, currentWorldPoint)
        pixel = np.hstack((currentPixelPoint[0], -currentPixelPoint[1]))
        return pixel


@prt.transformer
def get_red_top(data):
    data = data['red']['pos']
    return data


@prt.transformer
def get_grey_top(data):
    data = data['grey']['pos']
    return data

@prt.transformer
def get_red_tip(data):
    return data[0:3]


@prt.transformer
def get_gray_probe_data(data):
    return data[3:6]


@prt.transformer
def get_board_position(data):
    return data[6:9]


@prt.transformer
def get_board_rot(data):
    data = R.from_quat(data['board']['rot'])

    return data.as_euler('zxy', degrees=True)


def get_red_pixel_point(data, calibrate=False):
    global CALIBRATION
    CALIBRATION = calibrate
    data = get_red_tip(data)
    current_pixel_point = ProjectorLayer(data, name="projector")
    return current_pixel_point


def get_pixel_point(data, marker="GREY"):
    if marker == "GREY_TIP":
        data = get_gray_probe_data(data)
    elif marker == "GREY_TOP":
        data = get_grey_top(data)
    elif marker == "RED_TOP":
        data = get_red_top(data)
    elif marker == "RED_TIP":
        data = get_red_tip(data)
    elif marker == "BOARD":
        data = get_board_position(data)

    pixel = find_pixel_point(data)
    return pixel


@prt.transformer
def find_pixel_point(data):
    global projectionMatrix
    data = [data[0], data[1], 0]
    projectionMatrix = pickle.load(open("projectionMatrix.pkl", 'rb'))
    currentWorldPoint = np.array(data)
    currentWorldPoint = np.append(currentWorldPoint, [1])
    currentPixelPoint = np.matmul(projectionMatrix, currentWorldPoint)
    pixel = np.hstack((currentPixelPoint[0], -currentPixelPoint[1]))
    return pixel

