# Code Spec: Dashboard Page & Components

**Story ID:** story-5-dashboard-page
**Status:** Ready for implementation

## Summary
Replace the empty `src/pages/Dashboard.tsx` stub with the factory overview screen: a 4-tile KPI row (connection/machines/zones/uptime), an attention banner summarizing unacknowledged critical/warning alerts with a link to `/alerts`, and a ranked Zone Health grid (faulted-first) whose cards are clickable and navigate to `/alerts?zone={id}`. Three new leaf presentational components (`StatTile`, `AttentionBanner`, `ZoneHealthCard`) are created following `SampleCard.tsx`'s typed-props/`Card`/`Skeleton` pattern. This story only composes existing/contracted hooks — it defines no interfaces other stories depend on.

## Files to Create
- `src/components/StatTile.tsx` — single KPI stat card (label/value/optional status badge), with a loading-skeleton variant matching `SampleCard`'s shape.
- `src/components/AttentionBanner.tsx` — Chakra `Alert`(aliased `ChakraAlert`) banner showing unacknowledged critical/warning counts or an "All clear" state, linking to `/alerts`.
- `src/components/ZoneHealthCard.tsx` — clickable (`LinkBox`/`LinkOverlay`) card showing zone name, health badge, machine count, and open critical/warning alert counts; navigates to `/alerts?zone={zoneId}`.

## Files to Modify
- `src/pages/Dashboard.tsx` — replace the empty stub with the full page composition: KPI row (`StatTile` × 4) fed by `useFactoryStatus`; `AttentionBanner` fed by `useActiveAlerts()`; Zone Health `SimpleGrid` fed by `useZones()` + `useAllMachines()` + `useActiveAlerts()` (grouped client-side). Adds loading/error handling for each independent data source, matching FR-001/FR-004.

## Task Breakdown
| # | Task | Files Touched | Notes |
|---|------|----------------|-------|
| 1 | Build `StatTile` (value + label + optional skeleton + optional status badge) | `src/components/StatTile.tsx` | Pure presentational; mirrors `SampleCard`'s `Card`/`Skeleton` structure |
| 2 | Build `AttentionBanner` (counts + "All clear" branch + `RouterLink` to `/alerts`) | `src/components/AttentionBanner.tsx` | Takes pre-computed counts as props — does not call hooks itself, so it stays easily reusable/testable |
| 3 | Build `ZoneHealthCard` (`LinkBox`/`LinkOverlay` wrapping `RouterLink`) | `src/components/ZoneHealthCard.tsx` | Takes a single pre-assembled view-model prop, no hooks inside |
| 4 | Wire `useFactoryStatus` into the KPI row on `Dashboard.tsx`, with skeleton/error branches | `src/pages/Dashboard.tsx` | 4 `StatTile`s: Connected, Machines, Zones, Uptime |
| 5 | Wire `useAllMachines` for the machine-count KPI (cross-check against `useFactoryStatus.totalMachines`) | `src/pages/Dashboard.tsx` | Per notes: `totalMachines` from `useFactoryStatus` is the primary source for the KPI tile (FR-001); `useAllMachines` is available for a future FR-002 breakdown but not required by this story's ACs — see Open Questions |
| 6 | Compute unacknowledged critical/warning totals from one unfiltered `useActiveAlerts()` call, feed `AttentionBanner` | `src/pages/Dashboard.tsx` | `useMemo` over `alerts` |
| 7 | Build the zone→alert-count map from the SAME unfiltered `useActiveAlerts()` call, grouped by `zoneId` with `useMemo` (critical N+1 guard) | `src/pages/Dashboard.tsx` | MUST NOT call `useActiveAlerts({zone})` per card |
| 8 | Merge `useZones()` data with the per-zone alert-count map and `useAllMachines()`-derived machine counts (fallback to `zone.machineCount` field if `useAllMachines` errors) into `ZoneHealthCard` view-models; sort faulted > degraded > healthy, then critical desc, then warning desc, then name asc | `src/pages/Dashboard.tsx` | Sort function local to Dashboard or exported as a small helper — see Function Signatures |
| 9 | Render `SimpleGrid` of `ZoneHealthCard`s; render skeleton grid while `useZones`/`useActiveAlerts` loading; render inline error `ChakraAlert` if `useZones` or `useFactoryStatus` errors | `src/pages/Dashboard.tsx` | Independent loading/error states per FR-004 — a `useAllMachines` error must not blank the whole page (fall back gracefully, see below) |
| 10 | Manual verification pass against default + empty-alert scenarios | n/a | See Verification Steps |

