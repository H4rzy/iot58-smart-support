"use strict";
const net = require("node:net");
const aedes = require("aedes")();
const host = process.env.LOCAL_MQTT_HOST || "127.0.0.1";
const port = Number(process.env.LOCAL_MQTT_PORT || 1883);
const server = net.createServer(aedes.handle);
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () =>
  console.log(
    `Local classroom test broker mqtt://${host}:${port}. Wokwi cloud cannot access localhost.`,
  ),
);
function stop() {
  server.close(() => aedes.close(() => process.exit(0)));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
