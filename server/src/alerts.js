function hoursBetween(now, then) {
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60);
}

function minutesBetween(now, then) {
  return (now.getTime() - then.getTime()) / (1000 * 60);
}

function computeDashboardAlerts({ patient, tasks }) {
  const now = new Date();
  const alerts = [];

  const autoTasks = tasks.filter((t) => t.origin === "auto");

  // PA pending >4 hours (generic: task_type contains "PA" or metadata.kind === "PA")
  for (const t of autoTasks) {
    const createdAt = t.created_at ? new Date(t.created_at) : null;
    const metaKind = t.metadata?.kind;
    if (
      t.status !== "complete" &&
      createdAt &&
      (String(t.task_type || "").toUpperCase().includes("PA") || metaKind === "PA") &&
      hoursBetween(now, createdAt) > 4
    ) {
      alerts.push({
        type: "PA_PENDING",
        severity: "medium",
        message: "PA pending > 4 hours: notifying navigator + case manager"
      });
    }
  }

  // SNF referral sent, no response in 8 hours
  const snfTask = autoTasks.find((t) => t.task_type === "SNF_REFERRAL");
  if (snfTask && snfTask.status !== "complete") {
    const createdAt = snfTask.created_at ? new Date(snfTask.created_at) : null;
    const respondedAt = snfTask.metadata?.snfResponseReceivedAt;
    if (createdAt && !respondedAt && hoursBetween(now, createdAt) > 8) {
      alerts.push({
        type: "SNF_NO_RESPONSE",
        severity: "high",
        message: "SNF referral sent, no response in 8 hours: suggest calling + alternatives"
      });
    }
  }

  // Discharge order placed, placement not confirmed
  if (patient.discharge_order_placed_at) {
    const dischargeOrderTime = new Date(patient.discharge_order_placed_at);
    const snfConfirmed = snfTask?.status === "complete";
    if (!snfConfirmed && hoursBetween(now, dischargeOrderTime) >= 0) {
      alerts.push({
        type: "DISCHARGE_PLACEMENT_NOT_CONFIRMED",
        severity: "high",
        message: "Discharge order placed but SNF placement not confirmed: alert charge nurse"
      });
    }
  }

  // Discharge order placed, placement not confirmed within discharge window (2h)
  const pharmacyTask = autoTasks.find((t) => t.task_type === "PHARMACY_COORDINATION");
  if (pharmacyTask && pharmacyTask.status !== "complete") {
    const dischargeWindowMinutes = Number(pharmacyTask.metadata?.dischargeWindowMinutes);
    if (Number.isFinite(dischargeWindowMinutes) && dischargeWindowMinutes > 0 && dischargeWindowMinutes < 120) {
      alerts.push({
        type: "PHARMACY_WINDOW_TIGHT",
        severity: "high",
        message: `Discharge window is tight (${Math.round(dischargeWindowMinutes)} min): coordinate pharmacy immediately`
      });
    }
  }

  // Discharge in <=4 hours
  if (patient.expected_discharge_at) {
    const expected = new Date(patient.expected_discharge_at);
    const minutesUntil = (expected.getTime() - now.getTime()) / (1000 * 60);
    if (minutesUntil > 0 && minutesUntil <= 240) {
      alerts.push({
        type: "DISCHARGE_SOON",
        severity: "medium",
        message: `Discharge expected in ~${Math.round(minutesUntil)} minutes`
      });
    }
  }

  // De-dupe by type
  const byType = new Map();
  for (const a of alerts) byType.set(a.type, a);
  return Array.from(byType.values());
}

module.exports = { computeDashboardAlerts };

