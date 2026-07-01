# Phase 4 — Accessibility
**Clstr CA Portal | Claude Sonnet 4.6 (Claude Code) | Extended Thinking: ON**

---

## Instruction to Model

**Do not start this file until Phase 2 is complete, and Phase 3 has been explicitly confirmed with the user (content missing from source audit).**

Before writing code, think through each interaction as a keyboard-only and screen-reader-only user would experience it — not just "does an aria attribute exist" but "does the experience actually make sense without a mouse or without sight." Use extended thinking to trace focus order and announcement order before implementing, since accessibility bugs are easy to introduce silently while fixing another one.

Also consult the `frontend-design` skill before any visual changes here (contrast fixes, table layout) so fixes stay consistent with the existing dark-mode visual language rather than looking bolted on.

Work through items in order, one at a time. Test each before moving to the next.

---

## Why This Phase Exists

The app currently works for a mouse-and-sighted user only. Modals trap nothing (focus can escape behind the overlay and get lost), nothing is reachable by keyboard alone, screen readers announce almost nothing useful, motion-sensitive users get animations forced on them, some text fails minimum contrast standards, and toast messages appear and disappear without ever being announced. Phase 4 makes the app usable — and legally safer — for everyone, not just the majority-case user.

---

## 4.1 — Focus Trap in Modals

**How it works:** A focus trap keeps Tab/Shift+Tab cycling *within* an open modal (e.g., `SubmissionModal`) instead of letting focus escape to elements behind the overlay, which is disorienting and breaks the "modal" mental model entirely for keyboard users. On close, focus must return to the element that triggered the modal.

**Steps:**
1. Wrap `SubmissionModal`'s content with `focus-trap-react` (or equivalent).
2. On open, move focus to the first focusable element (or the modal container) inside it.
3. On close (Escape key or explicit close), return focus to the trigger element.
4. **Test:** open the modal, Tab repeatedly — focus must never land on anything behind the overlay; Escape closes it and focus returns to the button that opened it.

---

## 4.2 — Keyboard Navigation for the Task Grid

**How it works:** A grid of task cards should behave like a native list to a keyboard user: arrow keys move focus between cards, Enter/Space activates the focused card's primary action (open/select), without requiring Tab through every single card individually.

**Steps:**
1. Implement roving tabindex or an arrow-key handler on the task grid container (Up/Down/Left/Right moves focus logically based on grid layout).
2. Bind Enter/Space on a focused card to trigger its primary action (same as a click).
3. Ensure visible focus indicator (don't rely on default browser outline alone if the design removes it — replace, don't delete).
4. **Test:** Tab into the grid once, then navigate the entire grid using only arrow keys and Enter — no mouse.

---

## 4.3 — ARIA Attributes

**How it works:** ARIA attributes tell assistive technology what an element *is* and *does* when the visual/DOM structure alone doesn't convey it — `role` for custom widgets, `aria-label` for icon-only buttons, `aria-describedby` linking a field to its help/error text, `aria-live` for content that updates dynamically (so screen readers announce changes without the user needing to re-focus).

**Steps:**
1. Audit every interactive element (buttons, custom dropdowns, modals, cards) for missing semantic role/label.
2. Add `aria-label` to all icon-only buttons; add `aria-describedby` linking form fields to their validation error text (from Phase 1.5).
3. Add `aria-live="polite"` to dynamic regions (metric counters, task status changes, notification badge).
4. **Test:** run a screen reader (VoiceOver on Mac, NVDA on Windows) through the main flows — login, submit task, review task — confirm every action is announced meaningfully.

---

## 4.4 — Respect `prefers-reduced-motion`

**How it works:** Some users experience discomfort or vestibular issues from motion. The OS-level `prefers-reduced-motion` setting signals this preference to the browser; Framer Motion's `useReducedMotion` hook reads it so animations can be disabled or replaced with instant/fade transitions for those users.

**Steps:**
1. Identify every Framer Motion animation in the app (page transitions, card entrances, modal open/close, toast slide-in).
2. Wrap each with a check against `useReducedMotion()` — when true, skip transform/motion animations and use opacity-only or instant state changes.
3. **Test:** enable "Reduce Motion" in OS accessibility settings, reload the app, confirm animations are suppressed/simplified without breaking layout or functionality.

---

## 4.5 — Color Contrast (WCAG AA)

**How it works:** WCAG AA requires a minimum contrast ratio (4.5:1 for normal text, 3:1 for large text) between text and its background. `#666` on `#0A0A0A` falls short. The fix is adjusting the text color (typically lightening it) while staying within the existing dark-mode palette rather than introducing a new color.

**Steps:**
1. Run an automated contrast audit across the app (browser devtools accessibility panel or an automated tool) to find every failing pair, not just the one flagged.
2. Adjust failing text colors to meet 4.5:1 (normal) / 3:1 (large text), pulling from — or extending — the existing design token palette so it stays visually consistent.
3. **Test:** re-run the contrast audit and confirm all text/background pairs pass AA.

---

## 4.6 — Responsive, Accessible Tables

**How it works:** The Pending Tasks section is currently a div-based grid pretending to be a table, which screen readers can't interpret as tabular data. A real `<table>` with proper `<thead>`, `<th scope="col">`, and `<tbody>` gives assistive tech the row/column relationships it needs, while still being styled to match the app's visual language.

**Steps:**
1. Rebuild the Pending Tasks section as a semantic `<table>` on desktop, with a card-based responsive fallback for mobile (a table isn't ideal on narrow screens).
2. Add proper header scoping (`<th scope="col">`) and a caption or `aria-label` describing the table's purpose.
3. **Test:** verify a screen reader announces column headers when navigating rows; confirm the mobile breakpoint still shows the card fallback correctly.

---

## 4.7 — Toast Accessibility

**How it works:** Toasts appear and vanish outside the user's current focus point, so without `role="alert"` and `aria-live="polite"`, a screen reader user never knows one appeared. `role="alert"` signals importance; `aria-live="polite"` ensures it's announced without interrupting whatever the user is currently doing.

**Steps:**
1. Add `role="alert"` and `aria-live="polite"` to the toast container/component.
2. Ensure toast text itself is descriptive enough out of context (not just "Success!" — say what succeeded).
3. **Test:** trigger a toast (e.g., after task submission) with a screen reader running — confirm it's announced automatically.

---

## Phase 4 — Definition of Done

- [ ] Full keyboard-only pass through login, task grid, modal, and review flow succeeds with no dead ends.
- [ ] Screen reader announces all key state changes and interactive elements meaningfully.
- [ ] Reduced-motion setting suppresses animations app-wide.
- [ ] Automated contrast audit passes AA across the theme.
- [ ] Pending Tasks table is semantic and screen-reader navigable, with a working mobile fallback.
- [ ] Toasts are announced automatically without requiring focus.

**Only once every box above is checked, move to `phase-5-performance-pwa.md`.**
