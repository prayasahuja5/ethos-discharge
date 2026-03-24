const { db } = require("./db");
const { isoOrNow, ensureConfigLoaded } = require("./util");
const { computeComplexityScore } = require("./scoring");
const { generateAutoTasks, buildManualTaskList } = require("./rulesEngine");
const {
  getDiagnosisGroupForPatient,
  getTopSnfOptions,
  getPcpMatches
} = require("./resourceMatching");
const { assignCaseManager } = require("./workload");

function computeAgeFromBirthDate(birthDateISO) {
  const bd = birthDateISO ? new Date(birthDateISO) : null;
  if (!bd || Number.isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age -= 1;
  return age;
}

function extractPatientFromAdt(message) {
  const patient = message.patient || {};

  const epicPatientId =
    message.epicPatientId ||
    patient.id ||
    patient.patientId ||
    patient.epicId ||
    message.patientId;

  if (!epicPatientId) {
    throw new Error("Missing patient id (expected message.patient.id or message.epicPatientId)");
  }

  const age =
    patient.age ??
    computeAgeFromBirthDate(patient.birthDate || patient.birth_date || patient.dob);

  const diagnosisCodes =
    patient.diagnosisCodes ||
    patient.diagnosis_codes ||
    message.diagnosisCodes ||
    [];

  return {
    epicPatientId: String(epicPatientId),
    age: age == null ? null : Number(age),
    insuranceType: patient.insuranceType || patient.insurance_type || "Uninsured",
    admissionSource: patient.admissionSource || patient.admission_source || null,
    diagnosisCodes: Array.isArray(diagnosisCodes) ? diagnosisCodes.map(String) : [],
    expectedLosDays: patient.expectedLosDays ?? patient.expected_los_days ?? null,
    comorbidities: Array.isArray(patient.comorbidities) ? patient.comorbidities : [],
    readmissionDays: patient.readmissionDays ?? patient.readmission_days ?? null,
    noPcpOnFile:
      patient.noPcpOnFile ??
      patient.no_pcp_on_file ??
      patient.pcpOnFile === false,
    preferredLanguage: patient.preferredLanguage || patient.preferred_language || "English",
    floor: patient.floor || "3W",
    anticipatedDisposition: patient.anticipatedDisposition || patient.anticipated_disposition || null,
    demographics: {
      ...patient,
      // keep a normalized diagnosis code array
      diagnosisCodes: Array.isArray(diagnosisCodes) ? diagnosisCodes.map(String) : []
    }
  };
}

function extractDischargeContext(message) {
  const discharge = message.discharge || message.dischargeOrder || {};
  const dischargeOrderPlacedAtISO =
    discharge.dischargeOrderPlacedAt ||
    discharge.orderPlacedAt ||
    message.dischargeOrderPlacedAt ||
    message.orderPlacedAt ||
    null;

  const medsPrescribed = Boolean(discharge.medsPrescribed ?? discharge.meds_prescribed ?? message.medsPrescribed);
  const expectedDischargeAtISO =
    discharge.expectedDischargeAt ||
    discharge.expected_discharge_at ||
    message.expectedDischargeAt ||
    message.expected_discharge_at ||
    null;

  const orderTime = dischargeOrderPlacedAtISO ? new Date(dischargeOrderPlacedAtISO) : null;
  const expectedTime = expectedDischargeAtISO ? new Date(expectedDischargeAtISO) : null;
  const dischargeWindowMinutes =
    orderTime && expectedTime ? Math.max(0, (expectedTime.getTime() - orderTime.getTime()) / (1000 * 60)) : null;

  return {
    dischargeOrderPlaced: Boolean(dischargeOrderPlacedAtISO),
    dischargeOrderPlacedAtISO,
    orderPlacedAt: orderTime,
    expectedDischargeAtISO,
    medsPrescribed,
    expectedDischargeAt: expectedTime,
    dischargeWindowMinutes
  };
}

function getEpicEventType(message) {
  return message.adtEventType || message.messageType || message.epicEventType || "ADT-A01";
}

function getEventTime(message) {
  return isoOrNow(message.eventTime || message.occurred_at || message.occurredAt || message.timestamp);
}

async function ensurePatientExists({ epicPatientId, patient }) {
  const existing = await db.query(`SELECT * FROM patients WHERE epic_patient_id = $1`, [epicPatientId]);
  return existing.rows[0] || null;
}

async function createPatientAndTasks({ message, patient, complexity, dischargeContext }) {
  const assignment = await assignCaseManager({ floor: patient.floor, isHighPriority: complexity.isHighPriority });

  const manualTaskList = buildManualTaskList({ patient: { ...patient, noPcpOnFile: patient.noPcpOnFile }, dischargeContext });
  const autoTaskCandidates = generateAutoTasks({ patient: { ...patient, noPcpOnFile: patient.noPcpOnFile }, dischargeContext });

  const insertPatient = `
    INSERT INTO patients (
      epic_patient_id, age, insurance_type, admission_source, diagnosis_codes,
      expected_los_days, comorbidities, readmission_days, no_pcp_on_file,
      complexity_score, is_high_priority, flags, demographics, assigned_case_manager_id,
      floor, anticipated_disposition, manual_task_list,
      discharge_order_placed_at, meds_prescribed, expected_discharge_at
    )
    VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,$12,$13,$14,
      $15,$16,$17,
      $18,$19,$20
    )
    RETURNING id
  `;

  const patientFlags = {
    ...complexity.flags,
    highPriority: complexity.isHighPriority,
    diagnosisGroupMatched: autoTaskCandidates.flags?.diagnosisGroupMatches || []
  };

  const row = await db.query(insertPatient, [
    patient.epicPatientId,
    patient.age,
    patient.insuranceType,
    patient.admissionSource,
    JSON.stringify(patient.diagnosisCodes || []),
    patient.expectedLosDays,
    JSON.stringify(patient.comorbidities || []),
    patient.readmissionDays,
    Boolean(patient.noPcpOnFile),
    complexity.score,
    complexity.isHighPriority,
    JSON.stringify(patientFlags),
    JSON.stringify(patient.demographics || {}),
    assignment.caseManagerId,
    patient.floor,
    patient.anticipatedDisposition,
    JSON.stringify(manualTaskList || []),
    dischargeContext.dischargeOrderPlacedAtISO ? new Date(dischargeContext.dischargeOrderPlacedAtISO) : null,
    dischargeContext.medsPrescribed,
    dischargeContext.expectedDischargeAtISO ? new Date(dischargeContext.expectedDischargeAtISO) : null
  ]);
  const patientId = row.rows[0].id;

  // Insert tasks (auto tasks only); manual comparison is stored on the patient record
  const tasksToInsert = [];
  for (const t of autoTaskCandidates.tasks || []) {
    tasksToInsert.push({
      taskType: t.taskType,
      title: t.title,
      origin: "auto",
      metadata: t.metadata || {},
      status: "pending"
    });
  }

  // Enrich resource recommendations for certain tasks
  const diagnosisGroup = getDiagnosisGroupForPatient(patient.diagnosisCodes);

  for (const t of tasksToInsert) {
    if (t.taskType === "SNF_REFERRAL") {
      const snfOptions = await getTopSnfOptions({
        insuranceType: patient.insuranceType,
        diagnosisGroup: diagnosisGroup || "CHF_COPD_STROKE"
      });
      t.metadata = {
        ...t.metadata,
        recommendedSnfOptions: snfOptions,
        referralSentAtISO: message.eventTime || message.occurredAt || message.timestamp || null,
        diagnosisGroup: diagnosisGroup || "CHF_COPD_STROKE",
        bedTypesNeeded: ["Skilled", "Rehab"]
      };
    }
    if (t.taskType === "PCP_PLACEMENT") {
      const pcpMatches = await getPcpMatches({
        insuranceType: patient.insuranceType,
        preferredLanguage: patient.preferredLanguage
      });
      t.metadata = {
        ...t.metadata,
        recommendedPcpMatches: pcpMatches,
        referralDraft: {
          patient: {
            epicPatientId: patient.epicPatientId,
            age: patient.age,
            insuranceType: patient.insuranceType,
            preferredLanguage: patient.preferredLanguage,
            noPcpOnFile: Boolean(patient.noPcpOnFile)
          }
        }
      };
    }
  }

  for (const t of tasksToInsert) {
    await db.query(
      `INSERT INTO tasks (patient_id, origin, task_type, title, status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [patientId, t.origin, t.taskType, t.title, t.status, JSON.stringify(t.metadata || {})]
    );
  }

  // Record the event
  await db.query(
    `INSERT INTO patient_events (patient_id, epic_message_type, payload, occurred_at)
     VALUES ($1,$2,$3,$4)`,
    [
      patientId,
      getEpicEventType(message),
      JSON.stringify(message), // payload JSONB
      message.eventTime ? new Date(message.eventTime) : getEventTime(message)
    ]
  );

  // Update last_event_at
  await db.query(`UPDATE patients SET last_event_at = now() WHERE id = $1`, [patientId]);

  return { patientId, assignedCaseManager: assignment };
}

async function addTasksForDischargeOrder({ message, patientDbRow, patient, dischargeContext }) {
  const dischargeOrderPlaced = dischargeContext.dischargeOrderPlaced;
  if (!dischargeOrderPlaced || !dischargeContext.medsPrescribed) {
    return { createdTasks: [] };
  }

  const autoTaskCandidates = generateAutoTasks({ patient, dischargeContext });
  const existing = await db.query(
    `SELECT id, task_type, metadata
     FROM tasks
     WHERE patient_id = $1 AND origin = 'auto'`,
    [patientDbRow.id]
  );
  const existingByType = new Map(existing.rows.map((r) => [r.task_type, r]));

  const createdTasks = [];
  for (const t of autoTaskCandidates.tasks || []) {
    const existingForType = existingByType.get(t.taskType);
    if (existingForType && t.taskType === "PHARMACY_COORDINATION") {
      // Update metadata so time-based alerts stay accurate when discharge order changes.
      await db.query(
        `UPDATE tasks
         SET metadata = metadata || $1::jsonb,
             updated_at = now()
         WHERE id = $2`,
        [JSON.stringify({ dischargeWindowMinutes: dischargeContext.dischargeWindowMinutes }), existingForType.id]
      );
      continue;
    }
    if (existingForType) continue;

    const metadata = {
      ...(t.metadata || {})
    };

    if (t.taskType === "PHARMACY_COORDINATION") {
      metadata.dischargeWindowMinutes = dischargeContext.dischargeWindowMinutes;
    }

    await db.query(
      `INSERT INTO tasks (patient_id, origin, task_type, title, status, metadata)
       VALUES ($1,'auto',$2,$3,'pending',$4)`,
      [patientDbRow.id, t.taskType, t.title, JSON.stringify(metadata || {})]
    );
    createdTasks.push({ taskType: t.taskType, title: t.title });
  }

  return { createdTasks };
}

function getPatientDbRowForResponse(row) {
  return row && row.rows ? row.rows[0] : row;
}

async function processAdtMessage(message) {
  if (!message || typeof message !== "object") throw new Error("Expected a JSON object");
  const eventType = getEpicEventType(message);
  const eventTime = getEventTime(message);
  const dischargeContext = extractDischargeContext(message);
  const patient = extractPatientFromAdt(message);

  const existing = await ensurePatientExists({ epicPatientId: patient.epicPatientId, patient });

  // ADT-A01 admit
  if (eventType === "ADT-A01" && !existing) {
    const complexity = computeComplexityScore({
      ...patient,
      noPcpOnFile: Boolean(patient.noPcpOnFile),
      insuranceType: patient.insuranceType
    });
    const created = await createPatientAndTasks({
      message,
      patient,
      complexity,
      dischargeContext
    });
    return {
      ok: true,
      patientId: created.patientId,
      assignedCaseManager: created.assignedCaseManager,
      eventType
    };
  }

  // Discharge order placed (or similar) - update patient + maybe create tasks
  if (dischargeContext.dischargeOrderPlaced && existing) {
    await db.query(
      `UPDATE patients
       SET discharge_order_placed_at = $1,
           meds_prescribed = $2,
           expected_discharge_at = $3,
           last_event_at = now()
       WHERE id = $4`,
      [
        dischargeContext.dischargeOrderPlacedAtISO ? new Date(dischargeContext.dischargeOrderPlacedAtISO) : null,
        dischargeContext.medsPrescribed,
        dischargeContext.expectedDischargeAtISO ? new Date(dischargeContext.expectedDischargeAtISO) : null,
        existing.id
      ]
    );

    await db.query(
      `INSERT INTO patient_events (patient_id, epic_message_type, payload, occurred_at)
       VALUES ($1,$2,$3,$4)`,
      [existing.id, eventType, JSON.stringify(message), eventTime]
    );

    const update = await addTasksForDischargeOrder({
      message,
      patientDbRow: existing,
      patient,
      dischargeContext
    });

    return { ok: true, patientId: existing.id, eventType, createdTasks: update.createdTasks || [] };
  }

  if (eventType === "ADT-A01" && existing) {
    // Idempotent admission: do nothing besides recording the event.
    await db.query(
      `INSERT INTO patient_events (patient_id, epic_message_type, payload, occurred_at)
       VALUES ($1,$2,$3,$4)`,
      [existing.id, eventType, JSON.stringify(message), eventTime]
    );
    return { ok: true, patientId: existing.id, eventType, skipped: true };
  }

  // Fallback
  // For a prototype, we only fully support ADT-A01 + discharge order updates.
  return {
    ok: true,
    patientId: existing?.id || null,
    eventType,
    note: "Event accepted, but no additional logic executed for this prototype"
  };
}

function getSampleMessages() {
  const now = new Date();
  const orderTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
  // Keep expected discharge close so alerts (discharge window <2 hours) trigger in the demo.
  const expectedDischarge = new Date(now.getTime() + 1.7 * 60 * 60 * 1000); // 1.7 hours from now

  const admit1 = {
    adtEventType: "ADT-A01",
    eventTime: new Date().toISOString(),
    patient: {
      id: "epic-pat-1001",
      age: 72,
      insuranceType: "Medicaid",
      diagnosisCodes: ["I50.9", "E11.9"],
      expectedLosDays: 5,
      admissionSource: "ED",
      readmissionDays: 12,
      comorbidities: ["diabetes", "renal_disease"],
      noPcpOnFile: true,
      floor: "3W",
      anticipatedDisposition: "SNF"
    }
  };

  const discharge1 = {
    adtEventType: "ADT-A03",
    eventTime: new Date().toISOString(),
    epicPatientId: "epic-pat-1001",
    patient: {
      id: "epic-pat-1001",
      age: 72,
      insuranceType: "Medicaid",
      diagnosisCodes: ["I50.9"],
      comorbidities: ["diabetes"],
      noPcpOnFile: true,
      floor: "3W"
    },
    discharge: {
      dischargeOrderPlacedAt: orderTime.toISOString(),
      expectedDischargeAt: expectedDischarge.toISOString(),
      medsPrescribed: true
    }
  };

  const admit2 = {
    adtEventType: "ADT-A01",
    eventTime: new Date().toISOString(),
    patient: {
      id: "epic-pat-1002",
      age: 58,
      insuranceType: "Commercial",
      diagnosisCodes: ["J44.1"],
      expectedLosDays: 3,
      admissionSource: "HospitalTransfer",
      readmissionDays: 90,
      comorbidities: ["COPD_exacerbation_history"],
      noPcpOnFile: false,
      preferredLanguage: "English",
      floor: "4W",
      anticipatedDisposition: "Home"
    }
  };

  return [
    { label: "Admit (high complexity - CHF/COPD/stroke + Medicaid + no PCP + readmit <30d)", message: admit1 },
    { label: "Discharge order update (creates pharmacy coordination)", message: discharge1 },
    { label: "Admit (non-high priority example)", message: admit2 }
  ];
}

module.exports = {
  processAdtMessage,
  getSampleMessages
};

