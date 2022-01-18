import socket
import struct
from threading import Thread, Event


def trace(*args):
    pass
    # print("".join(map(str, args)))


# Create structs for reading various object types to speed up parsing.
Vector3 = struct.Struct('<fff')
Quaternion = struct.Struct('<ffff')
FloatValue = struct.Struct('<f')
DoubleValue = struct.Struct('<d')


class RigidBody():
    def __init__(self, name, id, parentID, timestamp):
        self.name = name
        self.id = id
        self.parentID = parentID
        self.timestamp = timestamp

class NatNetClient:
    def __init__(self):
        # Change this value to the IP address of the NatNet server.
        self.serverIPAddress = "127.0.0.1"

        # This should match the multicast address listed in Motive's streaming settings.
        self.multicastAddress = "239.255.42.99"

        # NatNet Command channel
        self.commandPort = 1510

        # NatNet Data channel
        self.dataPort = 1511

        # Set this to a callback method of your choice to receive per-rigid-body data at each frame.
        self.rigidBodyListener = None
        self.newFrameListener = None

        # NatNet stream version. This will be updated to the actual version the server is using during initialization.
        self.__natNetStreamVersion = (3, 0, 0, 0)

        self._waiting_on_cmd = None
        self.wait_event = Event()

        self.rigid_bodies = {}
        self.rigid_body_listeners = {}
        self.data_callback = None

    # Client/server message ids
    NAT_PING = 0
    NAT_PINGRESPONSE = 1
    NAT_REQUEST = 2
    NAT_RESPONSE = 3
    NAT_REQUEST_MODELDEF = 4
    NAT_MODELDEF = 5
    NAT_REQUEST_FRAMEOFDATA = 6
    NAT_FRAMEOFDATA = 7
    NAT_MESSAGESTRING = 8
    NAT_DISCONNECT = 9
    NAT_UNRECOGNIZED_REQUEST = 100

    # Create a data socket to attach to the NatNet stream
    def __createDataSocket(self, port):
        result = socket.socket(socket.AF_INET,  # Internet
                               socket.SOCK_DGRAM,
                               socket.IPPROTO_UDP)  # UDP
        result.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        result.bind(('127.0.0.1', port))

        mreq = struct.pack("4sl", socket.inet_aton(self.multicastAddress), socket.INADDR_ANY)
        result.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        return result

    # Create a command socket to attach to the NatNet stream
    def __createCommandSocket(self):
        result = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        result.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        result.bind(('127.0.0.1', 0))
        result.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

        return result

    # Unpack a rigid body object from a data packet
    def __unpackRigidBody(self, data, frame_num=None):
        offset = 0

        # ID (4 bytes)
        id = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        trace("ID:", id)

        # Position and orientation
        pos = Vector3.unpack(data[offset:offset + 12])
        offset += 12
        trace("\tPosition:", pos[0], ",", pos[1], ",", pos[2])
        rot = Quaternion.unpack(data[offset:offset + 16])
        offset += 16
        trace("\tOrientation:", rot[0], ",", rot[1], ",", rot[2], ",", rot[3])

        # Send information to any listener.
        if self.rigidBodyListener is not None:
            self.rigidBodyListener(id, pos, rot)

        # RB Marker Data ( Before version 3.0.  After Version 3.0 Marker data is in description )
        if (self.__natNetStreamVersion[0] < 3):
            # Marker count (4 bytes)
            markerCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4
            markerCountRange = range(0, markerCount)
            trace("\tMarker Count:", markerCount)

            # Marker positions
            for i in markerCountRange:
                pos = Vector3.unpack(data[offset:offset + 12])
                offset += 12
                trace("\tMarker", i, ":", pos[0], ",", pos[1], ",", pos[2])

            if (self.__natNetStreamVersion[0] >= 2):
                # Marker ID's
                for i in markerCountRange:
                    id = int.from_bytes(data[offset:offset + 4], byteorder='little')
                    offset += 4
                    trace("\tMarker ID", i, ":", id)

                # Marker sizes
                for i in markerCountRange:
                    size = FloatValue.unpack(data[offset:offset + 4])
                    offset += 4
                    trace("\tMarker Size", i, ":", size[0])

        # Skip padding inserted by the server
        # offset += 4
        # Eric Whitmire: Removed this line ^

        if (self.__natNetStreamVersion[0] >= 2):
            markerError, = FloatValue.unpack(data[offset:offset + 4])
            offset += 4
            trace("\tMarker Error:", markerError)

        # Version 2.6 and later
        if (((self.__natNetStreamVersion[0] == 2) and (self.__natNetStreamVersion[1] >= 6)) or
                self.__natNetStreamVersion[0] > 2 or self.__natNetStreamVersion[0] == 0):
            param, = struct.unpack('h', data[offset:offset + 2])
            trackingValid = (param & 0x01) != 0
            offset += 2
            trace("\tTracking Valid:", 'True' if trackingValid else 'False')
        if id in self.rigid_body_listeners:
            self.rigid_body_listeners[id](id, frame_num, pos, rot)
        return offset, id, pos, rot

    # Unpack a skeleton object from a data packet
    def __unpackSkeleton(self, data):
        offset = 0

        id = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        trace("ID:", id)

        rigidBodyCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        trace("Rigid Body Count:", rigidBodyCount)
        for j in range(0, rigidBodyCount):
            offset += self.__unpackRigidBody(data[offset:])

        return offset

    # Unpack data from a motion capture frame message
    def __unpackMocapData(self, data):
        trace("Begin MoCap Frame\n-----------------\n")

        data = memoryview(data)
        offset = 0

        # Frame number (4 bytes)
        frameNumber = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        trace("Frame #:", frameNumber)

        # Marker set count (4 bytes)
        markerSetCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        trace("Marker Set Count:", markerSetCount)

        all_markers = {}
        for i in range(0, markerSetCount):
            # Model name
            modelName, separator, remainder = bytes(data[offset:]).partition(b'\0')
            offset += len(modelName) + 1
            trace("Model Name:", modelName.decode('utf-8'))

            # Marker count (4 bytes)
            markerCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4
            trace("Marker Count:", markerCount)
            markers = []
            for j in range(0, markerCount):
                pos = Vector3.unpack(data[offset:offset + 12])
                offset += 12
                # trace( "\tMarker", j, ":", pos[0],",", pos[1],",", pos[2] )
                markers.append(pos)
            all_markers[modelName] = markers


        # Unlabeled markers count (4 bytes)
        unlabeledMarkersCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        trace("Unlabeled Markers Count:", unlabeledMarkersCount)

        for i in range(0, unlabeledMarkersCount):
            pos = Vector3.unpack(data[offset:offset + 12])
            offset += 12
            trace("\tMarker", i, ":", pos[0], ",", pos[1], ",", pos[2])

        # Rigid body count (4 bytes)
        rigidBodyCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        trace("Rigid Body Count:", rigidBodyCount)

        rigid_bodies = {}
        for i in range(0, rigidBodyCount):
            rb_offset, id, pos, rot = self.__unpackRigidBody(data[offset:], frame_num=frameNumber)
            rigid_bodies[id] = (pos, rot)
            offset += rb_offset


        # Version 2.1 and later
        skeletonCount = 0
        if ((self.__natNetStreamVersion[0] == 2 and self.__natNetStreamVersion[1] > 0) or self.__natNetStreamVersion[
            0] > 2):
            skeletonCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4
            trace("Skeleton Count:", skeletonCount)
            for i in range(0, skeletonCount):
                offset += self.__unpackSkeleton(data[offset:])

        # Labeled markers (Version 2.3 and later)
        labeledMarkerCount = 0
        unlabled_markers = {}
        if ((self.__natNetStreamVersion[0] == 2 and self.__natNetStreamVersion[1] > 3) or self.__natNetStreamVersion[
            0] > 2):
            labeledMarkerCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4
            trace("Labeled Marker Count:", labeledMarkerCount)
            for i in range(0, labeledMarkerCount):
                id = int.from_bytes(data[offset:offset + 4], byteorder='little')
                offset += 4
                pos = Vector3.unpack(data[offset:offset + 12])
                offset += 12
                size = FloatValue.unpack(data[offset:offset + 4])
                offset += 4
                unlabled_markers[id] = pos
                # Version 2.6 and later
                if ((self.__natNetStreamVersion[0] == 2 and self.__natNetStreamVersion[1] >= 6) or
                        self.__natNetStreamVersion[0] > 2):
                    param, = struct.unpack('h', data[offset:offset + 2])
                    offset += 2
                    occluded = (param & 0x01) != 0
                    pointCloudSolved = (param & 0x02) != 0
                    modelSolved = (param & 0x04) != 0

                # Version 3.0 and later
                if ((self.__natNetStreamVersion[0] >= 3)):
                    residual, = FloatValue.unpack(data[offset:offset + 4])
                    offset += 4
                    trace("Residual:", residual)

        # Force Plate data (version 2.9 and later)
        if ((self.__natNetStreamVersion[0] == 2 and self.__natNetStreamVersion[1] >= 9) or self.__natNetStreamVersion[
            0] > 2):
            forcePlateCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4
            trace("Force Plate Count:", forcePlateCount)
            for i in range(0, forcePlateCount):
                # ID
                forcePlateID = int.from_bytes(data[offset:offset + 4], byteorder='little')
                offset += 4
                trace("Force Plate", i, ":", forcePlateID)

                # Channel Count
                forcePlateChannelCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
                offset += 4

                # Channel Data
                for j in range(0, forcePlateChannelCount):
                    trace("\tChannel", j, ":", forcePlateID)
                    forcePlateChannelFrameCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
                    offset += 4
                    for k in range(0, forcePlateChannelFrameCount):
                        forcePlateChannelVal = int.from_bytes(data[offset:offset + 4], byteorder='little')
                        offset += 4
                        trace("\t\t", forcePlateChannelVal)

        if self.data_callback:
            self.data_callback(frameNumber, rigid_bodies, all_markers)
            # self.data_callback(frameNumber, rigid_bodies, all_markers, unlabled_markers)

        # Device data (version 2.11 and later)
        if (self.__natNetStreamVersion[0] == 2 and self.__natNetStreamVersion[1] >= 11) or self.__natNetStreamVersion[0] > 2:
            deviceCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4
            trace("Device Count:", deviceCount)
            for i in range(0, deviceCount):
                # ID
                deviceID = int.from_bytes(data[offset:offset + 4], byteorder='little')
                offset += 4
                trace("Device", i, ":", deviceID)

                # Channel Count
                deviceChannelCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
                offset += 4

                # Channel Data
                for j in range(0, deviceChannelCount):
                    trace("\tChannel", j, ":", deviceID)
                    deviceChannelFrameCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
                    offset += 4
                    for k in range(0, deviceChannelFrameCount):
                        deviceChannelVal = int.from_bytes(data[offset:offset + 4], byteorder='little')
                        offset += 4
                        trace("\t\t", deviceChannelVal)

        # Timecode
        timecode = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4
        timecodeSub = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4

        # Timestamp (increased to double precision in 2.7 and later)
        if (self.__natNetStreamVersion[0] == 2 and self.__natNetStreamVersion[1] >= 7) or self.__natNetStreamVersion[
            0] > 2:
            timestamp, = DoubleValue.unpack(data[offset:offset + 8])
            offset += 8
        else:
            timestamp, = FloatValue.unpack(data[offset:offset + 4])
            offset += 4

        # Hires Timestamp (Version 3.0 and later)
        if (self.__natNetStreamVersion[0] >= 3):
            stampCameraExposure = int.from_bytes(data[offset:offset + 8], byteorder='little')
            offset += 8
            stampDataReceived = int.from_bytes(data[offset:offset + 8], byteorder='little')
            offset += 8
            stampTransmit = int.from_bytes(data[offset:offset + 8], byteorder='little')
            offset += 8

        # Frame parameters
        param, = struct.unpack('h', data[offset:offset + 2])
        isRecording = (param & 0x01) != 0
        trackedModelsChanged = (param & 0x02) != 0
        offset += 2

        # Send information to any listener.
        if self.newFrameListener is not None:
            self.newFrameListener(frameNumber, markerSetCount, unlabeledMarkersCount, rigidBodyCount, skeletonCount,
                                  labeledMarkerCount, timecode, timecodeSub, timestamp, isRecording,
                                  trackedModelsChanged)

    # Unpack a marker set description packet
    def __unpackMarkerSetDescription(self, data):
        offset = 0

        name, separator, remainder = bytes(data[offset:]).partition(b'\0')
        offset += len(name) + 1
        trace("Markerset Name:", name.decode('utf-8'))

        markerCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4

        for i in range(0, markerCount):
            name, separator, remainder = bytes(data[offset:]).partition(b'\0')
            offset += len(name) + 1
            trace("\tMarker Name:", name.decode('utf-8'))

        return offset

    # Unpack a rigid body description packet
    def __unpackRigidBodyDescription(self, data):
        offset = 0
        name = ""
        # Version 2.0 or higher
        if (self.__natNetStreamVersion[0] >= 2):
            name, separator, remainder = bytes(data[offset:]).partition(b'\0')
            offset += len(name) + 1
            trace("\tMarker Name:", name.decode('utf-8'))

        id = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4

        parentID = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4

        timestamp = Vector3.unpack(data[offset:offset + 12])
        offset += 12

        if (self.__natNetStreamVersion[0] >= 3):
            n_markers = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4

            offset += n_markers * 3 * 4  # Marker positions
            offset += n_markers * 4  # Marker required active labels


        self.register_rigid_body(RigidBody(name, id, parentID, timestamp))

        return offset

    # Unpack a skeleton description packet
    def __unpackSkeletonDescription(self, data):
        offset = 0

        name, separator, remainder = bytes(data[offset:]).partition(b'\0')
        offset += len(name) + 1
        trace("\tMarker Name:", name.decode('utf-8'))

        id = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4

        rigidBodyCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4

        for i in range(0, rigidBodyCount):
            offset += self.__unpackRigidBodyDescription(data[offset:])

        return offset

    # Unpack a data description packet
    def __unpackDataDescriptions(self, data):
        offset = 0
        datasetCount = int.from_bytes(data[offset:offset + 4], byteorder='little')
        offset += 4

        for i in range(0, datasetCount):
            type = int.from_bytes(data[offset:offset + 4], byteorder='little')
            offset += 4
            if (type == 0):
                offset += self.__unpackMarkerSetDescription(data[offset:])
            elif (type == 1):
                offset += self.__unpackRigidBodyDescription(data[offset:])
            elif (type == 2):
                offset += self.__unpackSkeletonDescription(data[offset:])

    def __dataThreadFunction(self, socket):
        while True:
            # Block for input
            data, addr = socket.recvfrom(32768)  # 32k byte buffer size
            if (len(data) > 0):
                # print(data)
                self.__processMessage(data)

    def __processMessage(self, data):
        trace("Begin Packet\n------------\n")

        messageID = int.from_bytes(data[0:2], byteorder='little')
        trace("Message ID:", messageID)

        packetSize = int.from_bytes(data[2:4], byteorder='little')
        trace("Packet Size:", packetSize)

        offset = 4
        if messageID == self.NAT_FRAMEOFDATA:
            self.__unpackMocapData(data[offset:])
        elif messageID == self.NAT_MODELDEF:
            self.__unpackDataDescriptions(data[offset:])
        elif messageID == self.NAT_PINGRESPONSE:
            offset += 256  # Skip the sending app's Name field
            offset += 4  # Skip the sending app's Version info
            self.__natNetStreamVersion = struct.unpack('BBBB', data[offset:offset + 4])
            offset += 4
        elif messageID == self.NAT_RESPONSE:
            if (packetSize == 4):
                commandResponse = int.from_bytes(data[offset:offset + 4], byteorder='little')
                offset += 4
            else:
                message, separator, remainder = bytes(data[offset:]).partition(b'\0')
                offset += len(message) + 1
                trace("Command response:", message.decode('utf-8'))
        elif messageID == self.NAT_UNRECOGNIZED_REQUEST:
            trace("Received 'Unrecognized request' from server")
        elif messageID == self.NAT_MESSAGESTRING:
            message, separator, remainder = bytes(data[offset:]).partition(b'\0')
            offset += len(message) + 1
            trace("Received message from server:", message.decode('utf-8'))
        else:
            trace("ERROR: Unrecognized packet type")

        if self._waiting_on_cmd == messageID:
            self.wait_event.set()
        trace("End Packet\n----------\n")

    def sendCommand(self, command, commandStr, socket, address, block=False):

        wait_for = command
        # Compose the message in our known message format
        if (command == self.NAT_REQUEST_MODELDEF or command == self.NAT_REQUEST_FRAMEOFDATA):
            packetSize = 0
            commandStr = ""
            if command == self.NAT_REQUEST_MODELDEF:
                wait_for = self.NAT_MODELDEF
        elif (command == self.NAT_REQUEST):
            packetSize = len(commandStr) + 1
        elif (command == self.NAT_PING):
            commandStr = "Ping"
            packetSize = len(commandStr) + 1

        data = command.to_bytes(2, byteorder='little')
        data += packetSize.to_bytes(2, byteorder='little')

        data += commandStr.encode('utf-8')
        data += b'\0'

        if block:
            self._waiting_on_cmd = wait_for
            self.wait_event.clear()
        socket.sendto(data, address)
        if block:
            self.wait_event.wait()

    def run(self):
        # Create the data socket
        self.dataSocket = self.__createDataSocket(self.dataPort)
        if (self.dataSocket is None):
            print("Could not open data channel")
            exit

        # Create the command socket
        self.commandSocket = self.__createCommandSocket()
        if (self.commandSocket is None):
            print("Could not open command channel")
            exit

        # Create a separate thread for receiving data packets
        dataThread = Thread(target=self.__dataThreadFunction, args=(self.dataSocket,))
        dataThread.start()

        # Create a separate thread for receiving command packets
        commandThread = Thread(target=self.__dataThreadFunction, args=(self.commandSocket,))
        commandThread.start()

        # self.sendCommand(self.NAT_REQUEST_MODELDEF, "", self.commandSocket, (self.serverIPAddress, self.commandPort))

    def get_rigid_bodies(self):
        self.rigid_bodies = {}
        self.sendCommand(self.NAT_REQUEST_MODELDEF, "", self.commandSocket, (self.serverIPAddress, self.commandPort), block=True)
        return self.rigid_bodies

    def register_rigid_body(self, rigidbody):
        self.rigid_bodies[rigidbody.name] = rigidbody

    def register_rigid_body_listener(self, rigid_body_id, callback):
        self.rigid_body_listeners[rigid_body_id] = callback

    def register_callback(self, callback):
        self.data_callback = callback