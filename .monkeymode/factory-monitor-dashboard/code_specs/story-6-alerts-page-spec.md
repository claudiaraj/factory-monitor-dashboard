# Code Spec: Alerts Page & Components (built for high alert volume)

**Story ID:** story-6-alerts-page
**Status:** Ready for implementation

## Summary
Replace the empty `src/pages/Alerts.tsx` stub with a full triage page: severity summary chips, a zone/show-acknowledged/view filter bar, a default machine-grouped view (14 rows at 50-alert stress volume) with a flat-table fallback, single and bulk acknowledge with toasts, and a collapsed info-severity section — all filtered client-side against the single `useActiveAlerts()` seam so the same page handles 6 alerts and 50+ without falling apart (ADR-002). This story consumes `src/lib/status.ts`, `src/lib/alerts.ts`, and `src/hooks/useActiveAlerts.ts` as fixed, already-approved contracts that may not exist on disk yet; implementation cannot start until those land, but every signature below is written against their approved shape so no rework is expected once they do.

## Files to Create
- `src/components/SeverityChips.tsx` — clickable severity summary row (Critical N · Warning N · Info N), single-select toggle filter.
- `src/components/AlertsFilterBar.tsx` — zone `Select`, show-acknowledged `Switch`, grouped/flat `ButtonGroup` toggle.
- `src/components/MachineAlertGroupCard.tsx` — one collapsible card per `MachineAlertGroup`, with per-group "Acknowledge all" and a nested collapsed info-alert section.
- `src/components/AlertsTable.tsx` — flat `Table` view of alerts with a collapsed info-alert summary row.

## Files to Modify
- `src/pages/Alerts.tsx` — replace the empty `Container` stub with the full page composition: filter state (severity, zone via `useSearchParams`, show-acknowledged, view), `useActiveAlerts` wiring, derived severity counts / filtered / grouped lists (`useMemo`), single + bulk acknowledge handlers with `useToast`, loading/error/empty states, and an inline (not separately filed) `AlertsSkeleton` and `EmptyState`.

## Task Breakdown
| # | Task | Files Touched | Notes |
|---|------|----------------|-------|
| 1 | Flat `AlertsTable` + single-alert acknowledge, wired into `Alerts.tsx` end to end | `src/components/AlertsTable.tsx`, `src/pages/Alerts.tsx` | Get the basic page working first: `useActiveAlerts({ zone })`, render all rows, one Acknowledge button per row, toast on settle. No grouping, no chips yet — this step alone must satisfy the "default 6 alerts render with all fields" AC. |
| 2 | `SeverityChips` (clickable severity summary) | `src/components/SeverityChips.tsx`, `src/pages/Alerts.tsx` | Counts computed from the zone-filtered-but-severity-unfiltered alert set (see Implementation Details) so counts read correctly even while a severity is already active. |
| 3 | Machine grouping (`MachineAlertGroupCard`, `groupByMachine`) as the DEFAULT view, with a toggle back to the flat table | `src/components/MachineAlertGroupCard.tsx`, `src/components/AlertsFilterBar.tsx` (view toggle), `src/pages/Alerts.tsx` | `view` state defaults to `"grouped"`; toggling to `"flat"` must not reset `severityFilter`/`zone`/`showAcknowledged`. |
| 4 | Bulk acknowledge (per-group "Acknowledge all", plus "Acknowledge all shown") | `src/components/MachineAlertGroupCard.tsx`, `src/pages/Alerts.tsx` | Per-group uses `bulkAcknowledge(group's unacked ids)` directly (no confirm — bounded, visible blast radius). "Acknowledge all shown" needs a lightweight confirm step (Chakra `AlertDialog` via `useDisclosure`) since it can affect 30+ rows. |
| 5 | Collapse info-severity alerts by default within groups/sections | `src/components/MachineAlertGroupCard.tsx`, `src/components/AlertsTable.tsx` | Per PRT FR-022: critical/warning always visible; info alerts nested under a "N info alerts, show" toggle, default collapsed. Implemented via local `useState`, not `Collapse` inside `<tr>` (see Implementation Details — `Collapse` around table rows breaks valid markup/animation). |
| 6 | Text search (Could — only if time remains) | `src/pages/Alerts.tsx`, `src/components/AlertsFilterBar.tsx` | Do not block on this. If added: an optional `searchQuery`/`onSearchChange` prop pair on `AlertsFilterBar`, filtering `machineName`/`message`/`zoneName` case-insensitive substring, combined with existing filters via AND, applied after severity filter and before the ack-visibility filter. |

## Function/Component Signatures

