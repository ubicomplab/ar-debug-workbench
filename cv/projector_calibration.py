import numpy as np
import cv2 as cv
import math

#size of projector frame
frameSize = [1920, 1080]
# size of checkerboard squares to project
gridSize = [4, 3]
numCaptures = (gridSize[0]+1) * (gridSize[1]+1)

# world points in homogeneous coordinates
"""
[X_1  X_2  X_3  ... X_n]
[Y_1  Y_2  Y_3  ... Y_n]
[Z_1  Z_2  Z_3  ... Z_n]
[ 1    1    1   ...  1 ]
"""
capturedWorldPoints = np.ones((4, numCaptures))

#image points in homogeneous coordinates
"""
[u_1  u_2  u_3  ... u_n]
[v_1  v_2  v_3  ... v_n]
[ 1    1    1   ...  1 ]
"""
imagePoints = np.ones((3, numCaptures))

#Projection matrix
projectionMatrix =  np.empty((3, 4))



checkerBoard = np.zeros((frameSize[1], frameSize[0]))

def makeCheckerboard(gridSize, frameSize):
    if frameSize[0] % gridSize[0] != 0:
        print("Frame width %i is not a multiple of checkerboard width %i. Use exact divsor for maximum precision." % (frameSize[0], gridSize[0]))
    
    if frameSize[1] % gridSize[1] != 0:
        print("Frame height %i is not a multiple of checkerboard height %i. Use exact divsor for maximum precision." % (frameSize[1], gridSize[1]))

    for row in range(0, np.shape(checkerBoard)[0]):
        for col in range(0, np.shape(checkerBoard)[1]):
            if ((math.floor(row / (frameSize[1] / gridSize[1]))) + (math.floor(col / (frameSize[0] / gridSize[0])))) % 2 == 0:
                    checkerBoard[row, col] = 1

    cv.imshow("image", checkerBoard)
    cv.waitKey(0)
    cv.destroyAllWindows()

def pointGuidance(gridSize, checkerBoard, imagePoints, capturedWorldPoints):

    thickeness = 2
    radius = 20
    circleColor = (1,0,0)

    text = "Please place probe tip accurately on corner circled in blue. Press any key to capture position"
    textColor = (0.5,0.5,0.5)

    for row in range(0, gridSize[0]+1):
        for col in range(0, gridSize[1]+1):
            center = ( row*(frameSize[0] // gridSize[0]),  col*(frameSize[1] // gridSize[1]))
            bleh = row*4+col
            imagePoints[0:2, bleh] = center[0:2]
            checkerBoardWithCircle = cv.circle(np.repeat(checkerBoard[:, :, np.newaxis], 3, axis=2), center, radius, circleColor, thickeness)

            checkerBoardWithCircle = cv.putText(checkerBoardWithCircle, text, (50, frameSize[1] - 50), cv.FONT_HERSHEY_PLAIN, 2, textColor)
            cv.imshow("image2", checkerBoardWithCircle)
            cv.waitKey(5)
            
            #TODO capture the probe position
            #capturedWorldPoints[0:2, row+col] = probePosition[0:2]
        
            cv.destroyAllWindows()

    capturedWorldPoints[0:3, :] = np.array(\
    [[0.29800502, 0.0061638 , 0.19329104],\
    [0.29790819, 0.00609048, 0.12417287],\
    [0.29282362, 0.00589446, 0.0649954 ],\
    [0.29282882, 0.00585762, -0.00738237],\
    #----------------------------------------
    [0.23772776, 0.00590986, 0.19536735],\
    [0.23420618, 0.0054013 , 0.12486595],\
    [0.2346742 , 0.0055742 , 0.06042208],\
    [0.22915092, 0.00530273, -0.00476075],\
    #-----------------------------------------
    [0.17455278, 0.00515153, 0.19494631],\
    [0.17370129, 0.00505166, 0.12570471],\
    [0.1713025 , 0.00490197, 0.0634917 ],\
    [0.17024334, 0.00482908, -0.0078378 ],\
    #----------------------------------------
    [0.10822128, 0.004411  , 0.1962533 ],\
    [0.10675856, 0.00411283, 0.12804918],\
    [0.10582848, 0.00404256, 0.06549262],\
    [0.10449569, 0.00389199, -0.00398948],\
    #----------------------------------------
    [0.04599235, 0.0034341 , 0.1978229 ],\
    [0.04655383, 0.00365754, 0.12727729],\
    [0.04237613, 0.00342598, 0.06747411],\
    [0.04168911, 0.00318181, -0.00282326]]).T

def getProjectionMatrix(imagePoints, capturedWorldPoints, projectionMatrix):
    projectionMatrix = np.linalg.lstsq(capturedWorldPoints.T, imagePoints.T)[0].T
    #projectionMatrix2 = np.linalg.solve(capturedWorldPoints.T, imagePoints.T).T

    print(projectionMatrix)

def projectPointOnProbeTip(projectionMatix):
    k = -1
    
    while (k == -1):
        #TODO
        #currentWorldPoint = 

        currentPixelPoint = np.matmul(projectionMatix, currentWorldPoint)

        img = np.zeros(frameSize)
        img = cv.line(img, (currentPixelPoint[0], 0), (currentPixelPoint[0], frameSize[0]), 1)
        img = cv.line(img, (0, currentPixelPoint[1]), (frameSize[1], currentPixelPoint[1]), 1)

        cv.imshow(img)
        k = cv.waitKey(1)
    
    cv.destroyAllWindows()




if __name__ == "__main__":
    makeCheckerboard(gridSize, frameSize)
    pointGuidance(gridSize, checkerBoard, imagePoints, capturedWorldPoints)
    getProjectionMatrix(imagePoints, capturedWorldPoints, projectionMatrix)
