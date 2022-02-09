## Introduction

This is a quick guide to the web and projector application.

The application runs as a flask server from the file `application.py`, which is the starting point for everything. The server communicates with the client via socketio after the initial GET requests, and listens on UDP port 8052 for optitrack data.

There are two main client pages, `main` and `projector`. `main` refers to the web application, while `projector` refers to the page that is intended to be fullscreened and projected onto the board. The html files for both are found in the `templates/` folder. Both files share several js files (`util.js`, `selection.js`, and `render.js`), but also have their own "primary" file that specifies unique behavior (`main.js` and `projector.js` respectively). All these files are found in the `static/` folder, along with the only css file (`style.css`).

## Rendering

Rendering is done differently for the schematic and the layout. The schematic is rendered as a two-layer HTML5 canvas: one background layer, which only contains the svg of the current schematic sheet, and one highlight layer, on which selection highlights, crosshairs, tooltips, and any other annotations are drawn. The primary function for (re-)drawing the schematic highlight layer is `drawSchematicHighlights()` in `render.js`. Note that `drawSchematicHighlights()` needs to be called again whenever you want to update the canvas (for example to update the position of a pointer).

The layout is rendered as two separate four-layer HTML5 canvases, one for the front and one for the back. The four layers are background, fab, silkscreen, and highlight. The first three should not be modified directly. Like the schematic, selection highlights and all other annotations are drawn on the highlight layers. This happens for each side individually in `drawHighlightsOnLayer()`, which is where you should add any additional elements you would like to draw. `drawHighlights()` is a wrapper function that then calls `drawHighlightsOnLayer()` for both the front and back layout, and should be called whenever you want to update the canvas. 

## Communication between Server and Client

The server and web clients communicate using socketio, a library that simplifies a TCP connection into messages consisting of a string label and a dictionary/object of data (python/js respctively). For example, an example selection message has label `"selection"` and data `{"type": "comp", "val": 140}`. Note that `data` can be a layered dictionary, so you can send whatever you want. To send a message from the server, call `socketio.emit(label, data)`. To send a message from the client, call `socket.emit(label, data);`.

Receiving messages is a little more complicated. The server receives messages using decorated functions:

    @socketio.on("label")
    def handle_message(data):
      <do something with data>

This decorated function runs whever the server receives a message from a client with the given label.

Clients receive messages using callbacks:

    socket.on("label", (data) => {
      <do something with data>
    });

This function runs whenever the client receives a message from the server with the given label. All the socket callbacks are kept together in the primary file of each page (eg. `main.js`) in a function called `initSocket()`. 
