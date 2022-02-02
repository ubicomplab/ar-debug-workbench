# import pyrealtime as prt
# import struct
#
#
# def main():
#     data = prt.UDPReadLayer(port=8052)
#     prt.PrintLayer(data)
#     prt.LayerManager.session().run(show_monitor=False)
#
#
# if __name__ == "__main__":
#     main()


# import socket
#
# UDP_IP = "127.0.0.1"
# UDP_PORT = 8052
#
# sock = socket.socket(socket.AF_INET, # Internet
#                      socket.SOCK_DGRAM) # UDP
# sock.bind((UDP_IP, UDP_PORT))
#
# while True:
#     data, addr = sock.recvfrom(1024) # buffer size is 1024 bytes
#     print("received message: %s" % data)


import socket, select, queue

from flask import Flask
from celery import Celery


def make_celery(app):
    celery = Celery(app.import_name, broker=app.config['CELERY_BROKER_URL'])
    celery.conf.update(app.config)
    TaskBase = celery.Task
    class ContextTask(TaskBase):
        abstract = True
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return TaskBase.__call__(self, *args, **kwargs)
    celery.Task = ContextTask
    return celery

app = Flask(__name__)
app.config.update(
    CELERY_BROKER_URL='redis://localhost:6379',
    CELERY_RESULT_BACKEND='redis://localhost:6379'
)
celery = make_celery(app)
socket_queue = queue.Queue()


@celery.task()
def listen_to_udp():
    """
    This code was taken from
    https://stackoverflow.com/questions/9969259/python-raw-socket-listening-for-udp-packets-only-half-of-the-packets-received
    """
    s1 = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s1.bind(("127.0.0.1", 8052))
    s2 = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_UDP)
    s2.bind(("127.0.0.1", 8052))
    print("hel")
    while True:
        r, w, x = select.select([s1, s2], [], [])
        for i in r:
            socket_queue.put((i, i.recvfrom(131072)))
            print("hello")

# @app.route("/")
# def test_home():
#     listen_to_udp.delay()
#     print(socket_queue.get())


if __name__ == "__main__":
    #run install.py to install dependencies and create the database
    app.run(host="127.0.0.1", port=8052, debug=True)