```ts
// src/components/SeverityChips.tsx
import type { Alert } from "../types";

export interface SeverityCounts {
  critical: number;
  warning: number;
  info: number;
}

export interface SeverityChipsProps {
  counts: SeverityCounts;
  active: Alert["severity"] | null;   // null = no severity filter active
  onToggle: (severity: Alert["severity"]) => void; // parent clears the filter if the already-active severity is clicked again
}

export function SeverityChips({ counts, active, onToggle }: SeverityChipsProps): JSX.Element;
```

```ts
// src/components/AlertsFilterBar.tsx
import type { Zone } from "../types";

export interface AlertsFilterBarProps {
  zones: Zone[];
  zone: string;                                  // "" = all zones
  onZoneChange: (zoneId: string) => void;
  showAcknowledged: boolean;
  onShowAcknowledgedChange: (value: boolean) => void;
  hiddenAcknowledgedCount: number;                // FR-009: count of acked alerts currently hidden by the toggle
  view: "grouped" | "flat";
  onViewChange: (view: "grouped" | "flat") => void;
  // Could-priority, optional — wire up only if Task 6 is reached; omit entirely otherwise.
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export function AlertsFilterBar(props: AlertsFilterBarProps): JSX.Element;
```

```ts
// src/components/MachineAlertGroupCard.tsx
import type { MachineAlertGroup } from "../lib/alerts";

export interface MachineAlertGroupCardProps {
  group: MachineAlertGroup;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: (ids: string[]) => void;      // parent owns the bulkAcknowledge call + summary toast
  pendingAckId: string | null;                    // id of the single-row ack currently in flight, or null
  bulkAckPending: boolean;                        // true while THIS group's "Acknowledge all" is in flight
  defaultExpanded?: boolean;                      // default false — group detail starts collapsed
}

export function MachineAlertGroupCard(props: MachineAlertGroupCardProps): JSX.Element;
```

```ts
// src/components/AlertsTable.tsx
import type { NormalizedAlert } from "../lib/alerts";

export interface AlertsTableProps {
  alerts: NormalizedAlert[];        // fully filtered (zone/severity/search/show-acked) and sorted; may include info-severity alerts
  onAcknowledge: (id: string) => void;
  pendingAckId: string | null;
  collapseInfo?: boolean;           // default true
}

export function AlertsTable(props: AlertsTableProps): JSX.Element;
```

