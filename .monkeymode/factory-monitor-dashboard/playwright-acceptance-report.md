# Playwright Acceptance Report — factory-monitor-dashboard

**Run date:** 2026-09-23T20:35:00Z
**Target:** `npm run dev` (http://localhost:5173), live browser session
**Method:** Playwright driving the running app — navigation, DOM assertions, click interactions, network/console listeners, scenario switching via `window.__setAlertScenario(...)`
**Checklist source:** `stories/2b-acceptance.md` (AC-001 through AC-020)
**Result: 20/20 PASS, 0 FAIL**
**Reused for:** Phase 7 acceptance gate (`state.json` → `acceptance`), since nothing in `src/` changed after this run.

---

## Note on automation level

`2b-acceptance.md` was written assuming no browser-automation tool would be available at execution time, and classified only 7/20 checks (35%) as `agent-automatable` — the rest were written as `human-ui`/`human-verify` step-by-step instructions. Its own scope note flagged that this could change: *"If a browser-automation MCP tool becomes available before Phase 7 executes, several `human-ui` items above ... could be converted to `agent-automatable`."*

That's what happened. Playwright was available at execution time, so all 20 checks — including the ones planned as manual — were driven live through the browser instead. This is not a test suite committed to the repo (no `playwright.config.ts`, no `playwright` devDependency, no `tests/` directory, no saved report/screenshot artifacts) — it was a one-time, ad hoc verification session. No automated regression suite exists in this codebase; this report is the record of that session, not a replayable one.

---

## Results

| AC | Story | Type (as planned) | What it checked | Result |
|---|---|---|---|---|
| AC-001 | All (gate) | agent-automatable | `npm run build` — zero TypeScript errors | PASS |
| AC-002 | Story 3 (Live Data Provider) | agent-automatable | Exactly one `useFactoryWebSocket(` call in the codebase, inside `LiveProvider` | PASS |
| AC-003 | Story 1 (Status & Alert Utilities) | agent-automatable | `alt-004`/`alt-005`/`alt-006` raw fixture shapes match the assumed defects | PASS |
| AC-004 | Story 2 (All-Machines Hook) | agent-automatable | `useAllMachines` issues one request per zone (4), never per machine | PASS |
| AC-005 | Story 5 (Dashboard Page) | human-ui → automated | KPI row: Connected=Live, Machines=14, Zones=4, Uptime≈127.4h, with loading skeletons | PASS |
| AC-006 | Story 5 (Dashboard Page) | human-ui → automated | Attention banner shows correct unacked critical/warning counts, links to `/alerts` | PASS |
| AC-007 | Story 5 (Dashboard Page) | human-ui → automated | Zone Health cards ranked worst-first (Packaging→Welding→Assembly/Painting); click filters to `/alerts?zone=packaging` | PASS |
| AC-008 | Story 6 (Alerts Page) | human-ui → automated | Default 6 alerts render with severity badge, machine, zone, message, relative time, Acknowledge action | PASS |
| AC-009 | Story 4+6 | human-ui → automated | Combined severity=critical + zone=welding filter, then acknowledge `welder-02`'s alert end to end | PASS |
| AC-010 | All | agent-automatable | `package.json` confirmed to have no `test` script — manual strategy is justified, not a shortcut | PASS |
| AC-011 | Story 1, surfaced via Story 6 | human-ui → automated | `alt-004` missing `machineName` falls back correctly, never renders `undefined` | PASS |
| AC-012 | Story 1, surfaced via Story 6 | human-ui → automated | `alt-005` invalid timestamp shows "Unknown time", not "Invalid Date"; sorts last in its group | PASS |
| AC-013 | Story 1, surfaced via Story 6 | human-ui → automated | `alt-006` zone resolved from `zoneId` (Assembly), not the raw mismatched `zoneName` ("Welding Bay") | PASS |
| AC-014 | Story 6 | human-verify → automated | Empty alert scenario renders a clean empty state, no console errors | PASS |
| AC-015 | Story 1+6 | human-verify → automated | Stress scenario (50 alerts) groups into 14 machine rows; chips read "Critical 10 · Warning 21 · Info 19"; chip filter narrows correctly | PASS |
| AC-016 | Story 6 | human-ui → automated | Bulk-acknowledge `press-01`'s group — all unacked alerts flip, one summary toast (not one per alert) | PASS |
| AC-017 | Test hygiene | agent-automatable / human-verify → automated | Scenario reset to `"default"` restores the original 6-alert dataset, no stale cache | PASS |
| AC-018 | Story 3+4+6 | human-verify → automated | New live alert appears without manual refresh; acknowledging it succeeds locally, no 404 for its `ws-alt-*` id | PASS |
| AC-019 | Story 3+5/7 | human-verify → automated | Live telemetry ticks never overwrite a machine's REST-reported status; `welder-02` stays `error` throughout | PASS |
| AC-020 | Story 4+5+6 | human-verify → automated | Packaging zone's Dashboard count matches the filtered `/alerts?zone=packaging` count exactly | PASS |

---

## Known issues (non-blocking, all documented — not acceptance failures)

1. **Fixture inconsistency:** `zones.json` reports 4 machines for Painting & Coating; only 3 exist in `machines.json`. Dashboard shows 4 (trusts the zone API's own `machineCount` field, per PRT Q1's pre-approved answer: *"Trust the API field; show alert counts alongside it as a talking point"*). Topology shows 3 (counts real `Machine[]` records via `useAllMachines`). Both are correct implementations of their own design intent — the mismatch is fixture data drift, not a code defect, and is worth a one-line fixture fix or a panel talking point.
2. **Cosmetic:** `formatRelativeTime` (`src/lib/alerts.ts`) caps out at hour granularity (`"Nh ago"`) with no day/week rollover. Fine for this dataset's recent timestamps; would look odd on older data.
3. **Process note:** `window.__setAlertScenario(...)` scenario switches do not survive a hard browser reload (F5) — expected, matches the mock's documented no-persistence-across-reload limitation (PRT Q2).

---

## What this report is not

- Not a committed, replayable test suite — no `playwright.config.ts`, no `playwright` devDependency, no `tests/` directory, no CI wiring.
- Not a substitute for unit/component tests — `src/lib/alerts.ts` and `src/lib/status.ts` remain pure, dependency-free functions specifically so they *could* be unit tested if a runner is added later (a structural choice made in Phase 1B, not deferred work).
- A record of one live verification session, reused once (Phase 5 → Phase 7 acceptance) because nothing in `src/` changed in between.