## Function/Component Signatures

```tsx
// src/components/StatTile.tsx
import type { ReactNode } from "react";

export interface StatTileProps {
  label: string;
  value: string | number;
  /** Optional colorScheme override for the value/badge (e.g. "green" for Connected=Live, "red" for Disconnected). */
  colorScheme?: string;
  /** Optional small badge text shown next to the label (e.g. "Live" / "Disconnected"). */
  badge?: string;
  helpText?: ReactNode;
  isLoading?: boolean;
}

export function StatTile(props: StatTileProps): JSX.Element;
// Loading branch: Card > CardBody > Skeleton (label-width) + Skeleton (value-width), matching SampleCard's isLoading shape.
// Loaded branch: Card > CardBody > Stat > StatLabel (label [+ Badge if `badge` provided]) > StatNumber (value, colorScheme applied via Text/Badge color, not a Stat prop) [> StatHelpText if helpText provided].
```

```tsx
// src/components/AttentionBanner.tsx
export interface AttentionBannerProps {
  criticalCount: number;
  warningCount: number;
  /** True when there is nothing to show (criticalCount === 0 && warningCount === 0). */
  isClear: boolean;
  isLoading?: boolean;
  href?: string; // default "/alerts"
}

export function AttentionBanner(props: AttentionBannerProps): JSX.Element;
// isLoading: Skeleton height="60px" full-width banner placeholder.
// isClear === true: ChakraAlert status="success" — "All clear — no active critical or warning alerts."
// isClear === false: ChakraAlert status="warning" (or "error" if criticalCount > 0) —
//   text built as `${criticalCount} critical · ${warningCount} warning unacknowledged`
//   (omit a "0 critical"/"0 warning" clause only if that exact zero-count phrasing reads badly —
//   default: always render both clauses verbatim to match the AC's exact string "2 critical · 2 warning unacknowledged").
//   Wrapped in / includes a Chakra `Button`/`Link` `as={RouterLink}` `to={href}` reading "View alerts".
```

```tsx
// src/components/ZoneHealthCard.tsx
import type { Zone } from "../types";

export interface ZoneHealthCardViewModel {
  zoneId: string;
  zoneName: string;
  health: Zone["health"]; // "healthy" | "degraded" | "faulted" — trusted as-is, never recomputed
  machineCount: number;
  criticalCount: number; // open (unacknowledged) critical alerts in this zone
  warningCount: number;  // open (unacknowledged) warning alerts in this zone
}

export interface ZoneHealthCardProps {
  zone: ZoneHealthCardViewModel;
  isLoading?: boolean;
}

export function ZoneHealthCard(props: ZoneHealthCardProps): JSX.Element;
// Loading branch: Card > CardBody > Skeleton/SkeletonText placeholders (SampleCard shape).
// Loaded branch: LinkBox as={Card} > CardHeader (zone name + health Badge colorScheme={healthColor[health]}) >
//   CardBody (machine count line; critical/warning count Badges, colorScheme={severityColor.critical}/{severityColor.warning}) >
//   LinkOverlay as={RouterLink} to={`/alerts?zone=${zone.zoneId}`} (wraps the whole card as the click target per AC).
```

```tsx
// src/pages/Dashboard.tsx — key internal helpers (not exported; local to this file unless reuse emerges)

/** Sorts zone view-models faulted > degraded > healthy, then criticalCount desc, then warningCount desc, then zoneName asc. */
function sortZoneHealth(zones: ZoneHealthCardViewModel[]): ZoneHealthCardViewModel[];

/** Groups an already-fetched, unfiltered NormalizedAlert[] into a Map<zoneId, {critical: number; warning: number}> counting only unacknowledged critical/warning alerts. Built with useMemo([alerts]). */
function countOpenAlertsByZone(
  alerts: NormalizedAlert[]
): Map<string, { critical: number; warning: number }>;

export function Dashboard(): JSX.Element;
```

