# Code Spec: Factory Topology Page (stretch)

**Story ID:** story-7-topology-page
**Status:** Ready for implementation

## Summary
Replace the empty `src/pages/Topology.tsx` stub with a read-only floor-plan view: one region per zone (`SimpleGrid`), each containing a `Wrap` of machine tiles colored by `machineStatusColor`, with an optional hover tooltip showing live telemetry when `useLive()` exists. This is explicitly the lowest-priority story in the whole feature (Could / stretch, PRT S10/FR-015/FR-016) and **is the first thing to cut if time runs short** — cutting it does not affect any other story's completeness, since nothing else depends on this page.

## Files to Create
- `src/components/MachineTile.tsx` — only if inline composition in `Topology.tsx` grows unwieldy (roughly: if the JSX for one tile exceeds ~15–20 lines once the optional tooltip is added). Purpose: a single machine's colored tile + optional hover tooltip, given a `Machine` and an optional `TelemetrySnapshot`.

## Files to Modify
- `src/pages/Topology.tsx` — replace the empty `Container` stub with the full page: fetch zones + machines, group machines by zone, render one region per zone (zone name, health badge, machine count) containing a `Wrap` of colored machine tiles, with loading/error states. Conditionally wire live tooltips if `src/hooks/useLive.ts` exists at implementation time.

## Task Breakdown
| # | Task | Files Touched | Notes |
|---|------|----------------|-------|
| 1 | Check whether `src/hooks/useLive.ts` exists on disk | (read-only check) | Determines whether Task 5 (tooltip wiring) happens at all. Do this check first, before writing any import of `useLive`. |
| 2 | Fetch data: `useZones()` (existing) + `useAllMachines()` (Story 2) | `src/pages/Topology.tsx` | Two independent hook calls; no request chaining needed since neither depends on the other's result for fetching (only for grouping, done client-side). |
| 3 | Build `machinesByZoneId: Map<string, Machine[]>` via `useMemo` from `machines` | `src/pages/Topology.tsx` | Group once per `machines` array identity change, not per render. |
| 4 | Render zone regions in a `SimpleGrid` (1 col mobile / 2 col `md`), each a `Card` with zone name + `healthColor`-based `Badge` (`healthColor[zone.health]`) + machine count, containing a `Wrap` of machine tiles colored via `machineStatusColor[machine.status]` | `src/pages/Topology.tsx` | Iterate zones from `useZones()`, not from machines, so a zone with 0 machines still renders as an empty region (defensive; not expected in default mock but cheap correctness). |
| 5 | If `useLive` exists: read `telemetry` from `useLive()` and wrap each tile in a Chakra `Tooltip` whose label renders `telemetry[machine.id]` (temperature/vibration/throughput/powerDraw + relative/absolute timestamp) when present, or a "No live data yet" fallback when absent | `src/pages/Topology.tsx` (or `MachineTile.tsx`) | **Never** derive `machine.status`/tile color from the telemetry payload — it has no `status` field. Status/color always comes from the `useAllMachines()`-sourced `Machine` object. |
| 6 | Loading and error states | `src/pages/Topology.tsx` | Loading: `Skeleton` blocks matching the zone-region/tile shape (per `SampleCard.tsx` convention). Error: inline message, no crash, if either `useZones` or `useAllMachines` reports `isError`. |
| 7 | Extract `MachineTile` component only if step 4+5's inline JSX becomes unwieldy | `src/components/MachineTile.tsx` (new, optional) | Not required by acceptance criteria; a purely internal readability call. |

## Function/Component Signatures

```tsx
// src/pages/Topology.tsx
import {
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  Container,
  Heading,
  HStack,
  Skeleton,
  SkeletonText,
  SimpleGrid,
  Text,
  Tooltip,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useMemo } from "react";
import { machineStatusColor, healthColor } from "../lib/status";
import { useAllMachines } from "../hooks/useAllMachines";
import { useZones } from "../hooks/useZones";
// OPTIONAL — only import if src/hooks/useLive.ts exists at implementation time:
// import { useLive } from "../hooks/useLive";
import type { Machine, Zone } from "../types";

export function Topology(): JSX.Element;

// Internal helper (inline in Topology.tsx or extracted):
function groupMachinesByZone(machines: Machine[] | undefined): Map<string, Machine[]>;

// Optional extraction, only if needed (see Task 7):
// src/components/MachineTile.tsx
interface MachineTileProps {
  machine: Machine;
  /** Only present when useLive.ts exists in the codebase; omit the prop entirely otherwise. */
  telemetrySnapshot?: {
    temperature: number;
    vibration: number;
    throughput: number;
    powerDraw: number;
    timestamp: string; // ISO
  };
}
export function MachineTile({ machine, telemetrySnapshot }: MachineTileProps): JSX.Element;
```

**Notes on the signatures:**
- `useAllMachines()` returns `{ machines: Machine[] | undefined; isLoading: boolean; isError: boolean }` per the approved contract (`design/1b-contracts.md` Part 3, Story 2). Treat this as fixed even though `src/hooks/useAllMachines.ts` does not exist on disk yet at spec-writing time.
- `machineStatusColor` / `healthColor` are `Record<Machine["status"], string>` / `Record<Zone["health"], string>` exported from `src/lib/status.ts` per the approved contract (Story 1). Also does not exist on disk yet — treat the signature as fixed.
- `useLive()` returns `LiveContextValue` with `telemetry: Record<string, TelemetrySnapshot>` per Story 3's contract, **if** `src/hooks/useLive.ts` exists. If it does not exist at implementation time, skip all `useLive` imports/usage entirely — do not stub or fake it.
- `Zone["health"]` is `"healthy" | "degraded" | "faulted"`; `Machine["status"]` is `"running" | "idle" | "error" | "maintenance"` (from `src/types.ts`, unmodified).

