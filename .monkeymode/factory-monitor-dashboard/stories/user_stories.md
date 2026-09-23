# User Stories — Factory Monitor Dashboard

**Based on:** `design/1a-discovery.md`, `design/1b-contracts.md`, `design/1c-operations.md`, and the MonkeyPlan handoff (`prt.md`, `epic-breakdown.md`)
**Date:** 2026-09-23

## Discovery Answer: "Which components need to communicate?"

Already fully answered in Phase 1B, Part 3 ("New Frontend Contracts") — repeated here as the basis for story boundaries:
- `src/lib/status.ts` / `src/lib/alerts.ts` — pure functions, no React dependency, consumed by everything else.
- `src/hooks/useAllMachines.ts` — wraps the existing `useZones()` + fetch, consumed by Dashboard and Topology.
- `src/live/LiveProvider.tsx` (+ `useLive()`) — the single WebSocket subscription, consumed by `useActiveAlerts` and (optionally) Topology.
- `src/hooks/useActiveAlerts.ts` — the integration seam: merges REST alerts, live alerts, and normalization; consumed by Dashboard (zone health, attention banner) and Alerts page.
- Page compositions (Dashboard, Alerts, Topology) each own their own components and consume the hooks above; they do not communicate with each other directly.

## Note on Parallelization Shape (read before the story list)

This feature has a genuine two-tier shape — a small shared foundation (pure utilities + two data hooks) that every page consumes — which the standard "zero dependencies between any stories" ideal cannot honestly claim without fabricating mocks for tiny pure functions that would cost more to fake than to just build in order. Per the phase guide's own escape hatch ("if components must be integrated sequentially after stories complete, clearly document this... inform the lead engineer of the integration dependencies"), stories are grouped into **three sequential batches**; within each batch, stories are fully independent (different files, zero cross-story dependency) and can run in parallel:

- **Batch 1 (parallel, zero dependencies on each other or on any other story):** Story 1, Story 2, Story 3
- **Batch 2 (depends only on Batch 1 being merged):** Story 4
- **Batch 3 (depends only on Batches 1–2 being merged; parallel with each other):** Story 5, Story 6, Story 7

This is a refinement over `epic-breakdown.md`'s E1–E5 (which bundled foundation + Dashboard together as E1) — splitting the shared foundation out lets Dashboard and Alerts be built in parallel once it lands, which is strictly more parallel than the epic breakdown's sequential E1→E2/E3 shape.

---

## Story 1: Shared Status & Alert Normalization Utilities

**Repository:** factory-monitor
**Type:** Feature
**Priority:** Must
**Size:** S
**Dependencies:** NONE (fully parallel — pure functions, only depends on existing `src/types.ts`)

### Description
As a developer building every other part of this feature,
I want a single, pure, well-tested place that maps status values to colors and turns raw (possibly malformed) alert data into safe, display-ready data,
So that no page component ever has to re-implement severity/health color logic or defend against the known mock data bugs itself.

### Technical Context
- **Affected modules:** `src/lib/` (new)
- **Design reference:** `design/1a-discovery.md` "Core Data Model" (NormalizedAlert, MachineAlertGroup); `design/1b-contracts.md` Part 3
- **Key files to create:**
  - `src/lib/status.ts`
  - `src/lib/alerts.ts`
- **Patterns to follow:** plain-object status→colorScheme maps, exactly like `src/components/SampleCard.tsx`'s `statusColors` object
- **Dependencies:** NONE — reads only `Zone`, `Machine`, `Alert` types from the existing `src/types.ts`

### Integration Contracts

