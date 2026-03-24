const express = require("express");
const cors = require("cors");
const bodyParser = require("express").json;

const { initDb, db } = require("./db");
const { runMigrationsIfNeeded } = require("./schema");
const { processAdtMessage, getSampleMessages } = require("./simulator");
const { getDashboardData, updateTaskStatus, simulateSnfResponse } = require("./routes");

async function main() {
  await initDb();
  await runMigrationsIfNeeded();

  const app = express();
  app.use(cors());
  app.use(bodyParser({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Dashboard polling endpoint
  app.get("/api/dashboard", async (_req, res) => {
    const data = await getDashboardData();
    res.json(data);
  });

  // Simulated inbound Epic ADT/FHIR messages
  app.post("/api/adt", async (req, res) => {
    try {
      const result = await processAdtMessage(req.body);
      res.json(result);
    } catch (e) {
      // Include stack for prototype debugging (remove later if desired).
      res.status(400).json({ error: e?.message || "Bad request", stack: e?.stack });
    }
  });

  // Task status updates (demo)
  app.post("/api/tasks/:taskId/status", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { status } = req.body || {};
      const result = await updateTaskStatus(taskId, status);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e?.message || "Bad request" });
    }
  });

  // Simulate SNF response (demo learning loop)
  app.post("/api/sim/snf-response", async (req, res) => {
    try {
      const result = await simulateSnfResponse(req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e?.message || "Bad request" });
    }
  });

  app.get("/api/sample-messages", (_req, res) => {
    res.json(getSampleMessages());
  });

  const port = Number(process.env.PORT || 8080);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Discharge coordination prototype listening on http://localhost:${port}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

