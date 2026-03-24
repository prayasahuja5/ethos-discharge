import React, { useEffect, useMemo, useState } from "react";
import {
  fetchDashboard,
  fetchSampleMessages,
  sendAdtMessage,
  simulateSnfResponse,
  updateTaskStatus
} from "./api";

// ── Helpers ─────────────────────────────────────────────────────
function safeJsonParse(text) {
  try { return { value: JSON.parse(text), error: null }; }
  catch (e) { return { value: null, error: e?.message || "Invalid JSON" }; }
}

function taskBadgeClass(taskType) {
  const map = {
    SNF_REFERRAL: "badge-red",
    PCP_PLACEMENT: "badge-amber",
    PHARMACY_COORDINATION: "badge-teal",
    TRANSPORTATION: "badge-purple",
    POST_DISCHARGE_FOLLOW_UP: "badge-green",
  };
  return map[taskType] || "badge-gray";
}

function statusBadgeClass(status) {
  if (status === "complete")    return "badge-green";
  if (status === "in_progress") return "badge-teal";
  if (status === "blocked")     return "badge-red";
  return "badge-gray";
}

const TASK_ICONS = {
  SNF_REFERRAL:             "🏥",
  PCP_PLACEMENT:            "👤",
  PHARMACY_COORDINATION:    "💊",
  TRANSPORTATION:           "🚗",
  POST_DISCHARGE_FOLLOW_UP: "📞",
};

// ── Stat bar KPIs (M2B context) ─────────────────────────────────
const M2B_STATS = [
  { color: "teal",  label: "Monthly Discharges",  value: "800",   sub: "Total hospital volume" },
  { color: "amber", label: "In M2B Program",       value: "80",    sub: "10% — pilot cohort" },
  { color: "red",   label: "Avg Nonmed Delay",     value: "4.4h",  sub: "Before Ethos" },
  { color: "green", label: "Month 1 Improvement",  value: "−1.5h", sub: "Delay: 4.4h → 3.0h" },
];

