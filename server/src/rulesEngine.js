const { ensureConfigLoaded } = require("./util");

function normalizeDiagnosisCode(code) {
  return String(code || "").trim();
}

function diagnosisMatchesPrefixes(diagnosisCodes, prefixes) {
  return diagnosisCodes.some((c) => prefixes.some((p) => c.startsWith(p)));
}

function buildManualTaskList({ patient, dischargeContext }) {
  const tasks = [];

  const insuranceType = patient.insuranceType;
  const diagnosisCodes = patient.diagnosisCodes || [];

  if (diagnosisMatchesPrefixes(diagnosisCodes, ["I50", "J44", "I63", "I69"])) {
    tasks.push({ taskType: "SNF_REFERRAL", title: "SNF referral (manual baseline)" });
  }

  if (insuranceType === "Medicaid" && patient.noPcpOnFile) {
    tasks.push({ taskType: "PCP_PLACEMENT", title: "PCP placement via Camino Clinic (manual baseline)" });
  }

  if (dischargeContext?.dischargeOrderPlaced && dischargeContext?.medsPrescribed) {
    tasks.push({ taskType: "PHARMACY_COORDINATION", title: "Pharmacy coordination (manual baseline)" });
  }

  return tasks;
}

function generateAutoTasks({ patient, dischargeContext }) {
  const { config } = ensureConfigLoaded();
  const diagnosisCodes = patient.diagnosisCodes || [];
  const insuranceType = patient.insuranceType;

  const tasks = [];
  const flags = { diagnosisGroupMatches: [] };

  for (const groupRule of config.taskRules.diagnosisGroupsToTasks || []) {
    const prefixes = groupRule.matchesAnyDiagnosisPrefix || [];
    if (diagnosisMatchesPrefixes(diagnosisCodes, prefixes)) {
      flags.diagnosisGroupMatches.push(groupRule.group);
      for (const t of groupRule.tasks || []) {
        tasks.push({
          taskType: t.taskType,
          title: t.title
        });
      }
    }
  }

  for (const rule of config.taskRules.insuranceAndNoPcpToTasks || []) {
    if (
      rule.insuranceType === insuranceType &&
      Boolean(rule.requiresNoPcpOnFile) === Boolean(patient.noPcpOnFile)
    ) {
      for (const t of rule.tasks || []) {
        tasks.push({ taskType: t.taskType, title: t.title });
      }
    }
  }

  // Readmission-based tasks
  if (patient.readmissionDays != null && patient.readmissionDays < 30) {
    for (const rule of config.taskRules.readmissionToTasks || []) {
      if (rule.readmissionWithin30Days) {
        for (const t of rule.tasks || []) {
          tasks.push({
            taskType: t.taskType,
            title: t.title,
            priority: t.priority || "NORMAL",
          });
        }
      }
    }
  }

  if (dischargeContext?.dischargeOrderPlaced) {
    for (const rule of config.taskRules.dischargeOrderToTasks || []) {
      if (Boolean(rule.requiresMedsPrescribed) === Boolean(dischargeContext.medsPrescribed)) {
        for (const t of rule.tasks || []) {
          tasks.push({
            taskType: t.taskType,
            title: t.title,
            metadata: {
              ...(t.metadataFromEvent?.dischargeWindowMinutes
                ? { dischargeWindowMinutes: dischargeContext.dischargeWindowMinutes }
                : {})
            }
          });
        }
      }
    }
  }

  return { tasks, flags };
}

module.exports = {
  generateAutoTasks,
  buildManualTaskList
};