```tsx
// src/pages/Alerts.tsx — full composition (abbreviated; inline helpers AlertsSkeleton/EmptyState defined
// in this same file since they are not in the story's "files to create" list)
import { useMemo, useRef, useState } from "react";
import {
  Alert as ChakraAlert, AlertIcon, AlertDialog, AlertDialogBody, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Button, Container, Heading,
  Skeleton, SkeletonText, Text, VStack, useDisclosure, useToast,
} from "@chakra-ui/react";
import { useSearchParams } from "react-router-dom";
import { groupByMachine } from "../lib/alerts";
import { useActiveAlerts } from "../hooks/useActiveAlerts";
import { useZones } from "../hooks/useZones";
import { SeverityChips, type SeverityCounts } from "../components/SeverityChips";
import { AlertsFilterBar } from "../components/AlertsFilterBar";
import { MachineAlertGroupCard } from "../components/MachineAlertGroupCard";
import { AlertsTable } from "../components/AlertsTable";
import type { Alert } from "../types";

export function Alerts(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const zoneParam = searchParams.get("zone") ?? "";

  const [severityFilter, setSeverityFilter] = useState<Alert["severity"] | null>(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [view, setView] = useState<"grouped" | "flat">("grouped");
  const [pendingAckId, setPendingAckId] = useState<string | null>(null);
  const [bulkAckGroupId, setBulkAckGroupId] = useState<string | null>(null);
  const [bulkAckShownPending, setBulkAckShownPending] = useState(false);

  const toast = useToast();
  const { data: zones } = useZones();
  const { alerts: zoneAlerts, isLoading, isError, bulkAcknowledge } =
    useActiveAlerts({ zone: zoneParam || undefined });
  // Single-row acknowledge deliberately calls bulkAcknowledge([id]) rather than the hook's
  // fire-and-forget `acknowledge(id)`: bulkAcknowledge is the only primitive in the Story 4
  // contract that returns a real per-call {succeeded, failed} result, so it's reused here to
  // get an accurate success/error toast instead of guessing from the global `acknowledgePending`
  // boolean. No change to Story 4's approved contract was needed.

  // Chip counts: zone-filtered, but NOT severity/ack/search-filtered — so clicking a chip is meaningful.
  const severityCounts: SeverityCounts = useMemo(() => ({
    critical: zoneAlerts.filter((a) => a.severity === "critical").length,
    warning: zoneAlerts.filter((a) => a.severity === "warning").length,
    info: zoneAlerts.filter((a) => a.severity === "info").length,
  }), [zoneAlerts]);

  const severityFiltered = useMemo(
    () => (severityFilter ? zoneAlerts.filter((a) => a.severity === severityFilter) : zoneAlerts),
    [zoneAlerts, severityFilter]
  );

  const hiddenAcknowledgedCount = useMemo(
    () => severityFiltered.filter((a) => a.acknowledged).length,
    [severityFiltered]
  );

  const visible = useMemo(
    () => (showAcknowledged ? severityFiltered : severityFiltered.filter((a) => !a.acknowledged)),
    [severityFiltered, showAcknowledged]
  );

  const groups = useMemo(() => groupByMachine(visible), [visible]);

  function handleZoneChange(zoneId: string) {
    const next = new URLSearchParams(searchParams);
    if (zoneId) next.set("zone", zoneId); else next.delete("zone");
    setSearchParams(next);
  }

  function handleToggleSeverity(sev: Alert["severity"]) {
    setSeverityFilter((prev) => (prev === sev ? null : sev));
  }

  async function handleAcknowledge(id: string) {
    setPendingAckId(id);
    const { succeeded } = await bulkAcknowledge([id]);
    setPendingAckId(null);
    toast(
      succeeded.includes(id)
        ? { title: "Alert acknowledged", status: "success", duration: 3000 }
        : { title: "Couldn't acknowledge alert", status: "error", duration: 4000 }
    );
  }

  async function runBulkAck(ids: string[], onDone: () => void) {
    const { succeeded, failed } = await bulkAcknowledge(ids);
    onDone();
    toast({
      title: failed.length === 0
        ? `${succeeded.length} of ${ids.length} acknowledged`
        : `${succeeded.length} of ${ids.length} acknowledged, ${failed.length} failed`,
      status: failed.length === 0 ? "success" : "warning",
      duration: 4000,
    });
  }

  function handleAcknowledgeGroup(machineId: string, ids: string[]) {
    setBulkAckGroupId(machineId);
    void runBulkAck(ids, () => setBulkAckGroupId(null));
  }

  const confirm = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  function handleAcknowledgeAllShown() {
    const ids = visible.filter((a) => !a.acknowledged).map((a) => a.id);
    confirm.onClose();
    setBulkAckShownPending(true);
    void runBulkAck(ids, () => setBulkAckShownPending(false));
  }

  // ...render: Heading, unacknowledged count, SeverityChips, AlertsFilterBar,
  // "Acknowledge all shown" button (opens confirm.onOpen(), disabled if bulkAckShownPending
  // or no unacknowledged alerts in `visible`), AlertDialog confirm, then:
  //   isLoading -> <AlertsSkeleton />
  //   isError   -> <ChakraAlert status="error"><AlertIcon />Couldn't load alerts.</ChakraAlert>
  //   visible.length === 0 -> <EmptyState hasAnyAlerts={zoneAlerts.length > 0} />
  //   else view === "grouped" -> groups.map(g => <MachineAlertGroupCard ... />)
  //          view === "flat"  -> <AlertsTable alerts={visible} ... />
}
```

