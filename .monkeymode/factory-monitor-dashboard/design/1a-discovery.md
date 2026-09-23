# Design: Factory Monitor Dashboard — Phase 1A

## Executive Summary
Operators currently have no consolidated view of the factory floor. This feature adds three (plus two stretch) screens to an existing React SPA that surface factory-wide status, active problems, and per-zone health, backed entirely by pre-built hooks and a mock REST + WebSocket backend. The design's central challenge is not the UI chrome (Chakra UI provides that) but two closed technical problems: **merging an ephemeral WebSocket alert stream into a React-Query-backed REST alert list without either dropping live data or duplicating it**, and **making a 50+ alert list operable for triage rather than just readable**.

## Use Case & Business Value
- **Problem:** No single screen shows connection state, active problems, or zone health; a flat alert list breaks down at the alert volumes product described (~20/day typical, 50+ on a bad day).
- **User impact:** Two personas — Floor Operator (moment-to-moment triage) and Shift Supervisor (where-to-send-people decisions) — used continuously during a shift.
- **Success metrics:** top problem identifiable in <5s from landing; acknowledge = one click; new critical alerts visible without a manual refresh.
- **Out of scope:** auth, persistence of acknowledgements across reload, historical charts, escalation, mobile layout, automated tests (no runner installed). See PRT §3 for the full list.
- **Timeline:** single live session; this is the full PRT/epic breakdown already produced in the MonkeyPlan handoff (`.monkeymode/factory-monitor-dashboard/prt.md`, `epic-breakdown.md`) — this design formalizes the technical approach those artifacts already committed to, it does not re-derive requirements.

## Discovery Answers (from repo exploration + PRT handoff — no further user input needed)

**Technical context**
- Stack: React 18.3, TypeScript 5.6, Vite 6, Chakra UI 2.8, TanStack Query 5.60, react-router-dom 6.28. No chart library, no icon package, no test runner (`npm run dev`/`build`/`preview` only).
- Architecture pattern: client-only SPA against a mocked backend (MSW 2.6 REST handlers + an in-memory `MockWebSocketServer` singleton simulating a live feed). There is no real server to design for.
- Existing pattern to follow: `src/components/SampleCard.tsx` — typed props, a plain object status→`colorScheme` map, `Skeleton`/`SkeletonText` loading states matching the loaded layout's shape. All new presentational components follow this.
- Current data model: fully defined in `src/types.ts` (`Zone`, `Machine`, `MachineTelemetry`, `Alert`, `FactoryEvent`, `FactoryStatus`, `WebSocketMessage`) — see Core Data Model below; no schema changes.
- Existing API/data-access pattern: one `useQuery`/`useMutation` hook per concern in `src/hooks/`, calling `fetch()` against `/api/*` (intercepted by MSW). This feature adds hooks in the same style, not a new pattern.
- Deployment model: n/a (static Vite SPA, `npm run build`).

**Scale & load** — Explicit product input: ~20 alerts/day typical, 50+ on a bad day. Verified against the repo's own stress fixture (`src/mocks/data/scenarios/alerts-50.json`): 50 alerts / 14 machines (3–4 each), 10 critical / 21 warning / 19 info, 32 unacknowledged. This is trivial data volume for React (no virtualization needed below ~500 rows); the real scaling problem is operator *attention*, addressed via grouping/chips/bulk-ack (see ADR-002).

**Integration context** — Single backend: the provided MSW mock. WebSocket "events" consumed: `telemetry` (~3s interval, one random machine) and `alert` (~15s interval, ~30% chance). No other services.

**Compliance** — None; synthetic data, no PII, no auth.

## Architecture Decision

### Chosen Approach: Client-side normalization + a single app-level live-data provider

All state lives in the browser. TanStack Query owns REST data (`Zone[]`, `Machine[]`, `Alert[]`, `FactoryStatus`) with its existing cache/staleness config (`staleTime: 10000`, unchanged). A new `LiveProvider`, mounted once in `App.tsx`, owns the single `useFactoryWebSocket` subscription for the entire app and exposes live alerts / telemetry / connection-freshness via context. A derived hook, `useActiveAlerts`, is the single seam where REST alerts and live alerts are normalized, merged, deduplicated, and sorted — every page reads through this hook rather than touching `useAlerts`/`useFactoryWebSocket` directly.