**Interfaces Defined by This Story:**
```ts
// src/lib/status.ts
export const severityColor: Record<Alert["severity"], string>;       // critical→"red", warning→"orange", info→"blue"
export const healthColor: Record<Zone["health"], string>;            // healthy→"green", degraded→"orange", faulted→"red"
export const machineStatusColor: Record<Machine["status"], string>;  // running→"green", idle→"gray", error→"red", maintenance→"purple"

// src/lib/alerts.ts
export interface NormalizedAlert extends Alert {
  zoneName: string;      // ALWAYS resolved via zoneById — never trust the raw field (fixes alt-006 + the WS zoneName-is-zoneId bug)
  machineName: string;   // machineName ?? machine_name ?? machineId (fixes alt-004)
  timestampValid: boolean; // false for unparseable or pre-2000 timestamps (fixes alt-005)
  source: "rest" | "live";
}
export function normalizeAlert(raw: Alert & { machine_name?: string }, zoneById: Map<string, Zone>, source: "rest" | "live"): NormalizedAlert;
export function dedupeById(alerts: NormalizedAlert[]): NormalizedAlert[];
export function sortAlerts(alerts: NormalizedAlert[]): NormalizedAlert[]; // unacked first, severity desc (critical>warning>info), then newest; invalid timestamps sort last within their group

export interface MachineAlertGroup {
  machineId: string; machineName: string; zoneId: string; zoneName: string;
  alerts: NormalizedAlert[]; worstSeverity: Alert["severity"]; unacknowledgedCount: number;
}
export function groupByMachine(alerts: NormalizedAlert[]): MachineAlertGroup[]; // sorted worst-severity-first, then most recent
export function formatRelativeTime(iso: string): string; // "Unknown time" if invalid/pre-2000, else "Ns ago" / "Nm ago" / "Nh ago"
```

**Interfaces Used by This Story:** none beyond `src/types.ts` (`Zone`, `Machine`, `Alert`).

**Integration Timeline:** Phase 4 Batch 1 (parallel with Stories 2 and 3). Consumed starting Batch 2 (Story 4) and Batch 3 (Stories 5–7).

### Acceptance Criteria
- [ ] **Given** an alert with `machine_name` set but not `machineName` (like `alt-004`), **When** `normalizeAlert` is called, **Then** the result's `machineName` equals the `machine_name` value.
- [ ] **Given** an alert with timestamp `"1969-12-31T23:59:59Z"` (like `alt-005`), **When** `normalizeAlert` is called, **Then** `timestampValid` is `false`, and `formatRelativeTime` returns `"Unknown time"`.
- [ ] **Given** an alert whose `zoneId` is `"assembly"` but whose raw `zoneName` field says `"Welding Bay"` (like `alt-006`), **When** `normalizeAlert` is called with a `zoneById` map, **Then** the result's `zoneName` is resolved from `zoneById.get("assembly")`, not the raw field.
- [ ] **Given** a mix of acknowledged/unacknowledged, critical/warning/info alerts, **When** `sortAlerts` is called, **Then** the order is: unacknowledged before acknowledged, then critical > warning > info, then most recent first within each group, with any `timestampValid: false` entries last within their group.
- [ ] **Given** 50 alerts across 14 distinct machines (the stress fixture shape), **When** `groupByMachine` is called, **Then** exactly 14 groups are returned, each with the correct `worstSeverity` and `unacknowledgedCount`.
- [ ] **Given** two alerts with the same `id` (one REST, one live), **When** `dedupeById` is called, **Then** only one survives.
- [ ] All exports have complete TypeScript signatures (no `any`).

### Implementation Details
See `design/1b-contracts.md` Part 3 for the exact signatures above, and `design/1a-discovery.md`'s "Core Data Model" section for the full rationale behind each derived type.

### Out of Scope
- Any React/hook code (this story is pure TypeScript functions only).
- Fetching data (that's Stories 2/3/4).

### Notes for Developer
- This is the most-consumed story in the feature — every other story imports from here. Get the sort/group edge cases right; a bug here is invisible until Story 4/5/6 render it.
- Written as pure functions specifically so they'd be unit-testable if a test runner is ever added (per `design/1b-contracts.md`'s Testing Strategy) — no test runner exists in this repo today, so verification is manual (run through the acceptance criteria above by hand against real mock data in the browser console or a temporary scratch script).

---

## Story 2: All-Machines Aggregation Hook

**Repository:** factory-monitor
**Type:** Feature
**Priority:** Should
**Size:** S
**Dependencies:** NONE (fully parallel — uses only the existing `useZones` hook and `fetch`)

### Description
As a developer building the Dashboard and Topology pages,
I want a single hook that returns all 14 machines across all zones,
So that pages don't have to manually fan out per-zone requests or hand-roll a `useQueries` call themselves.