## Test Case Table
| Case | Input | Expected Output | Type (happy/edge/error) |
|------|-------|------------------|--------------------------|
| Default 6 alerts render | Default mock, `/alerts` loads | All 6 alerts visible (grouped view collapses to however many distinct machines the default 6 span); each shows severity badge, machine, zone, message, relative time, Acknowledge button | happy |
| Combined severity + zone filter | Click "Critical" chip, select zone=Welding | `visible` narrows to only critical Welding alerts; updates immediately, no submit; live-arrived alerts matching the filter are included since filtering runs on `useActiveAlerts`'s merged output | happy |
| Acknowledge a REST alert | Click Acknowledge on `welder-02`'s critical alert (`alt-002`) | Row shows a pending state, then `bulkAcknowledge([id])` resolves with `alt-002` in `succeeded`, a success toast fires, and the row shows "Acknowledged" with no more Acknowledge button | happy |
| Acknowledge a live alert | Click Acknowledge on a `ws-alt-*` row | No REST call is made (`acknowledge` routes to `acknowledgeLocal`); toast fires immediately since the local ack is synchronous | happy |
| Stress scenario grouping | `window.__setAlertScenario("stress")`, reload `/alerts` | Default grouped view shows exactly 14 `MachineAlertGroupCard`s; `SeverityChips` reads Critical 10 · Warning 21 · Info 19 | happy |
| Critical chip narrows groups | Stress scenario, click "Critical" chip | Only groups containing >=1 critical alert remain (achieved by filtering the alert array to critical-only *before* `groupByMachine`, so surviving groups' alerts are all critical) | happy |
| Bulk-ack a group | Stress scenario, expand `press-01`, click "Acknowledge all" | All of `press-01`'s currently-unacknowledged alerts (2, given the default show-acknowledged=false view: `alt-001`, `alt-014`) become acknowledged; exactly ONE toast reads "2 of 2 acknowledged" | happy |
| Bulk-ack partial failure | `bulkAcknowledge` resolves with `{succeeded: [...], failed: ["alt-x"]}` (e.g. a since-removed id) | Toast reads "N of M acknowledged, 1 failed" with `status="warning"`; no thrown/unhandled rejection; group still shows the failed alert as unacknowledged | error |
| Acknowledge all shown | Click "Acknowledge all shown", confirm in the `AlertDialog` | All unacknowledged alerts in the current filtered `visible` set (across every group/row, not just expanded ones) are submitted via one `bulkAcknowledge` call; one summary toast | happy |
| Acknowledge all shown — cancel | Click "Acknowledge all shown", then Cancel in the dialog | No mutation call is made; dialog closes; nothing changes | edge |
| Empty scenario | `window.__setAlertScenario("empty")`, reload `/alerts` | Clear empty-state message renders (e.g. "No active problems"); no error; severity chips read 0/0/0 or are hidden; no console errors | edge |
| Flat/grouped toggle preserves filters | Set severity=Warning, zone=Assembly, then click the Flat toggle | `AlertsTable` shows only Warning+Assembly alerts — the same filtered set the grouped view was showing, not a reset | edge |
| Info-alert collapse (grouped) | A group whose alerts include 1+ info-severity entries, first render | Info alerts hidden by default under "N info alerts, show"; critical/warning in that group always visible; clicking the toggle reveals them in place | happy |
| Info-alert collapse (flat) | Flat view, `visible` includes info-severity alerts | Non-info rows render normally; a single "N info alerts, show" row appears once; expanding reveals the info rows without breaking table markup | happy |
| `alt-004` machine name fallback | Default mock, locate `alt-004` | Shows machine name resolved via `normalizeAlert`'s `machineName ?? machine_name ?? machineId` (never `"undefined"`/blank) — table/card reads this from `NormalizedAlert.machineName`, never the raw `Alert` field | edge |
| `alt-005` invalid timestamp | Default mock, locate `alt-005` | Displays "Unknown time" (via `formatRelativeTime`); sorts last within its severity/ack group (via `useActiveAlerts`'s already-sorted output — this page never re-sorts) | edge |
| `alt-006` zone resolution | Default mock, locate `alt-006` | Displayed zone name is the one resolved from `zoneId` via `zoneById` (per `NormalizedAlert.zoneName`), never the mismatched raw field | edge |
| `?zone=` URL sync on load | Navigate directly to `/alerts?zone=packaging` | Zone `Select` shows Packaging pre-selected; list is pre-filtered to Packaging alerts on first render, no flash of unfiltered content | happy |
| `?zone=` URL sync on change | Change the zone `Select` to Welding | URL updates to `/alerts?zone=welding` (via `setSearchParams`), browser back button returns to the prior zone filter | happy |
| Zone cleared | Select "All zones" in the filter bar | `?zone=` param is removed from the URL (not set to `""`); all zones' alerts shown | edge |
| Loading state | First render, before `useActiveAlerts`/`useZones` resolve | `AlertsSkeleton` (Skeleton/SkeletonText matching the grouped-card shape, per `SampleCard.tsx`'s pattern) renders, not a blank page | edge |
| Error state | `useActiveAlerts().isError === true` (simulated REST failure) | Inline `ChakraAlert status="error"` renders; no crash | error |
| Show-acknowledged toggle | Default mock has 2 acknowledged alerts (in stress data); toggle "Show acknowledged" on | Previously-hidden acknowledged alerts appear in both flat and grouped views; `hiddenAcknowledgedCount` badge/text updates to 0 | happy |

## Verification Steps (manual, since no test runner exists)
1. `npm run build` — must complete with zero TypeScript errors; this is the only automated gate and will catch any prop/interface mismatch against `useActiveAlerts`, `groupByMachine`, `formatRelativeTime`, `severityColor` once those land.
2. `npm run dev`, open `/alerts` with the default mock (6 alerts): confirm all 6 render (across their grouped machine cards) with severity badge, machine, zone, message, relative time, Acknowledge button; confirm `alt-004`'s machine name, `alt-005`'s "Unknown time" (sorted last), and `alt-006`'s resolved zone name are all correct per the Test Case Table above.
3. Filter severity=Critical + zone=Welding; confirm the list narrows immediately (no submit button). Acknowledge `welder-02`'s critical alert; confirm a success toast and the row/card updates to "Acknowledged".
4. In the browser console: `window.__setAlertScenario("stress")`, reload `/alerts`. Confirm exactly 14 `MachineAlertGroupCard`s render by default and the chip row reads "Critical 10 · Warning 21 · Info 19". Click the Critical chip; confirm only groups with a critical alert remain.
5. Expand `press-01`'s group, click "Acknowledge all"; confirm one summary toast and that group's unacknowledged alerts flip to acknowledged.
6. Click "Acknowledge all shown"; confirm the confirmation dialog appears, Cancel does nothing, and confirming fires exactly one summary toast covering every unacknowledged alert currently visible (respecting active filters).
7. Toggle the Flat/Grouped `ButtonGroup` with filters still active (severity + zone set); confirm the flat table shows the same filtered set, not a reset to "all alerts".
8. Confirm info-severity alerts are collapsed by default in both views on first load, and that "N info alerts, show" reveals them without a layout break in the table.
9. In the browser console: `window.__setAlertScenario("empty")`, reload `/alerts`. Confirm a clear empty-state message, no console errors, no infinite spinner.
10. Restore the default dataset: `window.__setAlertScenario("default")` before considering the story done, so later manual checks (Dashboard, other stories) aren't run against leftover stress/empty state.
11. Directly load `/alerts?zone=packaging`; confirm the zone `Select` is pre-selected to Packaging and the list is pre-filtered on first paint (no flash of all-zone content).
12. Leave `/alerts` open for ~45s (tab focused) if Story 3/4 have landed with live data working; confirm a new alert appears without refresh and, if critical, toasts immediately, and that acknowledging a `ws-alt-*` id never produces a console 404. This check is optional/best-effort per the Out of Scope note on FR-023 below — do not block the story on it.

## Out of Scope
- The "N new alerts" stable-ordering pill (FR-023) for live updates — tied to the live-data story; add only if Story 4's live merge is visibly working and time remains. Not blocking this story's Definition of Done.
- Text search (FR-024) — Could priority; add last, only if time remains (Task 6 above).
- Persisting acknowledgements across a page reload — the mock's in-memory store resets on reload by design (PRT Q2); not a defect to fix here.
- Fixing any of the mock's known data defects (`alt-004`/`alt-005`/`alt-006`, the WebSocket `zoneName` bug) at the source — this story only ever reads through `NormalizedAlert` fields, never raw `Alert` fields, per the design's input-validation boundary.
- A dedicated `/api/machines` (all) endpoint, live telemetry, or Topology page concerns — out of scope for this story entirely.

## Open Questions
- **Non-blocking (expected upstream dependency gap):** `src/lib/status.ts`, `src/lib/alerts.ts`, and `src/hooks/useActiveAlerts.ts` do not exist on disk yet (confirmed: `src/lib/` doesn't exist; `src/hooks/` has no `useActiveAlerts.ts`). This spec is written against their already-approved contracts from `design/1b-contracts.md` / `stories/user_stories.md` Story 1 & Story 4. Implementation of this story must wait until those land; no rework to this spec is expected once they do, since every signature above matches the approved shape exactly.
- **Resolved during orchestrator review (was a contract-friction concern in the original draft):** `useActiveAlerts().acknowledge(id: string): void` is fire-and-forget with no per-call success/error signal, only a global `acknowledgePending: boolean`. Rather than guessing success from a "pending → settled" heuristic, this spec's single-row `handleAcknowledge` calls `bulkAcknowledge([id])` instead — the same primitive the per-group and "acknowledge all shown" actions already use — which returns a real `{succeeded, failed}` per call. This required no change to Story 4's approved contract. `acknowledge(id)` itself is left unused by this page (it remains part of the hook's public contract for any future caller that genuinely wants fire-and-forget semantics).
- **Non-blocking (implementation note, not a question):** `Collapse` (Chakra) cannot legally wrap a `<tr>` for the flat table's info-alert section without breaking table semantics/animation; `AlertsTable`'s info collapse is implemented via plain conditional rendering (`useState` + conditional `.map`), while `MachineAlertGroupCard`'s group-body and nested info-section collapses (non-table `Box`/`VStack` content) do use Chakra's `Collapse` as PRT's component inventory specifies. No open question — just documented so the implementer doesn't try to force `Collapse` into the table.
