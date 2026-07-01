# Phase 2 — Core Features
**Clstr CA Portal | Claude Sonnet 4.6 (Claude Code) | Extended Thinking: ON**

---

## Instruction to Model

**Do not start this file until Phase 1 is fully complete and tested.**

Before writing code, think step by step about the full task lifecycle (`Open → Pending Review → Verified`) as a state machine — map out every valid transition and who is allowed to trigger it, before touching UI code. Use extended thinking to reason about data modeling (what does a "task" record actually need to persist?) before implementing, since a wrong schema here compounds through every later phase.

Work through items in order, one at a time. Test each before moving to the next.

---

## Why This Phase Exists

The portal currently *looks* functional but isn't: dashboard numbers are hardcoded, tasks vanish on refresh because nothing is persisted, "proof" is just a text box for pasting a URL, the "Add Teammate" button does nothing real, there's no way for a LEAD to actually approve/reject work, and nobody gets notified when anything happens. Phase 2 makes the app's core promise — assign a task, do it, prove it, get verified — actually work end to end.

---

## 2.1 — Real Metrics on the Dashboard

**How it works:** Dashboard stats (growth points, referrals, clubs) should be computed from real database state, not hardcoded constants. This typically means either a query that aggregates on read, or a denormalized counter updated on write (faster for high-traffic dashboards, but needs to stay in sync).

**Steps:**
1. Identify what each stat actually represents in the data model (e.g., "growth points" = sum of points from verified tasks for this user/campus).
2. Replace hardcoded values with real queries (or a maintained aggregate table if performance requires it).
3. Wire the dashboard component to fetch this from a real endpoint.
4. **Test:** verify a task, confirm the relevant stat updates on next dashboard load; confirm numbers match what's actually in the database.

---

## 2.2 — Persistent Tasks with Real Status Transitions

**How it works:** Tasks need a backend record with a `status` field constrained to `Open`, `Pending Review`, `Verified` (add `Rejected` if your workflow needs it). Transitions should only happen through defined actions (submit → Pending Review; approve → Verified; reject → back to Open or a Rejected state), never by directly overwriting status from arbitrary client input.

**Steps:**
1. Model the task table/collection with status as an enum, plus timestamps for each transition.
2. Build API endpoints for the specific transitions (not a generic "update status" endpoint that accepts anything).
3. Update the frontend to read task state from the backend on load — remove any local/in-memory-only task state.
4. **Test:** create a task, submit it, refresh the page — task and its Pending Review status must survive. Attempt an invalid transition (e.g., Open → Verified directly) — must be rejected.

---

## 2.3 — Real Proof Upload

**How it works:** Instead of a "Proof URL" text field (which trusts the user to have already uploaded somewhere else), the app should accept a file directly and upload it to object storage (S3 or Cloudinary) via a presigned URL — the browser uploads straight to storage, and the backend only stores the resulting file reference, not the file itself.

**Steps:**
1. Backend: endpoint to generate a presigned upload URL scoped to the authenticated user/task.
2. Frontend: replace the text input with a file picker (image/video), upload directly to the presigned URL, then submit the returned file reference with the task submission.
3. Store the file reference on the task record; render it back as an image/video preview in the review UI.
4. **Test:** upload a real file, confirm it lands in the storage bucket, confirm the LEAD review screen can view it, confirm oversized/wrong-type files are rejected client-side and server-side.

---

## 2.4 — Real Team Management

**How it works:** The LEAD's "Add Teammate" flow needs to actually create a relationship between the LEAD's team and a new member — typically via an invite (email or code) that the invitee accepts, rather than instantly adding an unverified account.

**Steps:**
1. Design the invite flow: LEAD sends invite (email/link/code) → invitee accepts → CRUD relationship created in the database.
2. Build endpoints: create invite, accept invite, list team members, remove member.
3. Replace the mocked "Add Teammate" button with the real flow; build a team list view with remove capability.
4. **Test:** send an invite, accept it as a second test account, confirm it appears in the LEAD's team list and persists on refresh; remove a member and confirm they lose team-scoped access.

---

## 2.5 — Verification Workflow

**How it works:** This is where Phase 1's RBAC and Phase 2.2's status machine meet: a LEAD/Moderator-only view lists all `Pending Review` submissions, and approving/rejecting calls the transition endpoints from 2.2, enforced by the RBAC middleware from 1.4.

**Steps:**
1. Build a review queue view (LEAD/Moderator only) listing all Pending Review tasks with their proof (from 2.3).
2. Wire Approve → status `Verified`; Reject → status back to `Open` or `Rejected`, with an optional reason field.
3. Ensure this view and its endpoints are protected by the RBAC middleware — a MEMBER must not be able to reach it even by direct URL/API call.
4. **Test:** submit a task as MEMBER, approve/reject it as LEAD, confirm status updates correctly and MEMBER cannot access the review endpoint directly.

---

## 2.6 — Notifications

**How it works:** An in-app notification center is a list of events (new submission, approved, rejected) tied to a user, marked read/unread. Email alerts are the same events pushed through an email service on status change. Both are triggered from the same place: the status-transition logic in 2.2/2.5, so notification creation should hook into that transition code rather than being scattered across the UI.

**Steps:**
1. Add a notification model: recipient, type, message, read/unread, timestamp.
2. Hook notification creation into the transition endpoints (task submitted → notify LEAD; approved/rejected → notify submitter).
3. Build the in-app notification center UI (bell icon, dropdown/list, mark-as-read).
4. Wire email sending on the same trigger points via your email provider.
5. **Test:** submit a task and confirm the LEAD gets both an in-app notification and an email; approve it and confirm the MEMBER gets notified both ways.

---

## Phase 2 — Definition of Done

- [ ] Dashboard stats reflect real database state, verified against actual records.
- [ ] Tasks and their status persist across refresh with enforced valid transitions only.
- [ ] Proof is a real uploaded file in object storage, viewable in the review UI.
- [ ] Team management is a real invite + CRUD flow, no mock data.
- [ ] LEAD/Moderator can approve/reject from a protected review queue.
- [ ] Notifications fire in-app and via email on every status change.
- [ ] Full lifecycle test passes: create → submit → review → approve → notify → persists on refresh.

**Only once every box above is checked, move to the next phase file (confirm with the user whether Phase 3 content exists first).**