## Test Case Table
| Case | Input | Expected Output | Type (happy/edge/error) |
|------|-------|------------------|--------------------------|
| Default render | Default mock: 4 zones (`assembly`, `welding`, `painting`, `packaging`), 14 machines | All 4 zone region cards render with correct names; all 14 machine tiles render across them, each colored per `machineStatusColor[machine.status]` | happy |
| Error-status distinction | `welder-02` (zone `welding`, status `error`) and `press-01` (zone `packaging`, status `error`) | Both tiles render with the `red`-mapped color/badge, visually distinct from `running` (green) tiles; no other machine incorrectly shares this color unless also `status: "error"` | happy |
| Zone health badge | `packaging` zone has `health: "faulted"`, `welding` has `"degraded"`, `assembly`/`painting` have `"healthy"` | Each zone card's badge color matches `healthColor[zone.health]` (`faulted`→red, `degraded`→orange, `healthy`→green) | happy |
| Loading state | `useZones()` or `useAllMachines()` still loading | `Skeleton`/`SkeletonText` placeholders render in place of zone regions/tiles; no crash, no blank page | edge |
| Zones error | `useZones()` reports `isError: true` | Inline error message renders; page does not crash | error |
| Machines error | `useAllMachines()` reports `isError: true` | Inline error message renders; page does not crash | error |
| Zone with 0 rendered machines (defensive) | A zone present in `useZones()` output but absent from `machinesByZoneId` | Zone region still renders (name, health badge, "0 machines"), with an empty `Wrap` | edge |
| Live tooltip present | `useLive.ts` exists; a `telemetry` WS message arrives for `cnc-mill-01`; user hovers its tile | Tooltip shows temperature/vibration/throughput/powerDraw and a timestamp from the live snapshot | happy (conditional on Story 3 landing) |
| Live tooltip absent (no snapshot yet) | `useLive.ts` exists but no telemetry message has arrived yet for the hovered machine | Tooltip shows a "No live data yet" (or equivalent) fallback, not `undefined`/blank/crash | edge (conditional) |
| `useLive.ts` does not exist | Story 3 not yet merged at implementation time | Page renders with static status coloring only, no tooltip content, no import of `useLive`, no build error | edge (explicitly allowed by story scope) |
| Status never overwritten by telemetry | A `telemetry` message arrives for `welder-02` (still `status: "error"` per REST) | `welder-02`'s tile color/badge remains red (error); the telemetry payload (no `status` field) never changes the displayed status | error-prevention / correctness |

## Verification Steps (manual, since no test runner exists)
1. Run `npm run build` (`tsc -b && vite build`) — must pass with zero TypeScript errors before considering this story done.
2. Run `npm run dev`, navigate to `http://localhost:5173/topology`.
3. Confirm all 4 zone region cards render (Assembly Line, Welding Bay, Painting & Coating, Packaging & Shipping) and all 14 machine tiles render across them, matching `useZones()`/`useAllMachines()` counts.
4. Visually confirm `welder-02` and `press-01` render in red (error), distinct from green `running` tiles; spot-check one `idle` (gray) and one `maintenance` (purple) machine if present in current mock data.
5. Confirm each zone card's health badge color matches its `health` field (Packaging=red/faulted, Welding=orange/degraded, Assembly & Painting=green/healthy).
6. Throttle network (DevTools) or reload repeatedly to observe the loading `Skeleton` state briefly before data resolves — confirm no blank flash or layout shift into the loaded shape.
7. If `src/hooks/useLive.ts` exists: leave the tab open and focused for ~3–5 seconds (telemetry ticks every ~3s per `src/mocks/websocket.ts`), then hover a machine tile and confirm the tooltip shows temperature/vibration/throughput/power and a timestamp. Hover a machine that hasn't received a telemetry message yet and confirm the fallback text (not blank/crash).
8. Confirm hovering `welder-02` (error status) still shows red coloring even after a telemetry message arrives for it — status must never flip based on telemetry.
9. If `src/hooks/useLive.ts` does not exist: confirm the page still renders correctly with static coloring only, and that no console error/build error references a missing `useLive` module.
10. Resize the browser below the `md` breakpoint and confirm the zone `SimpleGrid` collapses to a single column without horizontal scroll or overlap.

## Out of Scope
- Drag-and-drop or editable layout — this is a read-only visual, not a floor-plan editor.
- Historical telemetry trends/charts on hover — would require a charting library, out of scope for the whole feature (PRT FR-017, Won't).
- Any new npm dependency (no diagramming/graph library) — layout is a plain `SimpleGrid`/`Wrap` composition.
- The tile "flash on telemetry update" behavior mentioned in FR-016 — nice-to-have polish, not required by this story's acceptance criteria; add only if trivial and time remains, otherwise skip without blocking.
- Persisting or animating layout position — tiles may reflow on re-render; no stable-position guarantee is required (unlike the Alerts page's live-merge requirement).

## Open Questions
None — the story's dependencies (`src/lib/status.ts`, `src/hooks/useAllMachines.ts`) are non-blocking per the story definition (build against their approved interfaces even if not yet merged), and `src/hooks/useLive.ts` is explicitly optional with a documented fallback (static coloring only) if absent.