**Dashboard.tsx composition contract (for the implementer):**
```tsx
const { data: status, isLoading: statusLoading, isError: statusError } = useFactoryStatus();
const { data: zones, isLoading: zonesLoading, isError: zonesError } = useZones();
const { machines, isLoading: machinesLoading, isError: machinesError } = useAllMachines(); // used only as a fallback/cross-check; zone.machineCount is primary
const { alerts, isLoading: alertsLoading, isError: alertsError } = useActiveAlerts(); // UNFILTERED — single call, see AC + 1c-operations.md

const zoneAlertCounts = useMemo(() => countOpenAlertsByZone(alerts ?? []), [alerts]);
const attentionCounts = useMemo(() => {
  let critical = 0, warning = 0;
  for (const a of alerts ?? []) {
    if (a.acknowledged) continue;
    if (a.severity === "critical") critical++;
    else if (a.severity === "warning") warning++;
  }
  return { critical, warning };
}, [alerts]);

const zoneViewModels = useMemo(() => {
  if (!zones) return [];
  const withCounts = zones.map((z) => ({
    zoneId: z.id,
    zoneName: z.name,
    health: z.health,               // trusted as-is
    machineCount: z.machineCount,   // primary source; NOT recomputed from useAllMachines
    criticalCount: zoneAlertCounts.get(z.id)?.critical ?? 0,
    warningCount: zoneAlertCounts.get(z.id)?.warning ?? 0,
  }));
  return sortZoneHealth(withCounts);
}, [zones, zoneAlertCounts]);
```