### Technical Context
- **Affected modules:** `src/hooks/` (new file)
- **Design reference:** `design/1b-contracts.md` Part 3; the repo has no "all machines" REST endpoint, only `/api/zones/:zoneId/machines`
- **Key files to create:** `src/hooks/useAllMachines.ts`
- **Patterns to follow:** existing hooks in `src/hooks/` (e.g. `useZones.ts`) for `useQuery`/query-key conventions
- **Dependencies:** NONE — uses the existing, unmodified `useZones()` hook and TanStack Query's `useQueries`

### Integration Contracts

**Interfaces Defined by This Story:**
```ts
// src/hooks/useAllMachines.ts
export function useAllMachines(): {
  machines: Machine[] | undefined;
  isLoading: boolean;
  isError: boolean;
};
```

**Interfaces Used by This Story:**
```ts
import { useZones } from "./useZones"; // existing, unmodified
// useZones() → Zone[] → useQueries({ queries: zones.map(z => ({ queryKey: ["machines", z.id], queryFn: () => fetch(`/api/zones/${z.id}/machines`).then(r => r.json()) })) }) → flatMap
```

**Integration Timeline:** Phase 4 Batch 1 (parallel with Stories 1 and 3). Consumed starting Batch 3 (Stories 5 and 7).

### Acceptance Criteria
- [ ] **Given** the default mock data (4 zones, 14 machines total), **When** `useAllMachines()` resolves, **Then** `machines.length === 14` and every machine has a `zoneId` matching one of the 4 zones.
- [ ] **Given** zones are still loading, **When** `useAllMachines()` is called, **Then** `isLoading` is `true` and `machines` is `undefined`.
- [ ] **Given** any of the per-zone machine fetches fails, **When** `useAllMachines()` is called, **Then** `isError` is `true`.
- [ ] The hook issues exactly one request per zone (4 requests total for the default mock), never one request per machine.

### Implementation Details
`useQueries` from `@tanstack/react-query` (already a dependency) is the correct primitive — it was chosen in Phase 1A specifically because it bounds the request count by zone count (4), not machine count (14), and stays bounded as machines are added to existing zones.

