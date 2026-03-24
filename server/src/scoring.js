function computeComplexityScore(patient) {
  const age = Number(patient.age);
  const insuranceType = patient.insuranceType || patient.insurance_type;
  const diagnosisCodes = patient.diagnosisCodes || patient.diagnosis_codes || [];
  const readmissionDays = patient.readmissionDays ?? patient.readmission_days;
  const comorbidities = patient.comorbidities || [];
  const noPcpOnFile = Boolean(patient.noPcpOnFile ?? patient.no_pcp_on_file);

  let score = 0;
  const flags = {};

  if (Number.isFinite(age) && age > 65) {
    score += 2;
    flags.ageGt65 = true;
  }

  if (insuranceType === "Medicaid" || insuranceType === "Uninsured") {
    score += 2;
    flags.medicaidOrUninsured = true;
  }

  if (noPcpOnFile) {
    score += 3;
    flags.noPcp = true;
  }

  if (Number.isFinite(readmissionDays) && readmissionDays < 30) {
    score += 2;
    flags.readmissionLt30 = true;
  }

  const comorbCount = Array.isArray(comorbidities) ? comorbidities.length : 0;
  score += comorbCount;
  if (comorbCount > 0) flags.comorbiditiesCount = comorbCount;

  // Substance abuse: any ICD-10 code F10–F19
  const substanceAbusePrefixes = new Set(
    Array.from({ length: 10 }, (_, i) => `F${String(i + 10).padStart(2, "0")}`)
  );
  const hasSubstanceAbuse = diagnosisCodes.some((c) =>
    substanceAbusePrefixes.has(String(c).substring(0, 3).toUpperCase())
  );
  if (hasSubstanceAbuse) {
    score += 2;
    flags.substanceAbuse = true;
  }

  const isHighPriority = score >= 5;

  return {
    score,
    isHighPriority,
    flags,
    diagnosisCodes
  };
}

module.exports = { computeComplexityScore };

