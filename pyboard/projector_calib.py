import matplotlib.pyplot as plt
import pyrealtime as prt
import numpy as np
import cv2 as cv
import math
import pickle
import pygame
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
CALIBRATION = 0


class projection_draw(prt.PyGameLayer):
    def __init__(self, *arg, **kwargs):
        super().__init__(*arg, **kwargs)

    def initialize(self):
        super().initialize()

    def draw(self):

        pygame.display.update()
        self.screen.fill((200, 200, 255))
        data = self.get_data()
        pygame.draw.circle(self.screen, (100, 0, 0), (int(data[0]), - int(data[1])), 15)
        # pygame.draw.circle(self.screen, (100, 0, 0), (1, 1), 25)
        # pygame.draw.circle(self.screen, (100, 0, 0), (1919, 1079), 25)
        # print(data)

def projectPointOnProbeTip(data, projectionMatrix):

    currentWorldPoint = np.array(data)
    currentWorldPoint = np.append(currentWorldPoint, [1])
    currentPixelPoint = np.matmul(projectionMatrix, currentWorldPoint)

    img = np.zeros((FRAME_SIZE[1], FRAME_SIZE[0]))
    img = cv.line(img, (int(np.round(currentPixelPoint[0])), 0), (int(np.round(currentPixelPoint[0])), FRAME_SIZE[1]), 1, thickeness)
    img = cv.line(img, (0, int(np.round(currentPixelPoint[1]))), (FRAME_SIZE[0], int(np.round(currentPixelPoint[1]))), 1, thickeness)

    cv.imshow("image3", img)
    k = cv.waitKey(1)
    # cv.destroyAllWindows()