```
┌────────────────────────────────────────────────────────────────┐
│ App.tsx                                                         │
│  QueryClientProvider (TanStack Query — REST cache)              │
│   └─ LiveProvider  ── one useFactoryWebSocket(cb) subscription  │
│        state: liveAlerts[], telemetry{machineId→snapshot},      │
│               lastMessageAt                                     │
│        └─ Router                                                │
│             ├─ Dashboard ── useFactoryStatus, useZones,          │
│             │              useAllMachines, useActiveAlerts()     │
│             ├─ Alerts    ── useActiveAlerts(filters)             │
│             └─ Topology  ── useAllMachines, useLive().telemetry  │
└────────────────────────────────────────────────────────────────┘
                 │ fetch("/api/*")            │ setInterval "telemetry"/"alert"
                 ▼                            ▼
        ┌────────────────┐          ┌───────────────────────┐
        │ MSW REST        │          │ MockWebSocketServer    │
        │ handlers.ts     │          │ websocket.ts (singleton)│
        │ (in-memory      │          │ - telemetry every ~3s   │
        │  alerts array)  │          │ - alert every ~15s, 30% │
        └────────────────┘          └───────────────────────┘

useActiveAlerts(filters):
  normalize( REST useAlerts(filters) ∪ LiveProvider.liveAlerts )
    → dedupe by id → sort (unacked, severity, newest, invalid-ts-last)
    → acknowledge(id): ws-alt-* → local ack; else → useAcknowledgeAlert.mutate(id)
```

### Alternatives Considered

