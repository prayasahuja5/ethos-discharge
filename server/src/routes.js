const { db } = require("./db");
const {
  getDiagnosisGroupForPatient,
  getTopSnfOptions,
  getPcpMatches,
  createPredictedBarriers
} = require("./resourceMatching");
const { computeDashboardAlerts } = require("./alerts");

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function minutesToHuman(mins) {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `${Math.round(n)} min`;
  const h = n / 60;
  if (h < 6) return `${h.toFixed(1)} hr`;
  return `${Math.round(h)} hr`;
}

function createNextSteps({
  autoTasks,
  recommendedSnfOptions,
  recommendedPcpMatches,
  alerts
}) {
  const tasks = autoTasks || [];
  const alertsArr = alerts || [];

  const hasTask = (taskType) => tasks.find((t) => t.taskType === taskType);
  const firstIncomplete = (taskType) => {
    const t = tasks.find((x) => x.taskType === taskType);
    return t && t.status !== "complete" ? t : null;
  };

  const snfNoResponse = alertsArr.some((a) => a.type === "SNF_NO_RESPONSE");
  const snfFacility = snfNoResponse
    ? recommendedSnfOptions?.[1]?.facilityName || recommendedSnfOptions?.[0]?.facilityName
    : recommendedSnfOptions?.[0]?.facilityName;

  const pcpClinic = recommendedPcpMatches?.[0]?.clinicName;

  const steps = [];

  const snfTask = firstIncomplete("SNF_REFERRAL");
  if (snfTask) {
    steps.push({
      priority: "high",
      label: snfFacility
        ? `Respond to SNF referral (${snfFacility})`
        : "Respond to SNF referral (choose an option)"
    });
  }

  const pharmacyTask = firstIncomplete("PHARMACY_COORDINATION");
  if (pharmacyTask) {
    const windowMinutes = pharmacyTask.metadata?.dischargeWindowMinutes;
    const humanWindow = minutesToHuman(windowMinutes);
    steps.push({
      priority: "high",
      label: humanWindow
        ? `Coordinate pharmacy now (window: ${humanWindow})`
        : "Coordinate pharmacy now"
    });
  }

  const pcpTask = firstIncomplete("PCP_PLACEMENT");
  if (pcpTask) {
    steps.push({
      priority: "medium",
      label: pcpClinic ? `Schedule PCP placement (${pcpClinic})` : "Schedule PCP placement"
    });
  }

  // If nothing special above is pending, suggest the next incomplete task (up to 3 total).
  if (!steps.length) {
    const next = tasks.filter((t) => t.status !== "complete").slice(0, 3);
    for (const t of next) {
      steps.push({
        priority: "medium",
        label: `Update: ${t.title}`
      });
    }
  }

  return steps.slice(0, 3);
}

async function getDashboardData() {
  const patientsRes = await db.query(`
    SELECT
      id, epic_patient_id, age, insurance_type, admission_source,
      diagnosis_codes, expected_los_days, comorbidities, readmission_days,
      no_pcp_on_file, complexity_score, is_high_priority, flags, demographics,
      assigned_case_manager_id, floor, anticipated_disposition,
      manual_task_list, discharge_order_placed_at, meds_prescribed, expected_discharge_at,
      created_at, last_event_at
    FROM patients
    ORDER BY last_event_at DESC, created_at DESC
    LIMIT 50
  `);

  const patients = patientsRes.rows || [];

  const result = [];
  for (const p of patients) {
    const tasksRes = await db.query(
      `SELECT id, origin, task_type, title, status, metadata, created_at, updated_at, completed_at
       FROM tasks WHERE patient_id = $1
       ORDER BY created_at ASC`,
      [p.id]
    );
    const tasks = tasksRes.rows || [];

    const autoTasks = tasks.filter((t) => t.origin === "auto");
    const snfDiagnosisGroup = getDiagnosisGroupForPatient(p.diagnosis_codes);
    const preferredLanguage =
      p.demographics?.preferredLanguage ||
      p.demographics?.preferred_language ||
      "English";

    const recommendedSnfOptions =
      snfDiagnosisGroup && p.insurance_type
        ? await getTopSnfOptions({
            insuranceType: p.insurance_type,
            diagnosisGroup: snfDiagnosisGroup
          })
        : [];

    const recommendedPcpMatches =
      p.insurance_type
        ? await getPcpMatches({
            insuranceType: p.insurance_type,
            preferredLanguage
          })
        : [];

    const dischargeContext = {
      dischargeOrderPlaced: Boolean(p.discharge_order_placed_at),
      medsPrescribed: Boolean(p.meds_prescribed),
      dischargeOrderPlacedAt: p.discharge_order_placed_at,
      expectedDischargeAt: p.expected_discharge_at,
      expectedDischargeAtISO: toIsoOrNull(p.expected_discharge_at),
      disposition: p.anticipated_disposition
    };

    const predictedDischargeBarriers = createPredictedBarriers({
      tasks: autoTasks,
      dischargeContext,
      recommendedSnfCount: recommendedSnfOptions.length
    });

    const alerts = computeDashboardAlerts({
      patient: p,
      tasks: tasks
    });

    const nextSteps = createNextSteps({
      autoTasks,
      recommendedSnfOptions,
      recommendedPcpMatches,
      alerts
    });

    result.push({
      patientId: p.id,
      epicPatientId: p.epic_patient_id,
      age: p.age,
      insuranceType: p.insurance_type,
      admissionSource: p.admission_source,
      diagnosisCodes: p.diagnosis_codes,
      expectedLosDays: p.expected_los_days,
      readmissionDays: p.readmission_days,
      noPcpOnFile: p.no_pcp_on_file,
      complexityScore: p.complexity_score,
      isHighPriority: p.is_high_priority,
      flags: p.flags,
      assignedCaseManagerId: p.assigned_case_manager_id,
      floor: p.floor,
      anticipatedDisposition: p.anticipated_disposition,
      createdAtISO: toIsoOrNull(p.created_at),
      lastEventAtISO: toIsoOrNull(p.last_event_at),
      manualTaskList: p.manual_task_list || [],
      autoTasks: autoTasks.map((t) => ({
        taskId: t.id,
        taskType: t.task_type,
        title: t.title,
        status: t.status,
        createdAtISO: toIsoOrNull(t.created_at),
        completedAtISO: toIsoOrNull(t.completed_at),
        metadata: t.metadata || {}
      })),
      recommendedSnfOptions,
      recommendedPcpMatches,
      predictedDischargeBarriers,
      alerts,
      nextSteps
    });
  }

  return {
    ok: true,
    serverTimeISO: new Date().toISOString(),
    patients: result
  };
}

