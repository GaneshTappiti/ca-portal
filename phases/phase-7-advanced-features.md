# Phase 7 — Advanced / Future Features
**Clstr CA Portal | Claude Sonnet 4.6 (Claude Code) | Extended Thinking: ON**

---

## Instruction to Model

**Do not start this file until Phase 5 is complete, and Phase 6 has been explicitly confirmed with the user (content missing from source audit).**

This phase introduces real architectural complexity (multi-tenant admin views, real-time infra, internationalization). Before implementing each item, think through the data and infra implications carefully with extended thinking — these are the items most likely to require infrastructure decisions (e.g., which real-time provider, how the org tree is modeled) that should be confirmed with the user before large amounts of code are written, rather than assumed silently.

Work through items in order, one at a time. Confirm scope/infra choice with the user before starting 7.4 and 7.5 specifically, since both involve infrastructure decisions with cost/complexity implications.

---

## Why This Phase Exists

Everything up to this point makes the current single-campus, single-role-tier app solid, fast, and accessible. Phase 7 is what turns it into a platform: proof upload becomes a real drag-and-drop experience instead of a basic file picker, a single super-admin can see and manage every campus at once, task updates and notifications happen live instead of on refresh, and the app becomes usable for non-English-speaking users. These are additive — nothing here should require re-touching Phase 1–5 work, only extending it.

---

## 7.3 — Drag & Drop File Upload (extends Phase 2.3)

**How it works:** This builds on the presigned-URL upload from Phase 2.3, replacing the basic file picker with a drag-and-drop zone that accepts image/video files dropped anywhere in a designated area, with upload progress feedback.

**Steps:**
1. Build a drop-zone component (drag-over visual state, drop handler) layered on top of the existing presigned-upload logic from 2.3 — don't rebuild the upload mechanism, just the interaction layer.
2. Add upload progress indication (percentage or spinner tied to the actual upload request).
3. Support both drag-drop and click-to-browse as fallback (accessibility — not everyone can drag files, especially on mobile or with motor impairments).
4. **Test:** drag and drop a valid file — confirm upload succeeds with progress feedback; drop an invalid type/oversized file — confirm clean rejection; confirm click-to-browse still works as a fallback.

---

## 7.4 — Multi-Campus Super-Admin View

**How it works:** This introduces a new role tier above LEAD (Super-Admin) that can see and manage data across *all* campuses, not just one. It requires a hierarchical org model (Super-Admin → Campus → Team/LEAD → Members) and a dedicated dashboard that aggregates/filters by campus.

**⚠️ Confirm with user before starting:** how campuses are currently represented in the data model (if at all), and whether Super-Admin is a new role or an extension of LEAD permissions — this affects Phase 1's RBAC middleware and needs a decision, not an assumption.

**Steps:**
1. Model the org hierarchy (campus entity, campus-scoped teams, super-admin role) in the backend.
2. Extend the RBAC middleware from Phase 1.4 to recognize the new Super-Admin role and its cross-campus permissions.
3. Build the super-admin dashboard: campus selector/tree view, aggregated metrics across campuses, drill-down into any single campus's normal LEAD-level view.
4. **Test:** confirm a Super-Admin can view and act across multiple campuses; confirm a regular LEAD still cannot see other campuses' data even by direct API call.

---

## 7.5 — Real-Time Updates

**How it works:** Instead of requiring a page refresh to see new task submissions, approvals, or notifications, a real-time channel (WebSocket or Supabase Realtime, depending on your backend) pushes updates to connected clients as events happen, hooking into the same transition points established in Phase 2.2/2.5/2.6.

**⚠️ Confirm with user before starting:** which real-time provider to use (raw WebSocket server vs. Supabase Realtime) — this depends on your existing backend/database choice and has different infra implications.

**Steps:**
1. Set up the chosen real-time channel/provider.
2. Hook publish events into the existing transition logic (task submitted, approved, rejected, notification created) — reuse Phase 2's trigger points rather than duplicating logic.
3. Subscribe the frontend (task grid, review queue, notification center) to relevant channels and update state on incoming events, without requiring a manual refresh.
4. **Test:** with two browser sessions open (one LEAD, one MEMBER), submit a task in one and confirm it appears live in the other's review queue without refreshing; approve it and confirm the live status update and notification.

---

## 7.6 — Internationalization (i18n)

**How it works:** `react-i18next` externalizes all user-facing strings into language resource files, and swaps them based on the user's selected/detected locale, without changing any component logic.

**Steps:**
1. Set up `react-i18next` with an initial language resource file extracted from all current hardcoded UI strings.
2. Replace hardcoded strings across the app with translation keys (`t('key')`).
3. Add a language selector; persist the user's choice.
4. **Test:** switch languages and confirm every screen — including toasts, validation errors from Phase 1.5, and notifications from Phase 2.6 — renders in the selected language with no leftover hardcoded English strings.

---

## Phase 7 — Definition of Done

- [ ] Drag-and-drop upload works with progress feedback and a working fallback.
- [ ] Super-Admin can operate across campuses; lower roles remain correctly restricted.
- [ ] Task/notification updates appear live across sessions without refresh.
- [ ] Full app is translatable with no hardcoded strings remaining, confirmed by a full language switch test.

**This is the final phase in the provided scope — confirm with the user that Phase 3 and Phase 6 have been addressed (either sourced and completed, or explicitly descoped) before declaring the project production-ready.**