def get_world_pos(data, capturedWorldPoints, imagePoints, row, col, counter):
    # image = cv.imread("checkerBoardWithCircle"+str(row) + str(col)+".jpg")
    # image = mpimg.imread("checkerBoardWithCircle" + str(row) + str(col) + ".png")
    # plt.show(image)
    # cv.imshow("image", image)
    # cv.waitKey(1)
    center = (row * (FRAME_SIZE[0] // GRID_SIZE[0]), col * (FRAME_SIZE[1] // GRID_SIZE[1]))
    bleh = row * 4 + col
    imagePoints[0:2, bleh] = center[0:2]
    print(data)
    # TODO capture the probe position
    capturedWorldPoints[0:3, row * 4 + col] = data
    return capturedWorldPoints, imagePoints


def calibrate_projector(data, checkerBoard, imagePoints, capturedWorldPoints, row, col, counter):
    # print(data)
    # for row in range(0, GRID_SIZE[0] + 1):
    #     for col in range(0, GRID_SIZE[1] + 1):
    center = (row * (FRAME_SIZE[0] // GRID_SIZE[0]), col * (FRAME_SIZE[1] // GRID_SIZE[1]))
    bleh = row * 4 + col
    imagePoints[0:2, bleh] = center[0:2]
    checkerBoardWithCircle = cv.circle(np.repeat(checkerBoard[:, :, np.newaxis], 3, axis=2), center, radius,
                                       circleColor, thickeness)

    checkerBoardWithCircle = cv.putText(checkerBoardWithCircle, text, (50, FRAME_SIZE[1] - 50),
                                        cv.FONT_HERSHEY_PLAIN, 2, textColor)
    cv.imshow("image", checkerBoardWithCircle)
    k = cv.waitKey(0)
    # cv.destroyAllWindows()
    # print(counter)
    if counter % 1 == 0:
        print(data)
        # TODO capture the probe position
        capturedWorldPoints[0:3, row * 4 + col] = data[0]
        cv.imwrite("checkerBoardWithCircle"+str(row) + str(col)+".png", 255* checkerBoardWithCircle)
        # cv.destroyAllWindows()

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

        # cv.imshow("image", self.checkerBoard)
        # cv.waitKey(0)
        # cv.destroyAllWindows()
        self.row = 0
        self.col = 0
        self.counter = 0
        self.saveWorldPoint = 0

        super().__init__(*arg, **kwargs)

    def transform(self, data):
        # print(data)
        # cv.imshow("image", self.checkerBoard)
        # cv.waitKey(0)
        # cv.destroyAllWindows()
        if not CALIBRATION:
            if not self.calib:
                self.projectionMatrix = pickle.load(open("projectionMatrix.pkl", 'rb'))
                self.capturedWorldPoints = pickle.load(open("capturedWorldPoints.pkl", 'rb'))
                # self.capturedWorldPoints = pickle.load(open("imagePoints.pkl", 'rb'))
                # print(self.capturedWorldPoints)
                self.calib = 1

        elif CALIBRATION and not self.calib:
            # print(self.counter)
            # self.counter += 1
            # capturedWorldPoints, imagePoints = calibrate_projector(data, self.checkerBoard, self.imagePoints,
            #                                                        self.capturedWorldPoints, self.row, self.col,
            #                                                        self.counter)
            if self.counter % 2400*2 == 0:
                # print("as")
                # plt.isinteractive()
                # image = plt.imread("checkerBoardWithCircle" + str(self.row) + str(self.col) + ".png")
                image = cv.imread("checkerBoardWithCircle" + str(self.row) + str(self.col) + ".png")
                cv.imshow("image", image)
                cv.waitKey(1)
                # imgplot = plt.imshow(image)
                # fig = plt.figure()
                # plt.show()
                # print("fig")
                self.saveWorldPoint = 1
            elif self.saveWorldPoint and self.counter % 1200*2 == 0:
                capturedWorldPoints, imagePoints = get_world_pos(data, self.capturedWorldPoints, self.imagePoints,
                                                                 self.row, self.col, self.counter)
                # print(data)
                self.capturedWorldPoints = capturedWorldPoints
                self.imagePoints = imagePoints
                self.saveWorldPoint = 0
                self.col += 1
                if self.col == GRID_SIZE[1] + 1:
                    self.col = 0
                    self.row += 1
                if self.row == GRID_SIZE[0] + 1:
                    self.calib = 1
                    cv.destroyAllWindows()
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
        # print(pixel)
        return pixel


class DrawingPane(prt.AggregateScatterPlotLayer):
    def __init__(self, port_in, *args, x_proj=None, y_proj=None, scroll_speed=0, **kwargs):
        super().__init__(port_in, *args, scatter_kwargs={'color': "#1f77b4", "s": 60}, **kwargs)
        self.do_clear = False
        self.clear_button = None
        self.scroll_speed = scroll_speed
        # self.colors = cm.rainbow(np.linspace(0, 1, self.buffer_size))

    def clear(self, _):
        self.do_clear = True

    def draw_empty_plot(self, ax):
        # ax_clear = ax.figure.add_axes([0.81, 0.005, 0.1, 0.075], label="clear button"+ax.get_label())
        # ax_clear = ax.figure.add_axes([0, 0, 1, 1])
        ax.margins(x=0)
        ax.margins(y=0)
        ax.axis("off")
        # self.clear_button = Button(ax_clear, 'Clear', color="#000000")
        # self.clear_button.on_clicked(self.clear)
        # ax.set_axis_off()
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['bottom'].set_visible(False)
        ax.spines['left'].set_visible(False)
        ax.get_xaxis().set_ticks([])
        ax.get_yaxis().set_ticks([])
        ax.patch.set_visible(False)

        plt.margins(x=0)
        plt.margins(y=0)
        plt.axis('off')
        plt.axis("tight")
        # ax.figure.patch.set_facecolor('black')
        # ax.figure.canvas.toolbar.pack_forget()
        return []

    def post_init(self, data):
        super().post_init(data)
        # self.series[0].set_color(self.colors)

    def transform(self, data):
        # data = np.atleast_2d(data)
        # # x = np.matmul(data, self.x_proj)
        # # y = np.matmul(data, self.y_proj)
        # xyz = np.linalg.norm(data, axis=1)
        # xz = np.linalg.norm(data[:, [0, 2]], axis=1)
        # yaw = np.arcsin(data[:, 0] / xz)
        # pitch = np.arcsin(data[:,1] / xyz)
        # data_2d = np.hstack((yaw, pitch))
        # print(data)
        data_2d = data

        self.buffer[:, :, 0] += self.scroll_speed
        super().transform(data_2d)
        if self.do_clear:
            self.do_clear = False
            self.buffer[:, :, :] = None

    def handle_signal(self, signal):
        if signal == 2:
            self.do_clear = True

    def update_fig(self, data):
        tmp = super().update_fig(data)
        return tmp

