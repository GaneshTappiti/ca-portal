# Phase 1 — Security & Data Integrity
**Clstr CA Portal | Claude Sonnet 4.6 (Claude Code) | Extended Thinking: ON**

---

## Instruction to Model

Before writing any code, **think deeply and step by step** about the current auth/data architecture, the attack surface each gap creates, and the correct fix — do not pattern-match to a generic tutorial solution. Use extended thinking to reason through edge cases (concurrent requests, token refresh, race conditions) before implementing. This phase touches security — mistakes here are the most expensive to leave in production, so prioritize correctness over speed.

Work through the items in this file **in order, one at a time**. Do not start Phase 2 until every item here is implemented and tested. Do not touch files outside this phase's scope.

---

## Why This Phase Exists

Right now the CA portal has no real security boundary: anyone can hammer the login endpoint, any authenticated MEMBER can potentially call LEAD-only APIs directly (the UI just hides the buttons — the server doesn't check), forms accept anything sent to them, and auth tokens sit in localStorage where any injected script (XSS) can read and steal them. Phase 1 closes these holes before any other feature work happens, because building Phase 2+ features on top of an insecure foundation means redoing them later.

---

## 1.3 — Rate Limiting on Auth

**How it works:** Rate limiting tracks how many auth attempts (login, signup, OTP requests) come from a given identity (IP address, device fingerprint, or account email) within a time window. Once the threshold is crossed, further attempts are rejected with a `429 Too Many Requests` until the window resets. This is what stops brute-force password guessing and OTP spam.

**Two layers required:**
- **Frontend debounce:** disable the submit button and show a cooldown timer after a failed attempt, so a normal user can't accidentally hammer the button — this is UX, not security.
- **Backend rate limit (the real protection):** middleware that counts attempts per identity in a store (Redis if available, in-memory sliding window if not) and blocks past a threshold (e.g., 5 attempts / 15 min, tune to your risk tolerance).

**Steps:**
1. Inspect the current auth route handlers to find where login/signup/OTP are processed.
2. Add backend rate-limiting middleware scoped to those specific routes (not global — you don't want to rate-limit the whole API).
3. Add frontend debounce/cooldown UI feedback so the block reads as "too many attempts, try again in Xs" not a raw 429 error.
4. **Test:** script 10 rapid login attempts with wrong credentials — confirm the backend blocks after the threshold regardless of what the frontend does (test by bypassing the frontend, e.g., curl/Postman).

---

## 1.4 — RBAC Enforcement on the API

**How it works:** Role-based access control means every protected API route checks the requester's role (LEAD or MEMBER) **on the server**, before executing the request — not just hiding UI elements client-side. A MEMBER hitting a LEAD-only endpoint directly (via devtools, curl, or a modified request) must get a `403 Forbidden`, full stop.

**Steps:**
1. Audit every backend route and classify it: public, MEMBER-accessible, LEAD-only.
2. Implement a single reusable middleware (e.g., `requireRole('LEAD')`) that reads the authenticated user's role from the verified session/token and rejects mismatches before the route handler runs.
3. Apply it to every LEAD-only route: team management, verification/approval endpoints, super-admin-adjacent actions.
4. **Test:** log in as MEMBER, grab the session token, manually call each LEAD-only endpoint (Postman/curl) — every one must return 403. Then confirm LEAD access still works normally.

---

## 1.5 — Input Validation (Zod)

**How it works:** Zod schemas define the exact shape, type, and constraints each payload must satisfy (string length, email format, enum values for status fields, etc.). Validating on the client gives fast user feedback; validating again on the server is the actual security boundary, since client-side checks can always be bypassed.

**Steps:**
1. Define Zod schemas for: auth forms (login/signup), task submission forms (proof URL/notes), task data payloads (status transitions, task creation).
2. Apply schemas client-side on form submit for immediate inline error messages.
3. Apply the **same** schemas server-side at the API boundary — reject with a clear 400 and field-level error detail if validation fails.
4. **Test:** submit each form with missing fields, wrong types, oversized strings, and invalid enum values — confirm clean rejection with no server crash or stack trace leak.

---

## 1.6 — Secure Token Storage

**How it works:** Tokens in localStorage are readable by any JavaScript running on the page, including injected malicious scripts (XSS). httpOnly cookies are invisible to JavaScript entirely — only the browser sends them automatically with requests — which removes that entire attack vector. `secure` ensures the cookie is only sent over HTTPS; `sameSite` limits cross-site request forgery exposure.

**Steps:**
1. Update the backend auth response to set the token as an httpOnly, secure, sameSite cookie instead of returning it in the JSON body for storage.
2. Remove all `localStorage.setItem('token', ...)` / `getItem` calls from the frontend.
3. Update every fetch/axios call to rely on the cookie being sent automatically (`credentials: 'include'` for fetch, `withCredentials: true` for axios) instead of manually attaching an `Authorization` header from localStorage.
4. Update logout to clear the cookie server-side.
5. **Test:** inspect browser Application tab — confirm no token in localStorage, confirm cookie has `HttpOnly` and `Secure` flags set, confirm auth still works across page refresh and logout clears the session.

---

## Phase 1 — Definition of Done

- [ ] Rate limiting blocks brute-force attempts at the backend, independent of frontend.
- [ ] Every LEAD-only route rejects MEMBER tokens with 403, verified by direct API calls.
- [ ] Every form is validated identically on client and server via Zod.
- [ ] No auth tokens exist in localStorage; cookies are httpOnly/secure/sameSite.
- [ ] No console errors, no regressions in existing login/logout/task flows.

**Only once every box above is checked, move to `phase-2-core-features.md`.**
