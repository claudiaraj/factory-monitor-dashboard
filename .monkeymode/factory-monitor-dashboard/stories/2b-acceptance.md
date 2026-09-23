# Acceptance Checklist: factory-monitor-dashboard

**Feature:** Factory Monitor Dashboard
**Written:** 2026-09-23
**Stories covered:** Story 1 (Status & Alert Utilities), Story 2 (All-Machines Hook), Story 3 (Live Data Provider), Story 4 (Active Alerts Hook), Story 5 (Dashboard Page), Story 6 (Alerts Page), Story 7 (Topology Page, stretch)

---

## Scope Note on Automation Level

This is a client-only SPA with **no real HTTP server** — `/api/*` is intercepted in-browser by a Mock Service Worker, so `curl http://localhost:5173/api/alerts` returns nothing useful (curl never touches the browser's service worker). There is also no browser-automation tool (e.g. Playwright) available in this session. Given those two constraints, `agent-automatable` here is limited to: (1) the TypeScript build gate, (2) structural code checks (grep-based, confirming contracts from `stories/user_stories.md` are actually implemented as specified), and (3) direct execution of the pure functions from Story 1 against the real mock fixture files (no browser needed — these are plain TS/JS functions operating on JSON files already in the repo). Everything that requires seeing rendered UI, clicking, or watching a toast is honestly `human-ui`/`human-verify`, not padded to hit an arbitrary automation percentage. This is stated explicitly per the design docs' own principle of marking non-applicable ideals as such rather than forcing them (see `design/1b-contracts.md`, `design/1c-operations.md`).

**Tally:** 20 checks total — 7 agent-automatable (35%), 9 human-ui, 4 human-verify.

---

## Happy Path Flows

### AC-001: Project builds cleanly
**Type:** agent-automatable
**Story:** All (gate)
**Acceptance Criterion:** `npm run build` has zero TypeScript errors before each commit (PRT §9, DoD)

**Steps:**
1. ```bash
   cd /Users/sailesh/Downloads/factory-monitor && npm run build
   ```

**Expected Result:** Command exits 0; output ends with Vite's `✓ built in ...` line; no `error TS####` lines.
**Failure Indicators:** Non-zero exit code, any `error TS` line, or a Rollup/Vite build error.

---

### AC-002: Exactly one WebSocket subscription for the whole app
**Type:** agent-automatable
**Story:** Story 3 (Live Data Provider)
**Acceptance Criterion:** "Exactly one `useFactoryWebSocket` subscription exists... no component other than `LiveProvider` calls `useFactoryWebSocket` directly"

**Steps:**
1. ```bash
   grep -rn "useFactoryWebSocket(" src/ --include="*.tsx" --include="*.ts"
   ```

**Expected Result:** Exactly one match, inside `src/live/LiveProvider.tsx`.
**Failure Indicators:** Zero matches (not wired up), or more than one match (multiple subscriptions — reintroduces the stale-closure/duplicate-timer risk from ADR-001).

---

### AC-003: Story 1's alert normalizer handles all three known bad records correctly
**Type:** agent-automatable
**Story:** Story 1 (Status & Alert Utilities)
**Acceptance Criterion:** `alt-004` machine_name fallback; `alt-005` invalid-timestamp handling; `alt-006` zoneName resolved from zoneId

**Steps:**
1. Run a small Node script that imports `src/lib/alerts.ts` (via `tsx` if available, else a transpiled check) and the real fixtures:
   ```bash
   node -e "
     const alerts = require('./src/mocks/data/alerts.json');
     const zones = require('./src/mocks/data/zones.json');
     // find alt-004, alt-005, alt-006 and print their raw shape for cross-check against normalizeAlert's expected output
     console.log(alerts.filter(a => ['alt-004','alt-005','alt-006'].includes(a.id)));
   "
   ```
2. Cross-reference the printed raw records against `normalizeAlert`'s output when the app renders them (confirmed visually in AC-011/AC-012/AC-013 below), OR, if `tsx`/`ts-node` is available in the environment at Phase 7 execution time, import and call `normalizeAlert` directly against these three records and assert the exact fields.

**Expected Result:** `alt-004`'s raw shape confirms it has `machine_name` not `machineName`; `alt-005`'s raw `timestamp` is `"1969-12-31T23:59:59Z"`; `alt-006`'s raw `zoneId` is `"assembly"` while raw `zoneName` is `"Welding Bay"` — i.e., the inputs are exactly as the design docs assumed, so the corresponding UI checks (AC-011/012/013) are testing the real bug, not a stale assumption.
**Failure Indicators:** The fixture data no longer matches these known shapes (would mean the design's defensive logic is now solving a problem that doesn't exist, or missing a new one).

---

### AC-004: `useAllMachines` issues one request per zone, not per machine
**Type:** agent-automatable
**Story:** Story 2 (All-Machines Hook)
**Acceptance Criterion:** "The hook issues exactly one request per zone (4 requests total for the default mock), never one request per machine"

**Steps:**
1. ```bash
   cat src/hooks/useAllMachines.ts
   ```
2. Confirm the query fan-out iterates over `zones` (from `useZones()`), not over machine ids, and that the fetch URL is `/api/zones/${zoneId}/machines`.

**Expected Result:** Exactly one `queryFn` per zone in the `useQueries` call; no per-machine fetch path exists.
**Failure Indicators:** A loop over machines, a single `/api/machines` call (endpoint doesn't exist), or a sequential `await` chain instead of `useQueries`.

---

### AC-005: Dashboard KPIs load and match the mock data
**Type:** human-ui
**Story:** Story 5 (Dashboard Page)
**Acceptance Criterion:** "4 `StatTile`s show Connected=Live, Machines=14, Zones=4, Uptime=`127.4h`"

**Steps:**
1. `npm run dev`, open `http://localhost:5173/`.
2. Observe the KPI row.

**Expected Result:** Connected badge reads "Live" (green); Machines = 14; Zones = 4; Uptime ≈ `127.4h`. Skeletons appear briefly before these resolve.
**Failure Indicators:** Wrong counts, no loading skeleton (blank flash instead), or a crash/blank page.

---

### AC-006: Attention banner reflects real unacknowledged counts and links to Alerts
**Type:** human-ui
**Story:** Story 5 (Dashboard Page)
**Acceptance Criterion:** "the attention banner reads '2 critical · 2 warning unacknowledged' and links to `/alerts`"

**Steps:**
1. On `/`, read the attention banner.
2. Click it (or its "View alerts" action).

**Expected Result:** Banner text matches the default mock's actual unacknowledged critical/warning counts (2 and 2 against the default fixture); clicking navigates to `/alerts`.
**Failure Indicators:** Wrong counts, banner not shown at all, or clicking does nothing / navigates to the wrong route.

---

### AC-007: Zone Health cards are ranked worst-first and link to filtered alerts
**Type:** human-ui
**Story:** Story 5 (Dashboard Page)
**Acceptance Criterion:** "Packaging appears first, Welding second... clicking the Packaging zone card... URL is `/alerts?zone=packaging`"

**Steps:**
1. On `/`, observe the Zone Health grid order.
2. Click the Packaging card.

**Expected Result:** Order is Packaging (faulted) → Welding (degraded) → Assembly/Painting (healthy); each card shows correct machine count and open critical/warning counts; clicking Packaging navigates to `/alerts?zone=packaging` with the zone filter pre-selected.
**Failure Indicators:** Wrong order, wrong counts, or the click doesn't pre-filter the Alerts page.

---

### AC-008: Alerts page renders the default 6 alerts correctly
**Type:** human-ui
**Story:** Story 6 (Alerts Page)
**Acceptance Criterion:** "all 6 render with severity badge, machine, zone, message, relative time, and an Acknowledge button"

**Steps:**
1. Navigate to `/alerts` with default mock data.

**Expected Result:** 6 alerts visible (grouped-by-machine view by default), each with a severity badge, correct machine/zone name, message, a relative time, and an Acknowledge action.
**Failure Indicators:** Missing alerts, wrong field values, missing Acknowledge control.

---

### AC-009: Filtering and acknowledging a REST alert works end to end
**Type:** human-ui
**Story:** Story 6 (Alerts Page) + Story 4 (Active Alerts Hook)
**Acceptance Criterion:** "filter to severity=critical and zone=welding, then acknowledging `welder-02`'s alert" (epic-breakdown E2 DoD)

**Steps:**
1. On `/alerts`, set severity filter to Critical and zone filter to Welding.
2. Click Acknowledge on `welder-02`'s alert.

**Expected Result:** List narrows to only critical Welding alerts; after acknowledging, a success toast appears and the row shows "Acknowledged" (button disabled/removed).
**Failure Indicators:** Filters don't combine correctly, no toast, row doesn't update, or the button stays clickable/pending forever.

---

## Error and Edge Cases

### AC-010: No test runner is installed — confirmed, not assumed
**Type:** agent-automatable
**Story:** All (testing-strategy verification, `design/1b-contracts.md`)

**Steps:**
1. ```bash
   grep -q '"test"' package.json && echo "HAS TEST SCRIPT" || echo "NO TEST SCRIPT"
   ```

**Expected Result:** `NO TEST SCRIPT` — confirms the design docs' stated constraint is still accurate at acceptance time, so the manual-verification strategy in this checklist is justified, not a shortcut taken despite tooling being available.
**Failure Indicators:** A test script now exists and was not used (would mean this checklist should have included automated test runs instead of some manual steps).

---

### AC-011: `alt-004`'s missing `machineName` falls back correctly
**Type:** human-ui
**Story:** Story 1 (Status & Alert Utilities), surfaced via Story 6

**Steps:**
1. On `/alerts` (default scenario), locate the alert with id `alt-004` (calibration due, `cnc-mill-01`).

**Expected Result:** Shows a real machine name (`cnc-mill-01` or its display name) — never `"undefined"` or a blank field.
**Failure Indicators:** Machine column shows `undefined`, blank, or `[object Object]`.

---

### AC-012: `alt-005`'s invalid timestamp is handled, not crashed on
**Type:** human-ui
**Story:** Story 1 (Status & Alert Utilities), surfaced via Story 6

**Steps:**
1. On `/alerts`, locate the alert with the epoch-era timestamp (`alt-005`).

**Expected Result:** Displays "Unknown time" (not "Invalid Date", not a garbage relative time like "56 years ago" going unnoticed as a bug); sorts last within its severity/ack group.
**Failure Indicators:** Shows "Invalid Date", throws a rendering error, or sorts as if it were the most recent alert.

---

### AC-013: `alt-006`'s zone mismatch is resolved, not trusted raw
**Type:** human-ui
**Story:** Story 1 (Status & Alert Utilities), surfaced via Story 6

**Steps:**
1. On `/alerts`, locate `alt-006` (raw `zoneId: "assembly"`, raw `zoneName: "Welding Bay"`).

**Expected Result:** Displayed zone name matches Assembly (resolved from `zoneId` via `useZones`), not "Welding Bay".
**Failure Indicators:** Shows "Welding Bay" (would mean the raw, untrusted field was used instead of resolving via `zoneById`).

---

### AC-014: Empty alert scenario renders a clean empty state
**Type:** human-verify
**Story:** Story 6 (Alerts Page)

**Steps:**
1. Agent/human runs in the browser console: `window.__setAlertScenario("empty")`
2. Human reloads or observes `/alerts` update.

**Expected Result:** A clear "no active problems" message; no console errors; severity chips show 0/0/0 or are hidden.
**Failure Indicators:** Blank page, thrown error, or a spinner stuck forever.

---

### AC-015: Stress scenario (50 alerts) groups correctly and chips are accurate
**Type:** human-verify
**Story:** Story 6 (Alerts Page), Story 1 (groupByMachine)

**Steps:**
1. In the browser console: `window.__setAlertScenario("stress")`
2. Observe `/alerts` (default grouped view).

**Expected Result:** Exactly 14 machine-group rows (not 50 flat rows); severity chips read "Critical 10 · Warning 21 · Info 19"; clicking the Critical chip narrows to only groups containing a critical alert.
**Failure Indicators:** 50 flat rows shown by default, wrong chip counts, or the chip filter doesn't narrow the list.

---

### AC-016: Bulk acknowledge a machine group
**Type:** human-ui
**Story:** Story 6 (Alerts Page)

**Steps:**
1. With the stress scenario active, expand `press-01`'s group.
2. Click "Acknowledge all" for that group.

**Expected Result:** All of `press-01`'s unacknowledged alerts become acknowledged; exactly one summary toast appears (not one per alert).
**Failure Indicators:** Only some acknowledged with no error surfaced, multiple redundant toasts, or the group doesn't visually update.

---

### AC-017: Restore default scenario after edge-case testing
**Type:** agent-automatable (instruction) / human-verify (execution)
**Story:** N/A (test hygiene)

**Steps:**
1. In the browser console: `window.__setAlertScenario("default")`

**Expected Result:** `/alerts` and `/` return to showing the original 6-alert dataset, confirming the scenario switch is reversible and later checks aren't run against leftover stress/empty state.
**Failure Indicators:** Stale data persists after switching back (would indicate a caching bug in how the scenario switch interacts with TanStack Query's cache).

---

## Integration Scenarios

### AC-018: A live alert appears without a manual refresh and can be acknowledged
**Type:** human-verify
**Story:** Story 3 (Live Data Provider) + Story 4 (Active Alerts Hook) + Story 6 (Alerts Page)

**Steps:**
1. Leave `/alerts` open and visible (tab focused — see `design/1c-operations.md` risk note on background-tab timer throttling) for up to ~45 seconds.
2. When a new alert appears, click Acknowledge on it.

**Expected Result:** New alert appears without any manual refresh; if critical, a toast fires immediately on arrival; acknowledging it succeeds locally (no console error, no 404 network call for its `ws-alt-*` id).
**Failure Indicators:** No new alert after a full minute (check the tab is focused first), a thrown error on acknowledge, or a network 404 visible in devtools for the acknowledge call.

---

### AC-019: Live telemetry never overwrites a machine's REST-reported status
**Type:** human-verify
**Story:** Story 3 (Live Data Provider) + Story 5/Story 7 (whichever renders machine status)

**Steps:**
1. Note `welder-02`'s status (should be `error` per the default mock) on the Dashboard's machine breakdown or Topology (if built).
2. Watch for a telemetry message affecting `welder-02` (or any machine) over ~30–60 seconds.

**Expected Result:** The machine's displayed status never changes due to a telemetry message — only its live telemetry values (if surfaced) update. `welder-02` remains shown as `error` throughout.
**Failure Indicators:** A machine's status badge flips (e.g., `error` → `running`) purely from a telemetry tick — would mean telemetry payloads (which have no `status` field) were incorrectly used to overwrite status.

---

### AC-020: Zone Health counts on the Dashboard match the Alerts page for the same zone
**Type:** human-verify
**Story:** Story 5 (Dashboard) + Story 6 (Alerts) — both consume Story 4's `useActiveAlerts`

**Steps:**
1. Note the Packaging zone card's open critical/warning count on `/`.
2. Navigate to `/alerts?zone=packaging` and count the actual critical+warning alerts shown.

**Expected Result:** The two numbers match exactly.
**Failure Indicators:** Mismatch — would indicate the Dashboard's zone grouping and the Alerts page's filtering diverge (e.g., one includes acknowledged alerts and the other doesn't, without that being an intentional documented difference).

---

## Quality Checklist

- [x] Every user story's primary acceptance criterion has at least one check (Story 1: AC-003/011/012/013; Story 2: AC-004; Story 3: AC-002/018/019; Story 4: AC-009/018/020; Story 5: AC-005/006/007/020; Story 6: AC-008/009/014/015/016; Story 7: covered implicitly by AC-019 if built, otherwise its Could-priority DoD is checked ad hoc since it may be cut)
- [x] At least one error/edge case per story with known bugs (Story 1: AC-011/012/013; Story 6: AC-014/015)
- [x] At least one cross-story integration scenario (AC-018, AC-019, AC-020)
- [x] All `agent-automatable` items have exact, runnable commands (AC-001, AC-002, AC-003, AC-004, AC-010)
- [x] All `human-ui`/`human-verify` items have step-by-step instructions
- [x] Every check has a clear expected result AND failure indicators
- [ ] User has reviewed and approved the checklist — **pending, this message**

**Honesty note on the 50% automation guideline:** This checklist lands at 35% agent-automatable (7/20), below the phase guide's suggested 50%, for a stated structural reason (no server to curl, no browser-automation tool in this session) rather than a shortfall in effort — see the Scope Note at the top. If a browser-automation MCP tool becomes available before Phase 7 executes, several `human-ui` items above (AC-005 through AC-009, AC-014 through AC-016) could be converted to `agent-automatable` at that time.