// ── App ──────────────────────────────────────────────────────────
export default function App() {
  const [dashboard, setDashboard]         = useState(null);
  const [serverTime, setServerTime]       = useState(null);
  const [polling, setPolling]             = useState(true);
  const [sampleMessages, setSampleMessages] = useState([]);
  const [selectedSampleIdx, setSelectedSampleIdx] = useState(0);
  const [messageText, setMessageText]     = useState("");
  const [sendStatus, setSendStatus]       = useState({ type: "neutral", message: "" });

  // Load sample messages
  useEffect(() => {
    fetchSampleMessages()
      .then((samples) => {
        const arr = Array.isArray(samples) ? samples : [];
        setSampleMessages(arr);
        const first = arr[0]?.message;
        if (first) setMessageText(JSON.stringify(first, null, 2));
      })
      .catch((e) => setSendStatus({ type: "err", message: e?.message || "Failed to load samples" }));
  }, []);

  // Sync textarea with selected sample
  useEffect(() => {
    const msg = sampleMessages[selectedSampleIdx]?.message;
    if (msg) setMessageText(JSON.stringify(msg, null, 2));
  }, [selectedSampleIdx]);

  // Dashboard polling
  async function refreshDashboard() {
    const res = await fetchDashboard();
    setDashboard(res.patients || []);
    setServerTime(res.serverTimeISO);
  }

  useEffect(() => {
    refreshDashboard().catch(() => {});
    if (!polling) return;
    const t = setInterval(() => refreshDashboard().catch(() => {}), 30000);
    return () => clearInterval(t);
  }, [polling]);

  const patients = useMemo(() => dashboard || [], [dashboard]);

  async function handleSend() {
    const parsed = safeJsonParse(messageText);
    if (parsed.error) { setSendStatus({ type: "err", message: parsed.error }); return; }
    setSendStatus({ type: "neutral", message: "Sending…" });
    try {
      const res = await sendAdtMessage(parsed.value);
      setSendStatus({ type: "ok", message: `✓ Processed. Patient ID: ${res?.patientId || "n/a"}` });
      await refreshDashboard();
    } catch (e) {
      setSendStatus({ type: "err", message: e?.message || "Request failed" });
    }
  }

  async function handleTaskStatus(taskId, status) {
    await updateTaskStatus(taskId, status);
    await refreshDashboard();
  }

  async function handleSnfResponse(patientId, facilityName) {
    await simulateSnfResponse({ patientId, facilityName });
    await refreshDashboard();
  }

  return (
    <div>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <span>
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Ethos </span>
            <span style={{
              background: "linear-gradient(90deg, #00D2FF, #4E8FFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>Discharge Agent</span>
          </span>
        </div>
        <div className="topbar-right">
          <span>
            <span className="live-dot" />
            Polling every 30s · {serverTime ? new Date(serverTime).toLocaleTimeString() : "—"}
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            {patients.length} active patient{patients.length !== 1 ? "s" : ""}
          </span>
          <button className="btn btn-sm" onClick={() => setPolling(p => !p)}>
            {polling ? "⏸ Pause" : "▶ Resume"}
          </button>
          <button className="btn btn-sm btn-primary" onClick={refreshDashboard}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="layout">
        {/* ── Sidebar: ADT Simulator ── */}
        <div className="sidebar">
          <div className="panel-title">ADT Message Simulator</div>
          <p className="small" style={{ marginBottom: "1rem", lineHeight: 1.5 }}>
            Send simulated Epic ADT/FHIR-like events into the Ethos rules engine to generate tasks.
          </p>

          <select
            className="sample-select"
            value={selectedSampleIdx}
            onChange={(e) => setSelectedSampleIdx(Number(e.target.value))}
          >
            {sampleMessages.map((s, idx) => (
              <option key={s.label} value={idx}>{s.label}</option>
            ))}
          </select>

          <textarea
            className="msg-textarea"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
          />

          <div className="send-row">
            <span className={`send-status ${sendStatus.type}`}>{sendStatus.message}</span>
            <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={!messageText.trim()}>
              Send →
            </button>
          </div>

          {/* M2B bottleneck reference */}
          <hr className="divider" style={{ marginTop: "1.5rem" }} />
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>Key Bottlenecks</div>
          {[
            { icon: "🏥", label: "SNF placement", val: "avg 28 hrs" },
            { icon: "💊", label: "Pharmacy fax gap", val: "45–90 min" },
            { icon: "👤", label: "Missing PCP", val: "80% of patients" },
            { icon: "📋", label: "Manual input", val: "inconsistent" },
          ].map((b) => (
            <div key={b.label} style={{
              display: "flex", justifyContent: "space-between",
              padding: "0.5rem 0", borderBottom: "1px solid var(--border)",
              fontSize: "0.75rem"
            }}>
              <span style={{ color: "var(--text-muted)" }}>{b.icon} {b.label}</span>
              <span style={{ color: "var(--amber)", fontWeight: 600 }}>{b.val}</span>
            </div>
          ))}
        </div>

        {/* ── Main: Dashboard ── */}
        <div className="main">
          {/* KPI Stats */}
          <div className="stats-bar">
            {M2B_STATS.map((s) => (
              <div key={s.label} className={`stat-card ${s.color}`}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Section header */}
          <div className="section-hdr">
            <span className="section-title">Patient Dashboard</span>
            <span className="section-sub">Auto-generated tasks · ranked resources · real-time alerts</span>
          </div>

          {/* Patient cards */}
          {dashboard === null ? (
            <div className="empty-state">
              <div className="spinner" />
              <div className="small">Loading patient data…</div>
            </div>
          ) : patients.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏥</div>
              <div className="empty-title">No patients yet</div>
              <div className="empty-sub">
                Send an <strong>ADT-A01</strong> admission event using the simulator on the left.
                <br />The rules engine will auto-generate a discharge checklist.
              </div>
            </div>
          ) : (
            <div className="patient-list">
              {patients.map((p) => (
                <PatientCard
                  key={p.patientId}
                  p={p}
                  onTaskStatus={handleTaskStatus}
                  onSnfResponse={handleSnfResponse}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PatientCard component ────────────────────────────────────────
function PatientCard({ p, onTaskStatus, onSnfResponse }) {
  const [expanded, setExpanded] = useState(true);

  const pendingTasks  = (p.autoTasks || []).filter(t => t.status !== "complete").length;
  const doneTasks     = (p.autoTasks || []).filter(t => t.status === "complete").length;
  const totalTasks    = (p.autoTasks || []).length;

  return (
    <div className={`patient-card ${p.isHighPriority ? "high-priority" : ""}`}>
      {/* Header */}
      <div className="patient-header" onClick={() => setExpanded(e => !e)} style={{ cursor: "pointer" }}>
        <div>
          <div className="patient-id">
            Patient {p.epicPatientId}
            {p.isHighPriority && <span className="badge badge-red" style={{ marginLeft: 10 }}>High Priority</span>}
          </div>
          <div className="patient-meta">
            {[
              p.insuranceType,
              p.floor ? `Floor ${p.floor}` : null,
              p.anticipatedDisposition ? `→ ${p.anticipatedDisposition}` : null,
              p.expectedLosDays ? `${p.expectedLosDays}d expected LOS` : null,
            ].filter(Boolean).join("  ·  ")}
          </div>
          <div className="patient-meta" style={{ marginTop: 4 }}>
            Flags:{" "}
            {Object.entries(p.flags || {})
              .filter(([_, v]) => Boolean(v) && !Array.isArray(v))
              .map(([k]) => (
                <span key={k} className="badge badge-gray" style={{ marginRight: 4 }}>{k}</span>
              ))}
          </div>
        </div>

        <div className="complexity-badge">
          <span className={`badge ${p.complexityScore >= 5 || p.isHighPriority ? "badge-red" : p.complexityScore <= 2 ? "badge-green" : "badge-amber"}`}>
            Score {p.complexityScore}
          </span>
          <span className="badge badge-gray">{doneTasks}/{totalTasks} tasks</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: 4 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {expanded && (
        <>
          {/* Alerts */}
          {p.alerts?.length > 0 && (
            <div className="alerts-row">
              <span style={{ fontSize: "0.65rem", color: "var(--red)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 6 }}>
                ⚠ Alerts
              </span>
              {p.alerts.map((a) => (
                <span key={a.type} className="alert-chip">{a.message}</span>
              ))}
            </div>
          )}

          {/* Next steps */}
          {p.nextSteps?.length > 0 && (
            <div className="nextsteps-row">
              <span className="nextstep-label">Next:</span>
              {p.nextSteps.map((s, i) => (
                <span key={i} className="badge badge-teal">{s.label}</span>
              ))}
            </div>
          )}

          {/* Resources */}
          <div className="resources-grid">
            <div className="resource-col">
              <div className="resource-label">🏥 Top SNF Options</div>
              {p.recommendedSnfOptions?.length ? p.recommendedSnfOptions.map((s) => (
                <div key={s.facilityName} className="resource-item">
                  <div className="resource-name">{s.facilityName}</div>
                  <div className="resource-detail">
                    {s.bedsAvailable} beds · {Math.round(s.avgResponseMinutes)} min avg · {s.distanceMiles?.toFixed(1)} mi · {s.phone}
                  </div>
                </div>
              )) : <div className="small">No SNF matches (check insurance/diagnosis)</div>}
            </div>
            <div className="resource-col">
              <div className="resource-label">👤 PCP Clinic Matches</div>
              {p.recommendedPcpMatches?.length ? p.recommendedPcpMatches.map((c) => (
                <div key={c.clinicName} className="resource-item">
                  <div className="resource-name">{c.clinicName}</div>
                  <div className="resource-detail">
                    {c.typicalWaitMinutes} min wait · {c.distanceMiles?.toFixed(1)} mi · {c.phone}
                  </div>
                </div>
              )) : <div className="small">No PCP matches for this insurance</div>}
            </div>
          </div>

          {/* Predicted barriers */}
          {p.predictedDischargeBarriers?.length > 0 && (
            <div className="barriers-row">
              <span className="barrier-label">Predicted barriers:</span>
              {p.predictedDischargeBarriers.map((b, i) => (
                <span key={i} className="badge badge-amber">{b}</span>
              ))}
            </div>
          )}

          {/* Tasks comparison */}
          <div className="tasks-section">
            <div className="panel-title">Task Comparison — Manual vs Auto-Generated</div>
            <div className="task-compare">
              {/* Manual baseline */}
              <div>
                <div className="task-col-title">Manual Baseline (Current State)</div>
                {p.manualTaskList?.length ? p.manualTaskList.map((t) => (
                  <div key={t.taskType} className="manual-task-item">
                    <span className="badge badge-gray">{t.taskType}</span>
                    <span style={{ fontSize: "0.75rem" }}>{t.title}</span>
                  </div>
                )) : <div className="small">None</div>}
              </div>

              {/* Auto-generated */}
              <div>
                <div className="task-col-title">Ethos Auto-Generated</div>
                {p.autoTasks?.length ? p.autoTasks.map((t) => (
                  <div key={t.taskId} className="auto-task-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div className="auto-task-name">
                          {TASK_ICONS[t.taskType] || "📋"} {t.title}
                        </div>
                        <div className="auto-task-meta">{t.taskType}</div>
                      </div>
                      <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
                    </div>

                    {t.taskType === "SNF_REFERRAL" && p.recommendedSnfOptions?.length > 0 && (
                      <div className="snf-sim-row">
                        <select id={`snf_${t.taskId}`} className="snf-select">
                          {p.recommendedSnfOptions.map((s) => (
                            <option key={s.facilityName} value={s.facilityName}>
                              {s.facilityName} ({s.bedsAvailable} beds)
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            const sel = document.getElementById(`snf_${t.taskId}`);
                            if (sel?.value) onSnfResponse(p.patientId, sel.value);
                          }}
                        >
                          Log Response
                        </button>
                      </div>
                    )}

                    <div className="task-status-row">
                      <select id={`st_${t.taskId}`} defaultValue={t.status} className="status-select">
                        {["pending", "in_progress", "blocked", "complete"].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          const sel = document.getElementById(`st_${t.taskId}`);
                          if (sel?.value) onTaskStatus(t.taskId, sel.value);
                        }}
                      >
                        Update
                      </button>
                    </div>
                  </div>
                )) : <div className="small">No auto-tasks generated yet.</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