async function updateTaskStatus(taskId, status) {
  const allowed = new Set(["pending", "in_progress", "blocked", "complete"]);
  if (!allowed.has(status)) {
    throw new Error("Invalid status. Use one of: pending, in_progress, blocked, complete");
  }

  const updateRes = await db.query(
    `
      UPDATE tasks
      SET status = $1,
          updated_at = now(),
          completed_at = CASE WHEN $1 = 'complete' THEN now() ELSE NULL END
      WHERE id = $2
      RETURNING id, origin, task_type, title, status, metadata, created_at, completed_at
    `,
    [status, taskId]
  );
  if (!updateRes.rows[0]) throw new Error("Task not found");
  return { ok: true, task: updateRes.rows[0] };
}

async function simulateSnfResponse({ patientId, epicPatientId, facilityName, respondedAtISO } = {}) {
  const snfName = facilityName || "";
  if (!snfName) throw new Error("Missing facilityName");
  const respondedAt = respondedAtISO ? new Date(respondedAtISO) : new Date();
  if (Number.isNaN(respondedAt.getTime())) throw new Error("Invalid respondedAtISO");

  let patient = null;
  if (patientId) {
    const res = await db.query(`SELECT * FROM patients WHERE id = $1`, [patientId]);
    patient = res.rows[0];
  } else if (epicPatientId) {
    const res = await db.query(`SELECT * FROM patients WHERE epic_patient_id = $1`, [epicPatientId]);
    patient = res.rows[0];
  }
  if (!patient) throw new Error("Patient not found");

  const diagnosisGroup = getDiagnosisGroupForPatient(patient.diagnosis_codes) || "CHF_COPD_STROKE";
  const insuranceType = patient.insurance_type;

  const taskRes = await db.query(
    `SELECT * FROM tasks
     WHERE patient_id = $1 AND origin = 'auto' AND task_type = 'SNF_REFERRAL'
     ORDER BY created_at DESC
     LIMIT 1`,
    [patient.id]
  );
  const snfTask = taskRes.rows[0];
  if (!snfTask) throw new Error("SNF referral task not found for this patient");

  const referralSentAt = snfTask.metadata?.referralSentAtISO
    ? new Date(snfTask.metadata.referralSentAtISO)
    : new Date(snfTask.created_at);
  const responseMinutes = (respondedAt.getTime() - referralSentAt.getTime()) / (1000 * 60);

  // Mark the SNF referral task complete
  const updateTaskRes = await db.query(
    `
      UPDATE tasks
      SET status = 'complete',
          updated_at = now(),
          completed_at = now(),
          metadata = metadata || $1::jsonb
      WHERE id = $2
      RETURNING id, task_type, title, status, metadata
    `,
    [
      JSON.stringify({
        snfResponseReceivedAt: respondedAt.toISOString(),
        snfFacilityResponded: snfName,
        responseMinutes: Number(responseMinutes)
      }),
      snfTask.id
    ]
  );

  // Record placement attempt
  await db.query(
    `INSERT INTO placement_attempts (patient_id, snf_name, insurance_type, diagnosis_group, referral_sent_at, responded_at, response_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      patient.id,
      snfName,
      insuranceType,
      diagnosisGroup,
      referralSentAt.toISOString(),
      respondedAt.toISOString(),
      responseMinutes
    ]
  );

  // Update/learn metrics
  // Incremental average based on attempts counter.
  await db.query(
    `
      INSERT INTO snf_response_metrics (snf_name, insurance_type, diagnosis_group, avg_response_minutes, last_successful_placement_date, attempts)
      VALUES ($1,$2,$3,$4,$5,1)
      ON CONFLICT (snf_name, insurance_type, diagnosis_group)
      DO UPDATE SET
        avg_response_minutes = (
          (snf_response_metrics.avg_response_minutes * snf_response_metrics.attempts + EXCLUDED.avg_response_minutes)
          / (snf_response_metrics.attempts + 1)
        ),
        last_successful_placement_date = EXCLUDED.last_successful_placement_date,
        attempts = snf_response_metrics.attempts + 1,
        updated_at = now()
    `,
    [snfName, insuranceType, diagnosisGroup, responseMinutes, respondedAt.toISOString()]
  );

  return {
    ok: true,
    patientId: patient.id,
    snfTask: updateTaskRes.rows[0],
    responseMinutes: Number(responseMinutes),
    diagnosisGroup,
    insuranceType
  };
}

module.exports = {
  getDashboardData,
  updateTaskStatus,
  simulateSnfResponse
};

