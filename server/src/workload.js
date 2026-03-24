const { ensureConfigLoaded } = require("./util");
const { db } = require("./db");

async function assignCaseManager({ floor, isHighPriority }) {
  const { config } = ensureConfigLoaded();
  const caseManagers = config.caseManagers || [];

  const eligible = caseManagers.filter((cm) => (cm.floors || []).includes(floor));
  const pool = eligible.length ? eligible : caseManagers;

  // Weighted queue depth by patient complexity for patients with any non-complete tasks.
  const q = `
    SELECT p.assigned_case_manager_id AS case_manager_id,
           COALESCE(SUM(CASE WHEN p.is_high_priority THEN 2 ELSE 1 END), 0) AS weighted_queue
    FROM patients p
    WHERE p.assigned_case_manager_id = ANY($1)
      AND EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.patient_id = p.id AND t.status <> 'complete'
      )
      AND p.floor = $2
    GROUP BY p.assigned_case_manager_id
  `;

  const ids = pool.map((cm) => cm.id);
  const result = await db.query(q, [ids, floor]);
  const byId = new Map(result.rows.map((r) => [r.case_manager_id, Number(r.weighted_queue || 0)]));

  let chosen = pool[0];
  let chosenLoad = byId.get(chosen.id) ?? 0;
  for (const cm of pool) {
    const load = byId.get(cm.id) ?? 0;
    if (load < chosenLoad) {
      chosen = cm;
      chosenLoad = load;
    }
  }

  // Complexity weighting for the *new* patient: high-priority counts as 2x
  return {
    caseManagerId: chosen.id,
    caseManagerName: chosen.name,
    projectedWeightedLoad: chosenLoad + (isHighPriority ? 2 : 1)
  };
}

module.exports = { assignCaseManager };

