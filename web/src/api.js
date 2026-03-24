const API_BASE = import.meta.env.VITE_API_BASE || "";

async function postJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchDashboard() {
  return getJson("/api/dashboard");
}

export async function fetchSampleMessages() {
  return getJson("/api/sample-messages");
}

export async function sendAdtMessage(message) {
  return postJson("/api/adt", message);
}

export async function updateTaskStatus(taskId, status) {
  return postJson(`/api/tasks/${taskId}/status`, { status });
}

export async function simulateSnfResponse({ patientId, epicPatientId, facilityName, respondedAtISO }) {
  return postJson("/api/sim/snf-response", {
    patientId,
    epicPatientId,
    facilityName,
    respondedAtISO
  });
}

