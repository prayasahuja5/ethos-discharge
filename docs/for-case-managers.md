# For Case Managers — Ethos Discharge Agent Guide

> **This is your tool. This document explains what it does and how to use it.**
> Plain English — no jargon.

---

## What Problem Does This Solve?

Right now, after a doctor signs a discharge order, patients often wait 4+ hours before they actually leave — **not because of any medical reason**, but because:

- Nobody told the pharmacy the patient is leaving
- The SNF hasn't confirmed a bed yet
- It's unclear who owns which next step
- The face sheet has to be faxed manually (and gets lost or delayed)

Ethos closes those gaps automatically.

---

## What Ethos Does at Each Step

### When a Patient Is Admitted
As soon as the admission event comes in from Epic, Ethos:

1. **Reads the patient record** (diagnosis, insurance, PCP status, floor)
2. **Calculates a complexity score** (how many urgent tasks will this patient generate?)
3. **Assigns you as the case manager** (based on floor and your current workload)
4. **Builds the discharge checklist** for this patient

You don't need to do anything — the checklist appears automatically on your dashboard.

---

### During the Stay

Depending on the patient's situation, Ethos may auto-create these tasks:

| Task | What It Means | Why It Matters |
|------|-------------|---------------|
| **SNF Referral** | Patient needs skilled nursing facility | Ethos ranks top 3 options by beds available, insurance match, and how fast they typically respond. You just confirm. |
| **PCP Placement** | Patient has no primary care physician | Ethos finds insurance-matched clinics near the patient's zip. 80% of our patients need this. |
| **Pharmacy Coordination** | Meds-to-Beds trigger | ← See next section |
| **Transportation** | Patient needs a ride | Created when discharge order is signed |
| **Post-Discharge Follow-Up** | 24h / 7d / 30d check-in | Auto-scheduled so no patient falls through |

---

### The Meds-to-Beds Moment (Most Important)

**Before Ethos**: Doctor signs discharge at 12 PM → someone manually faxes a face sheet to the pharmacy → pharmacy finds out 45–90 minutes later → meds aren't ready → patient waits.

**With Ethos**: Doctor signs discharge → Ethos instantly notifies pharmacy with all patient info → no faxing → meds are prepared within the discharge window → patient gets meds at bedside before leaving.

---

### Using the Dashboard

**Left panel — ADT Simulator**: During the pilot, you use this to send test patient events. In production, this is replaced by Epic's real-time feed.

**Right panel — Patient Dashboard**:
- Each card is one patient
- Click anywhere on the card header to expand/collapse
- **Red border** = high priority patient
- **Alerts** (top of card) = time-sensitive items, act now
- **SNF options and PCP matches** = pre-filtered for this patient's insurance
- **Auto-generated tasks** = update status as you work (pending → in progress → complete)

---

## Key Things to Know

- **You don't create tasks manually** — the rules engine does it. You just update their status.
- **The SNF ranking learns over time** — when you log an SNF response, that facility's average response time is updated. Faster facilities get ranked higher for future patients.
- **Complexity score 5+ = high priority** — these patients get flagged for immediate attention.
- **The dashboard polls every 30 seconds** — you don't need to refresh.

---

## Common Questions

**Q: What if the SNF options don't match my patient?**
The list is filtered by insurance type and diagnosis group. If none fit, it likely means there's no facility in our directory that accepts this patient's insurance for this diagnosis. Contact the charge nurse to expand the search manually.

**Q: What if the auto-generated task is wrong?**
Update its status to "blocked" and add a note. We track this to improve the rules engine.

**Q: How do I add a patient who didn't come through Epic?**
Use the ADT Simulator on the left — paste a JSON message with the patient's details and hit Send.
