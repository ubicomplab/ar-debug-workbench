import msvcrt
import cv2 as cv



image = cv.imread("checkerBoardWithCircle00.jpg")
cv.imshow("image", image)
k = cv.waitKey(0)

