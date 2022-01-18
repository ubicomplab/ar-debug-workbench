import pyrealtime as prt

from NatNetClient import NatNetClient


class NatNetLayer(prt.ProducerMixin, prt.ThreadLayer):

    def __init__(self, bodies_to_track, *args, track_markers=False, **kwargs):
        self.bodies_to_track = bodies_to_track
        self.id_to_name = {}
        self.track_markers = track_markers
        super().__init__(*args, **kwargs)

    # def on_data(self, id, frame_num, pos, rot):
    #     if id in self.id_to_name:
    #         self.supply_input({self.id_to_name[id]: (frame_num, pos, rot)})
    def on_data(self, frame_num, bodies, markers):
        ids_in_frame = list(bodies.keys())
        for id in ids_in_frame:
            bodies[self.id_to_name[id]] = bodies.pop(id)
        markers.pop(b'all')
        self.supply_input({'frame_num': frame_num, 'markers': markers, **bodies})

    def initialize(self):
        streamingClient = NatNetClient()
        streamingClient.run()

        bodies = streamingClient.get_rigid_bodies()

        for body_name in self.bodies_to_track:
            if body_name in bodies:
                # streamingClient.register_rigid_body_listener(bodies[body_name].id, self.on_data)
                self.id_to_name[bodies[body_name].id] = body_name
                print(body_name)
            else:
                print(body_name, " not found")
                print(bodies)
        streamingClient.register_callback(self.on_data)