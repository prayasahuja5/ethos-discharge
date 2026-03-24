const fs = require("fs");
const path = require("path");

const { db } = require("./db");
const { ensureConfigLoaded } = require("./util");

async function runMigrationsIfNeeded() {
  // Core schema
  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      epic_patient_id TEXT UNIQUE NOT NULL,
      age INT,
      insurance_type TEXT,
      admission_source TEXT,
      diagnosis_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
      expected_los_days INT,
      comorbidities JSONB NOT NULL DEFAULT '[]'::jsonb,
      readmission_days INT,
      no_pcp_on_file BOOLEAN NOT NULL DEFAULT false,
      complexity_score INT,
      is_high_priority BOOLEAN NOT NULL DEFAULT false,
      flags JSONB NOT NULL DEFAULT '{}'::jsonb,
      demographics JSONB NOT NULL DEFAULT '{}'::jsonb,
      assigned_case_manager_id TEXT,
      floor TEXT,
      anticipated_disposition TEXT,
      manual_task_list JSONB NOT NULL DEFAULT '[]'::jsonb,
      discharge_order_placed_at TIMESTAMPTZ,
      meds_prescribed BOOLEAN NOT NULL DEFAULT false,
      expected_discharge_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_event_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS patient_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      epic_message_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      origin TEXT NOT NULL CHECK (origin IN ('manual', 'auto')),
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','blocked','complete')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS placement_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      snf_name TEXT NOT NULL,
      insurance_type TEXT NOT NULL,
      diagnosis_group TEXT NOT NULL,
      referral_sent_at TIMESTAMPTZ,
      responded_at TIMESTAMPTZ,
      response_minutes NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS snf_response_metrics (
      snf_name TEXT NOT NULL,
      insurance_type TEXT NOT NULL,
      diagnosis_group TEXT NOT NULL,
      avg_response_minutes NUMERIC,
      last_successful_placement_date TIMESTAMPTZ,
      attempts INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (snf_name, insurance_type, diagnosis_group)
    );
  `);

  // Seed SNF metrics from config (best-effort idempotent upsert)
  const { config } = ensureConfigLoaded();
  const snfs = config.snfFacilities || [];
  for (const snf of snfs) {
    const diagnosisGroups = Object.keys(snf.bedTypesNeededForDiagnosisGroup || {});
    for (const diagnosisGroup of diagnosisGroups) {
      const metricsUpsert = `
        INSERT INTO snf_response_metrics (snf_name, insurance_type, diagnosis_group, avg_response_minutes, last_successful_placement_date, attempts)
        VALUES ($1, $2, $3, $4, $5, 1)
        ON CONFLICT (snf_name, insurance_type, diagnosis_group)
        DO UPDATE SET
          avg_response_minutes = EXCLUDED.avg_response_minutes,
          last_successful_placement_date = COALESCE(EXCLUDED.last_successful_placement_date, snf_response_metrics.last_successful_placement_date),
          updated_at = now(),
          attempts = snf_response_metrics.attempts
      `;
      for (const [insuranceType, avgMinutes] of Object.entries(
        snf.historicalAvgResponseMinutesByInsurance || {}
      )) {
        await db.query(metricsUpsert, [
          snf.name,
          insuranceType,
          diagnosisGroup,
          avgMinutes,
          snf.lastSuccessfulPlacementDateISO ? new Date(snf.lastSuccessfulPlacementDateISO) : null
        ]);
      }
    }
  }

  // Seed at least one patient queue for UI stability (no-op if already exists)
  await db.query(`
    UPDATE patients SET last_event_at = last_event_at;
  `);
}

module.exports = { runMigrationsIfNeeded };

