const fs = require("fs");
const path = require("path");

let cachedConfig;

function readJson(relPath) {
  const p = path.join(__dirname, relPath);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ensureConfigLoaded() {
  if (cachedConfig) return { config: cachedConfig };
  const config = {
    taskRules: readJson("./config/task_rules.json"),
    snfFacilities: readJson("./config/snf_facilities.json"),
    clinics: readJson("./config/clinics.json"),
    caseManagers: readJson("./config/case_managers.json")
  };
  cachedConfig = config;
  return { config };
}

function isoOrNow(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

module.exports = { ensureConfigLoaded, isoOrNow, clamp };

