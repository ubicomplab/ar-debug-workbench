const express = require("express");
const app = express();
const winston = require("winston");

var schdata = require("./data/schdata.json")
var pcbdata = require("./data/pcbdata.json")

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});
app.get("/schdata", (req, res) => {
    res.send(schdata);
});
app.get("/pcbdata", (req, res) => {
    res.send(pcbdata)
})

app.use(express.static("public"));

const server = app.listen(3000);
const io = require("socket.io")(server);

// Logging
const logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    defaultMeta: { service: "user-service" },
    transports: [
        // output to 'boardviz.log' and to console
        new winston.transports.File({ filename: "boardviz.log", level: "info" }),
        new winston.transports.Console({ format: winston.format.simple() })
    ],
});

connectionCount = 0;

function currentTimeMS() {
    return (new Date()).getTime();
}

function timeStamp() {
    return (new Date()).toLocaleString();
}

function logWithTime(msg) {
    logger.info(timeStamp() + ": " + msg);
}

function getSchReqHandler(schid, filename) {
    return function(req, res) {
        logWithTime(`Received request for schid ${schid}`);
        res.sendFile(__dirname + "/data/" + filename);
    }
}


logWithTime("Server started up");

num_schematics = schdata.schematics[0].orderpos.total;
for (var schematic of schdata.schematics) {
    var schid = schematic.orderpos.sheet;
    var schname = schematic.name;
    var filename = schname.trim() + ".svg"
    // For some reason, the default kicad output of additional sheets includes the name twice
    if (parseInt(schid) != 1) {
        filename = schname + "-" + filename;
    }
    logWithTime(`Serving ${filename} with schid ${schid}`)

    url = "/sch" + schid
    app.get(url, getSchReqHandler(schid, filename));
}

io.on("connection", (socket) => {
  connectionCount++;

  var clientIp = socket.request.connection.remoteAddress;
  logWithTime(`Connected to ${clientIp} (${connectionCount} active connections)`);

  socket.on("disconnect", () => {
    connectionCount--;
    logWithTime(`Disconnected ${clientIp} (${connectionCount} active connections remaining)`);
  });
});