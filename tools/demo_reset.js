"use strict";
const url =
  (process.env.API_URL || "http://127.0.0.1:1880") + "/api/iot58/demo/reset";
fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reset_metrics: true }),
  signal: AbortSignal.timeout(5000),
})
  .then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    console.log(JSON.stringify(body, null, 2));
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
