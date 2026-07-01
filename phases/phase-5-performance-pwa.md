# Phase 5 — Performance & PWA
**Clstr CA Portal | Claude Sonnet 4.6 (Claude Code) | Extended Thinking: ON**

---

## Instruction to Model

**Do not start this file until Phase 4 is complete.**

Before making any change, think through the actual cost/benefit: measure first (bundle size, render count, list length) rather than optimizing blindly. Use extended thinking to decide *where* memoization or virtualization genuinely matters versus where it would add complexity for negligible gain — over-memoizing has real maintenance cost.

Work through items in order, one at a time, measuring before and after each change.

---

## Why This Phase Exists

By this point the app is secure, feature-complete, and accessible — but it may still be slow. Everything loads in one giant bundle, nobody's ever looked at what's actually inside that bundle, components re-render more than they need to, and long lists (task grids, pending queues) render every single item into the DOM even when only a handful are visible. Phase 5 is about making the app feel fast, especially on the lower-end devices and slower connections most campus users are actually on.

---

## 5.1 — Code Splitting

**How it works:** By default, a single JS bundle contains every route's code, so users pay the download cost for the Dashboard *and* TaskPanel even if they only ever visit one. `React.lazy()` + `Suspense` splits these into separate chunks that load on demand — the Dashboard chunk only downloads when the user actually navigates there.

**Steps:**
1. Convert `Dashboard` and `TaskPanel` (and any other heavy top-level route) to `React.lazy()` imports.
2. Wrap the route outlet in `<Suspense>` with a lightweight, on-brand loading state (not a generic spinner if the app has a visual identity to match).
3. **Test:** check the Network tab — confirm Dashboard/TaskPanel now load as separate chunks only when navigated to, not on initial page load.

---

## 5.2 — Bundle Analysis

**How it works:** A bundle visualizer renders a treemap of what's actually inside your production build, sized by byte weight, so you can see which dependencies are disproportionately large before deciding what to trim, lazy-load, or replace.

**Steps:**
1. Add `vite-plugin-visualizer` to the Vite config.
2. Run a production build and open the generated report.
3. Identify the largest offenders (often: icon libraries imported in full, moment/date libraries, unused UI kit code) and address the worst 2–3 concretely (tree-shake, switch to lighter alternative, or lazy-load).
4. **Test:** re-run the build, confirm the target chunks shrank, confirm the app still functions identically after any dependency swaps.

---

## 5.3 — Memoization

**How it works:** `React.memo` prevents a component from re-rendering when its props haven't actually changed (shallow comparison). `useMemo` caches the result of an expensive calculation between renders so it's not recomputed every time the component re-renders for unrelated reasons. This only helps where re-renders are actually frequent and the render/calculation is non-trivial — applying it everywhere adds overhead without benefit.

**Steps:**
1. Use React DevTools Profiler to find components that re-render unnecessarily during normal interaction (e.g., typing in a filter re-rendering every `TaskCard`).
2. Wrap `MetricCard` and `TaskCard` in `React.memo`, ensuring their props are stable (avoid passing new inline object/function references each render — memoize those with `useCallback`/`useMemo` at the parent level too, where needed).
3. Wrap genuinely expensive calculations (e.g., filtering/sorting large task lists) in `useMemo`.
4. **Test:** re-profile with React DevTools — confirm the previously-unnecessary re-renders are gone, confirm no visual/functional regression.

---

## 5.4 — List Virtualization

**How it works:** Virtualization renders only the list items currently visible in the viewport (plus a small buffer), instead of every item in a potentially long list, drastically cutting DOM node count and improving scroll performance for the task grid and pending queue as they grow.

**Steps:**
1. Identify lists likely to grow large in production (task grid, pending review queue).
2. Integrate `react-window` or `@tanstack/react-virtual` for those lists, preserving existing styling and grid layout behavior.
3. Ensure keyboard navigation (from Phase 4.2) and virtualization work together correctly — virtualized items must still be reachable and focus-manageable.
4. **Test:** load the app with a large seeded dataset (100+ tasks), confirm smooth scroll performance and that DOM node count stays low (inspect via devtools), confirm Phase 4 keyboard nav still works on the virtualized grid.

---

## Phase 5 — Definition of Done

- [ ] Dashboard and TaskPanel load as separate chunks, only when navigated to.
- [ ] Bundle visualizer report reviewed; top offenders addressed with before/after size comparison.
- [ ] MetricCard/TaskCard re-render only when their actual props change, verified via Profiler.
- [ ] Long lists render only visible items, verified with a large seeded dataset.
- [ ] Lighthouse performance score improved from baseline; no functional or accessibility regressions.

**Only once every box above is checked, move to the next phase file (confirm with the user whether Phase 6 content exists, then proceed to `phase-7-advanced-features.md`).**