### Out of Scope
- Any UI rendering of machines (that's Stories 5, 6, 7).
- A dedicated `/api/machines` endpoint — the mock is not modified.

### Notes for Developer
- Follow the exact `useQuery` options style already used in `src/hooks/useZones.ts` for consistency (query key format, fetch error handling).

---

## Story 3: Live Data Provider

**Repository:** factory-monitor
**Type:** Feature
**Priority:** Should
**Size:** M
**Dependencies:** NONE (fully parallel — uses only the existing `useFactoryWebSocket` hook)

### Description
As a developer building any page that needs live data,
I want exactly one WebSocket subscription for the whole app, exposed via context,
So that live alerts and telemetry are available everywhere without each page independently subscribing (which would multiply the stale-closure and duplicate-timer risks documented in ADR-001/1A).

### Technical Context
- **Affected modules:** `src/live/` (new), `src/App.tsx` (modify — wrap children in the new provider)
- **Design reference:** `design/1a-discovery.md` ADR-001; `design/1b-contracts.md` Part 2 (WebSocket event schemas) and Part 3
- **Key files to create:** `src/live/LiveProvider.tsx`, `src/hooks/useLive.ts`
- **Key files to modify:** `src/App.tsx` (add `<LiveProvider>` inside `QueryClientProvider`, outside `BrowserRouter`)
- **Patterns to follow:** standard React Context provider pattern; `useFactoryWebSocket`'s existing signature is not changed
- **Dependencies:** NONE — uses the existing, unmodified `useFactoryWebSocket(onMessage)` hook

### Integration Contracts

**Interfaces Defined by This Story:**
```ts
// src/hooks/useLive.ts
export interface TelemetrySnapshot {
  machineId: string; machineName: string; zoneId: string;
  telemetry: MachineTelemetry; timestamp: string;
}
export interface LiveContextValue {
  liveAlerts: Alert[];                          // RAW alerts as received from the socket — normalization happens downstream in Story 4, not here
  telemetry: Record<string, TelemetrySnapshot>;  // keyed by machineId, latest snapshot only
  lastMessageAt: number | null;                  // Date.now() of the most recent message of any type
  localAckIds: Set<string>;
  acknowledgeLocal: (id: string) => void;
}
export function useLive(): LiveContextValue; // throws a clear error if called outside LiveProvider

// src/live/LiveProvider.tsx
export function LiveProvider({ children }: { children: React.ReactNode }): JSX.Element;
```

**Interfaces Used by This Story:**
```ts
import { useFactoryWebSocket } from "../hooks/useFactoryWebSocket"; // existing, unmodified
```

**Integration Timeline:** Phase 4 Batch 1 (parallel with Stories 1 and 2). Consumed starting Batch 2 (Story 4) and optionally Batch 3 (Story 7's live tooltips).

### Acceptance Criteria
- [ ] **Given** the app has mounted, **When** a `telemetry` WebSocket message arrives, **Then** `useLive().telemetry[machineId]` reflects the new snapshot and `lastMessageAt` updates.
- [ ] **Given** the app has mounted, **When** an `alert` WebSocket message arrives, **Then** `useLive().liveAlerts` contains the new raw alert (deduped by `id` if a duplicate `id` somehow arrives twice).
- [ ] **Given** multiple components call `useLive()` simultaneously, **When** the app runs for any length of time, **Then** exactly one `useFactoryWebSocket` subscription exists (verify by instrumentation or code inspection — no component other than `LiveProvider` calls `useFactoryWebSocket` directly).
- [ ] **Given** the callback passed to `useFactoryWebSocket` is captured once (its effect has `[]` deps), **When** state updates happen in response to messages, **Then** they use functional `setState` updates exclusively (no stale-closure reads of prior state).
- [ ] **Given** `acknowledgeLocal(id)` is called, **When** `useLive()` is read afterward, **Then** `localAckIds` contains `id`.
- [ ] `useLive()` called outside a `LiveProvider` throws a descriptive error, not a silent `undefined` crash.

### Implementation Details
See `design/1b-contracts.md` Part 2 for the exact WebSocket payload shapes (note: `telemetry` payload has no `status` field; `alert` payload's `zoneName` is a known bug — this story does NOT fix it, that's Story 4/1's job via `normalizeAlert`; this story just stores the raw payload faithfully).

### Out of Scope
- Normalizing/merging alerts (Story 1 + Story 4).
- Routing acknowledge to the REST mutation for non-live ids (Story 4).

### Notes for Developer
- This story's only job is a faithful, singleton subscription — resist the temptation to normalize data here; keep `liveAlerts` raw so Story 4 has one clear place to do normalization/merging.
- Mounting location in `App.tsx` matters: inside `QueryClientProvider` (no hard dependency, but keeps provider order conventional), outside `BrowserRouter` (so it survives route changes without resubscribing).

---

## Story 4: Active Alerts Aggregation Hook

**Repository:** factory-monitor
**Type:** Feature
**Priority:** Must
**Size:** M
**Dependencies:** Story 1 (`src/lib/alerts.ts`) and Story 3 (`src/live/LiveProvider.tsx`) must be merged first — this is the integration seam between them, not an independent component. Runs in **Batch 2**, after Batch 1 completes.

### Description
As a developer building the Dashboard and Alerts pages,
I want one hook that returns the fully merged, normalized, sorted, filterable list of active alerts and a single `acknowledge` function that works regardless of whether an alert came from REST or the live feed,
So that page components never have to know about the REST/live split or the normalization details themselves.

### Technical Context
- **Affected modules:** `src/hooks/` (new file)
- **Design reference:** `design/1a-discovery.md` ADR-001 (why live alerts must be merged at read-time, not cached); `design/1b-contracts.md` Part 3
- **Key files to create:** `src/hooks/useActiveAlerts.ts`
- **Patterns to follow:** existing `useAlerts.ts`/`useAcknowledgeAlert.ts` for the REST-facing half
- **Dependencies:** Story 1's `normalizeAlert`/`sortAlerts`/`dedupeById`/`groupByMachine`; Story 3's `useLive()`; existing `useAlerts`, `useAcknowledgeAlert`, `useZones`

### Integration Contracts

**Interfaces Defined by This Story:**
```ts
// src/hooks/useActiveAlerts.ts
export function useActiveAlerts(filters?: { severity?: Alert["severity"]; zone?: string }): {
  alerts: NormalizedAlert[];           // REST ∪ live, deduped, normalized, sorted — client-side filtered by severity/zone identically regardless of origin
  isLoading: boolean;
  isError: boolean;
  acknowledge: (id: string) => void;   // id.startsWith("ws-alt-") → useLive().acknowledgeLocal(id); else → useAcknowledgeAlert().mutate(id)
  acknowledgePending: boolean;
  bulkAcknowledge: (ids: string[]) => Promise<{ succeeded: string[]; failed: string[] }>; // Promise.allSettled over acknowledge calls
};
```

**Interfaces Used by This Story:**
```ts
import { normalizeAlert, sortAlerts, dedupeById } from "../lib/alerts"; // Story 1
import { useLive } from "./useLive";                                    // Story 3
import { useAlerts } from "./useAlerts";                                // existing
import { useAcknowledgeAlert } from "./useAcknowledgeAlert";            // existing
import { useZones } from "./useZones";                                  // existing
```

**Integration Timeline:** Phase 4 Batch 2 (alone — the seam story). Consumed starting Batch 3 (Stories 5 and 6).

### Acceptance Criteria
- [ ] **Given** the default mock (6 REST alerts, 0 live yet), **When** `useActiveAlerts()` is called, **Then** `alerts` contains exactly the 6, normalized and sorted per Story 1's rules.
- [ ] **Given** a live `alert` message has arrived via `useLive()`, **When** `useActiveAlerts()` is called again, **Then** the new alert appears in `alerts`, normalized (its buggy `zoneName` resolved correctly via `zoneById`).
- [ ] **Given** `filters.severity = "critical"` and `filters.zone = "welding"`, **When** `useActiveAlerts(filters)` is called, **Then** only critical Welding alerts are returned, including any live ones matching the filter.
- [ ] **Given** `acknowledge("alt-002")` (a REST alert) is called, **When** the mutation resolves, **Then** `useAlerts`'s underlying cache is invalidated and the alert's `acknowledged` becomes `true` on the next read.
- [ ] **Given** `acknowledge("ws-alt-1234567890")` (a live alert) is called, **Then** no REST request is made (avoiding the 404), and the alert is marked acknowledged via `useLive().acknowledgeLocal`.
- [ ] **Given** `bulkAcknowledge(["alt-001","alt-002"])` is called and one of the two requests fails, **When** the promise resolves, **Then** `succeeded` and `failed` correctly partition the ids (no thrown/unhandled rejection).

### Implementation Details
See `design/1a-discovery.md`'s architecture diagram for the exact merge/dedupe/sort pipeline this hook implements, and ADR-001 for why this must never write into the TanStack Query `["alerts"]` cache key.

### Out of Scope
- Any rendering (Stories 5, 6).
- Persisting local acknowledgements across a reload (explicitly out of scope per PRT §3 — the mock resets on reload anyway).

### Notes for Developer
- This is the single most important correctness seam in the whole feature (per ADR-001) — get the dedupe-then-merge-then-filter order right: filtering must apply to the merged set, not filter REST and live separately and then merge (that would silently mishandle a live alert until the next REST refetch changes what "REST alerts" contains).

---

## Story 5: Dashboard Page & Components

**Repository:** factory-monitor
**Type:** Feature
**Priority:** Must
**Size:** M
**Dependencies:** Story 1, Story 2, Story 4 must be merged first. Runs in **Batch 3**, parallel with Stories 6 and 7 (different files — no conflicts).

### Description
As an operator, I want to see connection status, machine/zone counts, uptime, an attention banner, and ranked zone health cards on landing (S1, S2, S6, S9),
So that I know the system is live and immediately know where to focus.

### Technical Context
- **Affected modules:** `src/components/` (new), `src/pages/Dashboard.tsx` (modify — currently an empty stub)
- **Design reference:** `ux-ideation.md` "Screen: Dashboard"; PRT FR-001, FR-002, FR-003, FR-004 (dashboard), FR-011, FR-012
- **Key files to create:** `src/components/StatTile.tsx`, `src/components/AttentionBanner.tsx`, `src/components/ZoneHealthCard.tsx`
- **Key files to modify:** `src/pages/Dashboard.tsx`
- **Patterns to follow:** `src/components/SampleCard.tsx` (typed props, `Card`/`CardHeader`/`CardBody`, `Skeleton`/`SkeletonText` loading states)
- **Dependencies:** Story 1 (`status.ts` color maps), Story 2 (`useAllMachines`), Story 4 (`useActiveAlerts`, unfiltered, grouped by `zoneId` client-side with `useMemo`); existing `useFactoryStatus`, `useZones`

### Integration Contracts

**Interfaces Used by This Story:**
```ts
import { severityColor, healthColor, machineStatusColor } from "../lib/status"; // Story 1
import { useAllMachines } from "../hooks/useAllMachines";                        // Story 2
import { useActiveAlerts } from "../hooks/useActiveAlerts";                      // Story 4
import { useFactoryStatus } from "../hooks/useFactoryStatus";                    // existing
import { useZones } from "../hooks/useZones";                                    // existing
```
This story defines no interfaces other components depend on — it is a leaf (page composition).

**Integration Timeline:** Phase 4 Batch 3.

### Acceptance Criteria
- [ ] **Given** the default mock data, **When** `/` loads, **Then** 4 `StatTile`s show Connected=Live, Machines=14, Zones=4, Uptime=`127.4h`.
- [ ] **Given** data is loading, **When** `/` first renders, **Then** skeletons matching `SampleCard`'s shape appear, not a blank page.
- [ ] **Given** `useFactoryStatus` errors, **When** `/` renders, **Then** an inline error message is shown instead of a crash or blank KPI row.
- [ ] **Given** the default mock (2 critical, 2 warning, both unacknowledged pairs), **When** `/` loads, **Then** the attention banner reads "2 critical · 2 warning unacknowledged" and links to `/alerts`.
- [ ] **Given** zero unacknowledged critical/warning alerts, **When** `/` loads, **Then** the banner shows an "All clear" state instead.
- [ ] **Given** the 4 default zones (Packaging=faulted, Welding=degraded, Assembly=healthy, Painting=healthy), **When** the Zone Health grid renders, **Then** Packaging appears first, Welding second, and each card shows the correct machine count and open critical/warning count for that zone.
- [ ] **Given** a user clicks the Packaging zone card, **When** navigation completes, **Then** the URL is `/alerts?zone=packaging`.

### Implementation Details
Zone health counts must be derived from a single unfiltered `useActiveAlerts()` call grouped client-side by `zoneId` with `useMemo` — never one `useActiveAlerts({zone})` call per zone card (N+1 pattern), per `design/1c-operations.md`'s optimization strategy.

### Out of Scope
- The Alerts page itself (Story 6) — only the banner's link target.
- Live telemetry indicator (Story 7 territory is Topology; the Dashboard's `LiveIndicator` is Should-priority and may be added as a small follow-up using Story 3's `useLive().lastMessageAt` if time remains after Stories 5/6 land — not blocking this story's Definition of Done).

### Notes for Developer
- `useZones` `health` field is trusted as-is (PRT Q1) — don't recompute zone health from alerts, only show alert counts alongside it.

---

## Story 6: Alerts Page & Components (built for high alert volume)

**Repository:** factory-monitor
**Type:** Feature
**Priority:** Must
**Size:** L
**Dependencies:** Story 1, Story 4 must be merged first. Runs in **Batch 3**, parallel with Stories 5 and 7 (different files — no conflicts).

### Description
As an operator, I want to see, filter, and acknowledge active problems — and have that experience hold up whether there are 6 or 50+ alerts (S3, S4, S5, S11),
So that I can triage quickly regardless of how bad the day is.

### Technical Context
- **Affected modules:** `src/components/` (new), `src/pages/Alerts.tsx` (modify — currently an empty stub)
- **Design reference:** `ux-ideation.md` "Screen: Alerts"; PRT FR-004 (alerts), FR-005 through FR-009, FR-019 through FR-024
- **Key files to create:** `src/components/SeverityChips.tsx`, `src/components/AlertsFilterBar.tsx`, `src/components/MachineAlertGroupCard.tsx`, `src/components/AlertsTable.tsx`
- **Key files to modify:** `src/pages/Alerts.tsx`
- **Patterns to follow:** `src/components/SampleCard.tsx`; Chakra `Collapse` for expand/collapse; `useSearchParams` (react-router-dom, already a dependency) for the `?zone=` URL sync
- **Dependencies:** Story 1 (`formatRelativeTime`, `groupByMachine`, `severityColor`), Story 4 (`useActiveAlerts`)

### Integration Contracts

**Interfaces Used by This Story:**
```ts
import { severityColor, formatRelativeTime, groupByMachine } from "../lib/alerts"; // + status.ts, Story 1
import { useActiveAlerts } from "../hooks/useActiveAlerts";                         // Story 4
import { useSearchParams } from "react-router-dom";                                 // existing dependency
```
This story defines no interfaces other components depend on — it is a leaf (page composition).

**Integration Timeline:** Phase 4 Batch 3.

### Acceptance Criteria (build incrementally in this order per `epic-breakdown.md` E2 build notes)
- [ ] **Given** the default 6 alerts, **When** `/alerts` loads, **Then** all 6 render with severity badge, machine, zone, message, relative time, and an Acknowledge button.
- [ ] **Given** a user selects severity=critical and zone=welding, **When** the filters change, **Then** the list updates immediately (no submit) to show only matching alerts, live ones included.
- [ ] **Given** a user clicks Acknowledge on `welder-02`'s critical alert, **When** the mutation resolves, **Then** a success toast appears and the row shows "Acknowledged".
- [ ] **Given** `window.__setAlertScenario("stress")` (50 alerts, 14 machines), **When** `/alerts` loads, **Then** the default grouped view shows exactly 14 machine-group rows, and severity chips read "Critical 10 · Warning 21 · Info 19".
- [ ] **Given** the stress scenario, **When** a user clicks the "Critical" chip, **Then** only groups containing at least one critical alert remain visible.
- [ ] **Given** the stress scenario, **When** a user expands `press-01`'s group and clicks "Acknowledge all", **Then** all of `press-01`'s unacknowledged alerts are acknowledged with one summary toast.
- [ ] **Given** `window.__setAlertScenario("empty")`, **When** `/alerts` loads, **Then** a clear empty-state message renders — no error, no blank page.
- [ ] **Given** the flat/grouped toggle, **When** a user switches views, **Then** the currently active filters remain applied.
- [ ] **Given** an alert's info-severity group, **When** the page first renders, **Then** it is collapsed by default with a "N info alerts, show" affordance.
- [ ] `alt-004` shows a real machine name, `alt-005` shows "Unknown time" and sorts last, `alt-006` shows the correct (resolved) zone name.

### Implementation Details
Build order matches `epic-breakdown.md` E2: (1) flat table + single acknowledge, (2) severity chips, (3) machine grouping as default with flat toggle, (4) bulk acknowledge, (5) info-alert collapse, (6) search (Could, only if time remains).

### Out of Scope
- The "N new alerts" stable-ordering pill for live updates (FR-023) — that's a Should tied to real-time behavior; add only if Story 4's live merge is visibly working and time remains. Not blocking this story's Definition of Done.
- Text search (FR-024, Could) — add last, only if time remains.

### Notes for Developer
- Verify against `window.__setAlertScenario("stress")` continuously while building steps 2–4, not just against the default 6 — the whole point of this story is that it doesn't fall apart at volume.

---

## Story 7: Factory Topology Page (stretch)

**Repository:** factory-monitor
**Type:** Feature
**Priority:** Could
**Size:** M
**Dependencies:** Story 1, Story 2 must be merged first; Story 3 optional (for live tooltips). Runs in **Batch 3**, parallel with Stories 5 and 6 (different files — no conflicts).

### Description
As a supervisor, I want a visual floor layout of zones and machines colored by status, with live telemetry on hover (S10),
So that I can see where problems are physically located on the floor.

### Technical Context
- **Affected modules:** `src/pages/Topology.tsx` (modify — currently an empty stub)
- **Design reference:** `ux-ideation.md` "Screen: Topology"; PRT FR-015, FR-016
- **Key files to modify:** `src/pages/Topology.tsx` (no new component files required — small enough to compose inline, or add `src/components/MachineTile.tsx` if it grows)
- **Patterns to follow:** Chakra `SimpleGrid`/`Wrap`/`Tooltip`
- **Dependencies:** Story 1 (`machineStatusColor`, `healthColor`), Story 2 (`useAllMachines`); Story 3 (`useLive().telemetry`) only if present when this story starts

### Integration Contracts

**Interfaces Used by This Story:**
```ts
import { machineStatusColor, healthColor } from "../lib/status"; // Story 1
import { useAllMachines } from "../hooks/useAllMachines";         // Story 2
import { useLive } from "../hooks/useLive";                       // Story 3, optional
import { useZones } from "../hooks/useZones";                     // existing
```
This story defines no interfaces other stories depend on — it is a leaf and the lowest priority (Could).

**Integration Timeline:** Phase 4 Batch 3, built last / only if time remains per the confirmed depth-first-on-core-3 priority.

### Acceptance Criteria
- [ ] **Given** the default mock (4 zones, 14 machines), **When** `/topology` loads, **Then** all 4 zone regions and all 14 machine tiles render, colored by status.
- [ ] **Given** `welder-02` and `press-01` (both `status: "error"`), **When** `/topology` renders, **Then** both are visually distinct (red) from running machines.
- [ ] **If Story 3 has landed:** **Given** a telemetry message arrives for a visible machine, **When** the user hovers that tile, **Then** the tooltip shows the latest temperature/vibration/throughput/power values and a timestamp.

### Implementation Details
This is explicitly the lowest-priority story (Could / stretch goal per the problem statement's own framing) — build it last, and ship without live tooltips if Story 3 isn't ready or time is short; static status coloring alone satisfies the core ask (S10).

### Out of Scope
- Drag-and-drop or editable layout — this is a read-only visual, not a floor-plan editor.
- Historical telemetry trends on hover (would need a chart library, out of scope per PRT §3).

### Notes for Developer
- If time is genuinely short, this story is the one to cut entirely — the epic breakdown already scopes it as Could/stretch, and cutting it does not affect any other story's completeness.

---

## Parallelization Plan

**Batch 1 (ZERO dependencies — start immediately, fully parallel)**
- Story 1: Shared Status & Alert Normalization Utilities
- Story 2: All-Machines Aggregation Hook
- Story 3: Live Data Provider

**Batch 2 (depends on Batch 1 merged)**
- Story 4: Active Alerts Aggregation Hook

**Batch 3 (depends on Batches 1–2 merged; fully parallel with each other)**
- Story 5: Dashboard Page & Components
- Story 6: Alerts Page & Components
- Story 7: Factory Topology Page (Could — lowest priority, cut first if time runs short)

**Integration (Phase 6 / orchestrated)**
- Merge the single shared file touched outside `src/lib`/`src/hooks`/`src/pages`/`src/components`: `src/App.tsx` (Story 3's `LiveProvider` wrap).
- End-to-end verification: walk all 5 journeys from `ux-ideation.md`.

**Key rule check:** within each batch, no arrows between stories — confirmed: Story 1/2/3 touch entirely disjoint files; Story 5/6/7 touch entirely disjoint files (`Dashboard.tsx` vs `Alerts.tsx` vs `Topology.tsx`, and disjoint new component files).

---

## Traceability to Epic Breakdown

| Story | Epic(s) | Notes |
|---|---|---|
| Story 1 | E1 | Extracted as its own parallel story (epic breakdown bundled it into E1's build notes) |
| Story 2 | E1 | Extracted as its own parallel story |
| Story 3 | E4 (moved earlier) | Building the provider doesn't require Story 4's merge logic to exist yet — pulled into Batch 1 for more parallelism than the epic breakdown's sequential E1→E4 implied |
| Story 4 | E1 (attention banner needs it) + E2 (alerts page needs it) | The true integration seam; epic breakdown had this implicit inside E1/E2's build notes |
| Story 5 | E1 + E3 | Dashboard KPIs (E1) and Zone Health cards (E3) are the same page/file, so combined into one story |
| Story 6 | E2 | Matches directly |
| Story 7 | E5 | Matches directly |

## Update State
`state.json`'s `stories` object has been populated with all 7 stories above (status `not_started`, files pre-populated from this document).

## Next Step
Proceed to Phase 2B (Acceptance Checklist) before Phase 3 (Code Spec) — per the phase guide, Phase 2B must not be skipped.