## Test Case Table
| Case | Input | Expected Output | Type (happy/edge/error) |
|------|-------|------------------|--------------------------|
| Default KPIs | default mock: `useFactoryStatus` → `{connected:true, totalMachines:14, zoneCount:4, uptimeHours:127.4}` | 4 `StatTile`s render: Connected="Live" (green badge), Machines=14, Zones=4, Uptime="127.4h" | happy |
| Disconnected KPI | `useFactoryStatus` → `connected:false` | Connected tile shows "Disconnected" with red/warning styling | edge |
| Loading state | `useFactoryStatus`/`useZones`/`useActiveAlerts` all `isLoading:true` on first render | KPI row shows 4 `StatTile` skeletons; banner shows a skeleton; zone grid shows `ZoneHealthCard` skeletons — no blank page | edge |
| Status error | `useFactoryStatus().isError === true` | Inline `ChakraAlert status="error"` replaces the KPI row (not a crash, not a blank row) | error |
| Zones error | `useZones().isError === true` | Inline error message replaces the Zone Health section only; KPI row and banner still render if their own data succeeded | error |
| `useAllMachines` error | `useAllMachines().isError === true`, `useZones`/`useFactoryStatus` succeed | Page does NOT blank out — Dashboard renders using `zone.machineCount`/`status.totalMachines` (which don't depend on `useAllMachines`); no visible regression, since this story doesn't require a machine-status breakdown | edge |
| Attention banner — alerts present | default mock: alt-001 (critical, packaging, unacked), alt-002 (critical, welding, unacked), alt-003 (warning, welding, unacked), alt-004 (warning, welding, unacked), alt-005 (info, acked), alt-006 (info, unacked) | Banner text: "2 critical · 2 warning unacknowledged"; links to `/alerts` | happy |
| Attention banner — all clear | all alerts acknowledged or empty array (`window.__setAlertScenario("empty")`) | Banner renders "All clear" success state, not hidden with a blank gap and not showing "0 critical · 0 warning" | edge |
| Zone Health ordering | zones: packaging=faulted, welding=degraded, assembly=healthy, painting=healthy | Grid order: Packaging, Welding, then Assembly/Painting (both healthy, 0 critical/warning — tiebreak by name asc: Assembly before Painting) | happy |
| Zone Health counts | packaging has 1 unacked critical (alt-001); welding has 1 unacked critical (alt-002) + 2 unacked warning (alt-003, alt-004) | Packaging card shows machineCount=4, critical=1, warning=0; Welding card shows machineCount=3, critical=1, warning=2 | happy |
| Zone card navigation | user clicks the Packaging `ZoneHealthCard` | Router navigates to `/alerts?zone=packaging` | happy |
| N+1 guard | any state | Exactly one `useActiveAlerts()` call exists in `Dashboard.tsx` (grep-verifiable); zero calls of the form `useActiveAlerts({ zone: ... })` inside a `.map()` over zones | happy (static/code-review check) |
| Malformed alert defended | `alt-006` (zoneId "assembly" but raw zoneName "Welding Bay") flows through `useActiveAlerts` | Because grouping counts by `zoneId` (not the raw `zoneName` field), alt-006's unacked info-severity does not affect critical/warning counts either way (info isn't counted) — counts remain correct regardless of the zoneName bug | edge |
| Stress scenario | `window.__setAlertScenario("stress")` (50 alerts) | Banner shows "10 critical · 21 warning unacknowledged" (per the fixture's stated composition); zone cards' counts sum correctly across the 4 zones without performance jank | edge |

## Verification Steps (manual, since no test runner exists)
1. `npm run build` — must pass with zero TypeScript errors before any manual check (confirms all three consumed hooks' contracts are actually met once Stories 1/2/4 land).
2. `npm run dev`, open `http://localhost:5173/`. Confirm the 4 KPI tiles read Connected="Live", Machines=14, Zones=4, Uptime="127.4h".
3. Confirm the attention banner reads "2 critical · 2 warning unacknowledged" and clicking it (or its "View alerts" action) navigates to `/alerts`.
4. Confirm the Zone Health grid order is Packaging, Welding, Assembly, Painting (or Painting, Assembly — same healthy tier) and that Packaging/Welding show the counts in the Test Case Table above.
5. Click the Packaging zone card; confirm the URL bar shows `/alerts?zone=packaging`.
6. In the browser console, run `window.__setAlertScenario("empty")`, reload `/`; confirm the banner shows "All clear" and zone cards show 0/0 critical/warning without errors.
7. Run `window.__setAlertScenario("stress")`, reload `/`; confirm the banner and zone cards update to the 50-alert counts without visible lag, and no console errors.
8. Throttle network (DevTools) or add a temporary artificial delay to confirm skeletons render on first load instead of a blank page, for both the KPI row and the Zone Health grid.
9. Temporarily force `useFactoryStatus` to error (e.g. rename the endpoint in a scratch edit, or use MSW override) to confirm the inline error message appears instead of a crash; revert the temporary change afterward.
10. In React DevTools or by code inspection, confirm `Dashboard.tsx` calls `useActiveAlerts()` exactly once (no per-zone-card hook calls) — this is the CRITICAL N+1 guard called out in the acceptance criteria.

## Out of Scope
- The Alerts page itself (Story 6) — only the banner's and zone cards' link targets (`/alerts`, `/alerts?zone={id}`) matter here.
- The `LiveIndicator` component / "last update Ns ago" ticker (FR-014, tied to Story 3's `useLive()`) — Should-priority, may be added later using `useLive().lastMessageAt` if time remains; NOT part of this story's Definition of Done.
- A machine-status breakdown tile (running/idle/error/maintenance counts, FR-002) — `useAllMachines` is wired in defensively (so its error state doesn't blank the page) but this story's acceptance criteria only require the 4 KPI tiles listed; a full breakdown tile is a natural follow-up, not required here.
- Any modification to `src/lib/status.ts`, `src/hooks/useAllMachines.ts`, or `src/hooks/useActiveAlerts.ts` — this story only consumes their contracted interfaces.
- Automated tests — none exist in this repo; verification is manual per above.

## Open Questions
- **(Non-blocking)** `src/lib/status.ts`, `src/hooks/useAllMachines.ts`, and `src/hooks/useActiveAlerts.ts` do not exist on disk yet (confirmed by directory listing at spec-writing time: only `useAcknowledgeAlert.ts`, `useAlerts.ts`, `useFactoryStatus.ts`, `useFactoryWebSocket.ts`, `useZones.ts` exist in `src/hooks/`, and `src/lib/` does not exist). Implementation of this story must wait until Stories 1, 2, and 4 are merged. This spec is written strictly against their already-approved contracts in `design/1b-contracts.md` Part 3 and `stories/user_stories.md` Story 1/2/4, so no design work is blocked — only the actual coding start is gated.
- **(Non-blocking)** The two healthy-tier zones (Assembly, Painting) have no explicit tiebreak rule in the PRT (FR-011 says "sorted faulted > degraded > healthy, then by critical count descending") — when critical counts are also tied (both 0 in the default mock), this spec defines a secondary tiebreak of warning count descending, then zone name ascending, for deterministic rendering. Confirm this matches panel/PM expectations if asked, but it does not block implementation.
- **(Non-blocking)** Whether `AttentionBanner` should render "0 critical · 0 warning unacknowledged" or suppress a zero clause is ambiguous when only one severity is zero (e.g. 2 critical, 0 warning) — this spec defaults to always showing both clauses verbatim (matching the AC's exact-string example), which naturally degrades to the literal zero-count phrasing rather than a special case; can be revisited post-implementation if it reads awkwardly.