| Option | Pros | Cons | Why Not Chosen |
|---|---|---|---|
| **A. Push live alerts into the React Query cache via `queryClient.setQueryData(["alerts"], ...)`** | Single source of truth; pages only ever call `useAlerts()` | `useAcknowledgeAlert`'s `invalidateQueries(["alerts"])` refetches from the REST mock and **silently drops** any cache-injected live alert (confirmed by reading `useAcknowledgeAlert.ts` and `handlers.ts` — the mock's in-memory store never received the WS alert). Also `ws-alt-*` ids 404 against the acknowledge endpoint. | Rejected — a real correctness bug, not just style |
| **B. Subscribe to the WebSocket separately inside each page that needs it** | No shared provider to build | `useFactoryWebSocket`'s effect has `[]` deps, capturing its callback once; multiple independent subscriptions plus stale closures multiply the bug surface. The singleton `mockWebSocket` also never calls `disconnect()` on unmount, so timers pile up across page navigations if each page mounts its own subscription. | Rejected |
| **C. Separate live store (`LiveProvider`) + merge-at-read-time via `useActiveAlerts`** (chosen) | One subscription for the app's lifetime; REST stays the source of truth for anything the mock can persist; live data is additive and never lost to invalidation; functional `setState` sidesteps the stale-closure issue | An extra layer (`useActiveAlerts`) all alert-consuming code must go through instead of the raw `useAlerts` hook | **Chosen** — correctness (Option A's bug) and single-subscription lifecycle (Option B's bug) both matter more than the one extra hook |

### ADR-001: Merge live alerts outside the React Query cache

**Status:** Accepted
**Context:** WebSocket-originated alerts are not persisted by the mock backend and are invisible to `/api/alerts`. `useAcknowledgeAlert` invalidates the `["alerts"]` query key on every successful acknowledge, which would silently erase any live alert if it lived only in that cache entry.
**Decision:** Live alerts live in `LiveProvider`'s own React state (`liveAlerts: Alert[]`), never in the TanStack Query cache. `useActiveAlerts` merges REST + live at read time on every render (cheap — memoized, capped at realistic alert volumes).
**Consequences:**
- *Positive:* No data loss on acknowledge invalidation; REST remains the single source of truth for anything the backend can actually persist.
- *Negative:* Acknowledging a `ws-alt-*` id can only be local (no backend endpoint accepts it) — acknowledgement state for live alerts does not survive a reload. Documented as a known mock limitation (PRT Q2), not a bug to engineer around.
- *Risk:* If a live alert and a REST alert ever shared an id, dedup-by-id could hide one. Not observed in the mock (`ws-alt-${Date.now()}` vs fixture ids like `alt-001`); mitigated by dedup logic regardless.

### ADR-002: Handle alert volume via grouping/summarization, not virtualization

**Status:** Accepted
**Context:** Product specified ~20 alerts/day typical, 50+ on a bad day (S11). The stress fixture confirms 50 alerts spread over only 14 machines.
**Decision:** Default the Alerts page to a **grouped-by-machine** view (50 alerts → 14 rows) with severity summary chips, collapsed info-severity alerts, and bulk acknowledge per group. A flat view remains available via toggle. No list virtualization or pagination is added.
**Consequences:**
- *Positive:* Solves the actual problem (operator scanning effort) at the actual scale (tens, not thousands).
- *Negative:* If future alert volume grows into the hundreds+ per machine, grouping alone stops being sufficient.
- *Risk:* None at current scale — explicitly deferred as a documented, evidence-based scoping decision (see NFR in PRT §7), not an oversight.

### Architecture Diagram
See the diagram embedded in "Chosen Approach" above — the same diagram serves as both the component/data-flow view and the sequence of a live alert traveling from the mock WebSocket to an acknowledged, on-screen row.

## Core Data Model

No new persisted entities — `src/types.ts` already defines the full domain and is not modified. This design adds only **derived, in-memory shapes**:

#### Zone, Machine, Alert, FactoryStatus, MachineTelemetry (existing, unchanged)
Defined in `src/types.ts`; see the PRT's "Repo facts" table for the exact fields and known data-quality issues (`alt-004`'s `machine_name` vs `machineName`, `alt-005`'s invalid epoch timestamp, `alt-006`'s `zoneId`/`zoneName` mismatch, and the WebSocket alert payload's `zoneName = zoneId` bug).

#### NormalizedAlert (derived, not persisted)
```
NormalizedAlert extends Alert
├── zoneName: string        — always resolved from zones[zoneId], never trusted from the raw payload
├── machineName: string     — machineName ?? machine_name ?? machineId
├── timestampValid: boolean — false for any timestamp parsing to before year 2000
└── source: "rest" | "live" — for dedup/debugging only, not rendered

Built by: src/lib/alerts.ts#normalizeAlert(raw, zoneById)
```

#### MachineAlertGroup (derived, view-model for the grouped Alerts view)
```
MachineAlertGroup
├── machineId: string
├── machineName: string
├── zoneId, zoneName: string
├── alerts: NormalizedAlert[]       — this machine's alerts, already sorted
├── worstSeverity: "critical" | "warning" | "info"
└── unacknowledgedCount: number

Built by: src/lib/alerts.ts#groupByMachine(alerts)
Relationship: one MachineAlertGroup per distinct machineId present in the current filtered alert set (1:N from Machine to Alert, expressed as a view, not a stored relation)
```

#### TelemetrySnapshot (derived, live-only, never persisted)
```
TelemetrySnapshot
├── machineId, machineName, zoneId: string
├── telemetry: MachineTelemetry     — reuses the existing type
└── timestamp: string (ISO)

Held in: LiveProvider's telemetry: Record<machineId, TelemetrySnapshot>
Source: WebSocketMessage where type === "telemetry" (payload shape confirmed by reading src/mocks/websocket.ts — does NOT match the full Machine type, no status field)
```

No indexes/constraints apply — everything above is in-memory, computed with `useMemo`, and recomputed from `Zone[]`/`Machine[]`/`Alert[]`/live state on each relevant change.

## Next Steps
- Phase 1B: Define the concrete hook/function contracts (`useActiveAlerts`, `useAllMachines`, `LiveProvider`/`useLive`, `normalizeAlert`, `sortAlerts`, `groupByMachine`) and page-level composition.
- Phase 1C: Address performance (memoization boundaries), the two accepted risk tradeoffs above (ADR-001, ADR-002), and rollout (this ships directly to the single Vite build, no staged rollout).
