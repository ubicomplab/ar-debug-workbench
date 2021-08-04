
import random

class ExampleTool:
    def __init__(self):
        print('Example tool connected!')
        self.connected = True
        self.position = [0, 0]

    def measure(self):
        self.position = [random.randint(0, 100), random.randint(0, 100)]
        return self.position
