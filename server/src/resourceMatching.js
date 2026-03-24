const { ensureConfigLoaded } = require("./util");
const { db } = require("./db");

function getDiagnosisGroupForPatient(diagnosisCodes) {
  const codes = diagnosisCodes || [];
  const matches = codes.some(
    (c) => ["I50", "J44", "I63", "I69"].some((p) => String(c || "").startsWith(p))
  );
  return matches ? "CHF_COPD_STROKE" : null;
}

function calcRequiredBedTypes(diagnosisGroup, facility) {
  const needed =
    facility?.bedTypesNeededForDiagnosisGroup?.[diagnosisGroup] ||
    ["Skilled"];
  return Array.isArray(needed) && needed.length ? needed : ["Skilled"];
}

function sumBedsAvailable(facility, bedTypes) {
  const available = facility?.bedTypesAvailable || {};
  return bedTypes.reduce((sum, bt) => sum + Number(available[bt] || 0), 0);
}

async function getTopSnfOptions({ insuranceType, diagnosisGroup }) {
  const { config } = ensureConfigLoaded();
  const snfs = config.snfFacilities || [];
  const metrics = await db.query(
    `SELECT snf_name, insurance_type, diagnosis_group, avg_response_minutes, last_successful_placement_date
     FROM snf_response_metrics
     WHERE insurance_type = $1 AND diagnosis_group = $2`,
    [insuranceType, diagnosisGroup]
  );
  const metricByName = new Map(
    metrics.rows.map((r) => [
      r.snf_name,
      {
        avg_response_minutes: Number(r.avg_response_minutes),
        last_successful_placement_date: r.last_successful_placement_date
      }
    ])
  );

  const bedOptions = snfs
    .filter((f) => (f.acceptedInsurance || []).includes(insuranceType))
    .map((f) => {
      const neededBedTypes = calcRequiredBedTypes(diagnosisGroup, f);
      const bedsAvailable = sumBedsAvailable(f, neededBedTypes);
      const cfgAvg = Number(
        f.historicalAvgResponseMinutesByInsurance?.[insuranceType]
      );
      const metric = metricByName.get(f.name);
      const avgResponseMinutes = Number.isFinite(metric?.avg_response_minutes)
        ? metric.avg_response_minutes
        : Number.isFinite(cfgAvg)
          ? cfgAvg
          : 999;

      return {
        facilityName: f.name,
        phone: f.phone,
        bedsAvailable,
        avgResponseMinutes,
        distanceMiles: Number(f.distanceMiles || 0),
        lastSuccessfulPlacementDateISO: metric?.last_successful_placement_date
          ? new Date(metric.last_successful_placement_date).toISOString()
          : f.lastSuccessfulPlacementDateISO || null
      };
    })
    .filter((o) => o.bedsAvailable > 0);

  // Rank: beds available desc > avg response asc > distance asc
  bedOptions.sort((a, b) => {
    if (b.bedsAvailable !== a.bedsAvailable) return b.bedsAvailable - a.bedsAvailable;
    if (a.avgResponseMinutes !== b.avgResponseMinutes) return a.avgResponseMinutes - b.avgResponseMinutes;
    return a.distanceMiles - b.distanceMiles;
  });

  // Return top 3 options (or fewer if none)
  return bedOptions.slice(0, 3);
}

async function getPcpMatches({ insuranceType, preferredLanguage }) {
  const { config } = ensureConfigLoaded();
  const clinics = config.clinics || [];
  const lang = preferredLanguage || "English";

  // Sort with simple heuristic (network match is required; then proximity/availability)
  const matches = clinics
    .filter((c) => (c.insuranceNetworkAccepted || []).includes(insuranceType))
    .map((c) => ({
      clinicName: c.name,
      phone: c.phone,
      typicalWaitMinutes: Number(c.typicalWaitMinutes || 0),
      distanceMiles: Number(c.distanceMiles || 0),
      languagesSupported: c.languagesSupported || [],
      nextAvailableISO: c.nextAvailableISO || null,
      languageMatchScore: (c.languagesSupported || []).includes(lang) ? 1 : 0
    }))
    .sort((a, b) => {
      // Better language match first, then closer, then earliest next available
      if (b.languageMatchScore !== a.languageMatchScore) return b.languageMatchScore - a.languageMatchScore;
      if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles;
      const aT = a.nextAvailableISO ? new Date(a.nextAvailableISO).getTime() : Infinity;
      const bT = b.nextAvailableISO ? new Date(b.nextAvailableISO).getTime() : Infinity;
      return aT - bT;
    });

  return matches.slice(0, 2);
}

function createPredictedBarriers({ tasks, dischargeContext, recommendedSnfCount }) {
  const barriers = [];
  const hasSnfReferralPending =
    tasks.some((t) => t.task_type === "SNF_REFERRAL" && t.status !== "complete");

  if (hasSnfReferralPending) {
    barriers.push("Likely needs SNF - start placement now");
  }

  if (dischargeContext?.dischargeOrderPlaced && dischargeContext?.medsPrescribed) {
    barriers.push("Medication coordination needed for discharge timing");
  }

  if ((dischargeContext?.disposition || "") === "Home" && recommendedSnfCount === 0) {
    barriers.push("Discharge plan likely depends on home services availability");
  }

  return barriers;
}

module.exports = {
  getDiagnosisGroupForPatient,
  getTopSnfOptions,
  getPcpMatches,
  createPredictedBarriers
};

