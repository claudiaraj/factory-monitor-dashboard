# Code Spec: Shared Status & Alert Normalization Utilities

**Story ID:** story-1-status-alert-utilities
**Status:** Ready for implementation

## Summary
This story creates two pure, dependency-free TypeScript modules — `src/lib/status.ts` (three plain status→color lookup maps) and `src/lib/alerts.ts` (alert normalization, dedup, sort, and grouping) — that every other story in this feature imports instead of re-implementing. The key design decisions are: (1) a single internal timestamp-validity helper shared by `normalizeAlert` and `formatRelativeTime` so the "pre-2000 = invalid" rule is defined in exactly one place; (2) `dedupeById` is first-occurrence-wins, which combined with callers concatenating `[...restAlerts, ...liveAlerts]` means REST data (the more authoritative source per ADR-001) naturally wins any id collision; (3) `groupByMachine` assumes its input has already been through `sortAlerts` and preserves that relative order within each group rather than re-sorting alerts itself, only sorting the *groups*.

## Files to Create
- `src/lib/status.ts` — three `Record<..., string>` status→color maps (severity, zone health, machine status), no logic, no imports beyond `../types`.
- `src/lib/alerts.ts` — `normalizeAlert`, `dedupeById`, `sortAlerts`, `groupByMachine`, `formatRelativeTime`, plus the `NormalizedAlert` and `MachineAlertGroup` interfaces and small internal (non-exported) helpers.

## Files to Modify
None. This story only creates new files under `src/lib/`.

## Task Breakdown
| # | Task | Files Touched | Notes |
|---|------|----------------|-------|
| 1 | Create `src/lib/status.ts` with the three color maps | `src/lib/status.ts` | Import `Alert`, `Zone`, `Machine` types only from `../types`; no React import |
| 2 | Create internal timestamp helper in `src/lib/alerts.ts` | `src/lib/alerts.ts` | `parseValidTimestampMs(iso: string): number \| null`; year-2000 cutoff constant |
| 3 | Implement `NormalizedAlert` interface + `normalizeAlert` | `src/lib/alerts.ts` | Handles `alt-004` (`machine_name`), `alt-005` (invalid timestamp), `alt-006` (zone mismatch) |
| 4 | Implement `dedupeById` | `src/lib/alerts.ts` | First-occurrence-wins via `Map` |
| 5 | Implement `sortAlerts` | `src/lib/alerts.ts` | 4-key comparator: ack status → severity rank → timestamp validity → recency |
| 6 | Implement `MachineAlertGroup` interface + `groupByMachine` | `src/lib/alerts.ts` | Groups preserve input order; groups themselves sorted worst-severity-first then most-recent-first |
| 7 | Implement `formatRelativeTime` | `src/lib/alerts.ts` | Reuses the same helper from task 2 for consistency with `timestampValid` |
| 8 | Manual verification against real fixtures | n/a (temp script, not committed) | See Verification Steps |

## Function/Component Signatures

### `src/lib/status.ts`

```ts
import type { Alert, Zone, Machine } from "../types";

/**
 * Severity → Chakra colorScheme name. Used by any badge/chip rendering an
 * Alert's severity (AlertsTable, SeverityChips, AttentionBanner, etc).
 * Matches the SampleCard.tsx pattern: a plain object, not a function.
 */
export const severityColor: Record<Alert["severity"], string> = {
  critical: "red",
  warning: "orange",
  info: "blue",
};

/**
 * Zone health → Chakra colorScheme name. Zone.health is trusted as-is
 * (PRT Q1) — this map only controls color, it never recomputes health.
 */
export const healthColor: Record<Zone["health"], string> = {
  healthy: "green",
  degraded: "orange",
  faulted: "red",
};

/**
 * Machine status → Chakra colorScheme name. Used by Topology tiles and any
 * machine-status badge.
 */
export const machineStatusColor: Record<Machine["status"], string> = {
  running: "green",
  idle: "gray",
  error: "red",
  maintenance: "purple",
};
```

**Why `Record<T, string>` object literals and not a function:** TypeScript enforces exhaustiveness on a `Record` mapped from a union type — if `Machine["status"]` ever gains a new member and this map isn't updated, `tsc -b` fails at build time (the only automated gate this repo has, per `design/1c-operations.md`). This is strictly better than a function with a fallback/default color, which would silently swallow an unmapped new status.

### `src/lib/alerts.ts`

```ts
import type { Alert, Zone } from "../types";

// ---- internal (not exported) ----

/** Alerts dated before this are treated as garbage/sentinel data (e.g. alt-005's
 * "1969-12-31T23:59:59Z" — one second before the Unix epoch, clearly not a real
 * factory-floor timestamp). 2000-01-01T00:00:00.000Z, chosen per the story's
 * acceptance criteria and design docs ("pre-2000 timestamps" are invalid). */
const MIN_VALID_TIMESTAMP_MS = 946684800000; // Date.parse("2000-01-01T00:00:00.000Z")

/**
 * Single shared parse used by both normalizeAlert (timestampValid) and
 * formatRelativeTime, so the "what counts as a valid timestamp" rule is
 * defined exactly once. Returns null for anything Date.parse can't handle
 * (NaN) or anything before the year-2000 cutoff; otherwise the epoch ms.
 */
function parseValidTimestampMs(iso: string): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || ms < MIN_VALID_TIMESTAMP_MS) return null;
  return ms;
}

/** Lower rank = more severe. Used by both sortAlerts and groupByMachine's
 * worstSeverity computation so the two can never disagree about ordering. */
const SEVERITY_RANK: Record<Alert["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ---- exported ----

export interface NormalizedAlert extends Alert {
  /** ALWAYS resolved via zoneById.get(raw.zoneId)?.name — never the raw
   * `zoneName` field. Fixes alt-006 (zoneId="assembly" but zoneName="Welding
   * Bay") and the WS alert payload bug (zoneName is actually a copy of
   * zoneId). Falls back to "Unknown Zone" only if the id isn't in the map
   * at all (defensive; not expected to happen with the provided fixtures). */
  zoneName: string;
  /** machineName ?? machine_name ?? machineId, in that priority order.
   * Fixes alt-004, which has `machine_name` (snake_case) instead of
   * `machineName`. Falling back to machineId as a last resort means the UI
   * always has *something* human-legible to render, never `undefined`. */
  machineName: string;
  /** false when the timestamp is unparseable or dated before 2000-01-01.
   * Drives both display ("Unknown time" in formatRelativeTime) and sort
   * order (invalid timestamps sort last within their ack/severity group). */
  timestampValid: boolean;
  /** Where this alert came from. Not rendered; used by useActiveAlerts
   * (Story 4) to route acknowledge() correctly (ws-alt-* ids can't hit the
   * REST acknowledge endpoint). Carried through unchanged from the caller. */
  source: "rest" | "live";
}

/**
 * Turns a raw (possibly malformed) Alert into a NormalizedAlert. This is the
 * single validation boundary described in design/1c-operations.md — no
 * component should ever read raw.zoneName, raw.machineName, or raw.timestamp
 * directly for display purposes.
 *
 * @param raw the alert as returned by the REST mock or the WS `alert` event;
 *   both shapes are `Alert` at the type level, but REST fixtures may
 *   additionally carry a snake_case `machine_name` (alt-004) that isn't part
 *   of the `Alert` type, hence the intersection type.
 * @param zoneById a Map<Zone["id"], Zone> built by the caller from useZones()
 *   (e.g. `new Map(zones.map(z => [z.id, z]))`) — passed in rather than
 *   fetched here because this module has zero React/data-fetching
 *   dependencies by design.
 * @param source "rest" for anything from useAlerts()/the REST mock, "live"
 *   for anything received over the WebSocket via useLive().
 */
export function normalizeAlert(
  raw: Alert & { machine_name?: string },
  zoneById: Map<string, Zone>,
  source: "rest" | "live"
): NormalizedAlert {
  const resolvedZoneName = zoneById.get(raw.zoneId)?.name ?? "Unknown Zone";
  const machineName = raw.machineName ?? raw.machine_name ?? raw.machineId;
  const timestampValid = parseValidTimestampMs(raw.timestamp) !== null;

  return {
    ...raw,
    zoneName: resolvedZoneName,
    machineName,
    timestampValid,
    source,
  };
}

/**
 * Keeps the first occurrence of each `id`, dropping later duplicates.
 * Callers are expected to concatenate REST-then-live (per the architecture
 * diagram in design/1a-discovery.md: `normalize(REST ∪ live)`), so
 * first-occurrence-wins means a REST alert always wins over a live alert
 * that happens to share its id — REST is the more authoritative source
 * (ADR-001). Order of the surviving alerts matches their first appearance
 * in the input; callers should call sortAlerts() afterward for display
 * order, since this function does not sort.
 */
export function dedupeById(alerts: NormalizedAlert[]): NormalizedAlert[] {
  const seen = new Map<string, NormalizedAlert>();
  for (const alert of alerts) {
    if (!seen.has(alert.id)) seen.set(alert.id, alert);
  }
  return Array.from(seen.values());
}

/**
 * Sort order (each key only breaks ties left by the previous one):
 *   1. Unacknowledged before acknowledged.
 *   2. Severity: critical > warning > info.
 *   3. Valid timestamps before invalid ones (invalid sort last within their
 *      ack+severity group, regardless of position 4).
 *   4. Most recent first (by parsed timestamp), among alerts with valid
 *      timestamps only.
 * Two alerts that are equal on all four keys keep their relative input
 * order (Array.prototype.sort is a stable sort in all JS engines targeted
 * by this repo's browserslist/Node — no additional tie-breaker is needed).
 */
export function sortAlerts(alerts: NormalizedAlert[]): NormalizedAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.acknowledged !== b.acknowledged) {
      return a.acknowledged ? 1 : -1;
    }
    const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDelta !== 0) return severityDelta;

    if (a.timestampValid !== b.timestampValid) {
      return a.timestampValid ? -1 : 1;
    }
    if (!a.timestampValid) return 0; // both invalid: stable, no further ordering

    // both valid: newest first
    return (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0);
  });
}

export interface MachineAlertGroup {
  machineId: string;
  machineName: string;
  zoneId: string;
  zoneName: string;
  /** This machine's alerts, in the same relative order they appeared in the
   * input array. groupByMachine does NOT re-sort alerts within a group —
   * callers must pass alerts that have already been through sortAlerts() so
   * "already sorted" (per design/1a-discovery.md's Core Data Model) holds. */
  alerts: NormalizedAlert[];
  /** The single most severe severity present anywhere in this group's
   * alerts (critical > warning > info), independent of acknowledged state. */
  worstSeverity: Alert["severity"];
  unacknowledgedCount: number;
}

/**
 * Groups alerts by machineId. Group order: worst severity first
 * (critical-containing groups before warning-containing before info-only),
 * then by each group's most recent *valid* timestamp, descending. A group
 * whose alerts are all timestamp-invalid sorts after every group that has
 * at least one valid timestamp (treated as "oldest possible" for this
 * comparison only — this does not affect timestampValid on the alerts
 * themselves).
 *
 * Precondition: `alerts` should already be normalized (NormalizedAlert[]);
 * for a correctly-grouped, correctly-ordered result within each group, the
 * input should also already be sortAlerts()-sorted.
 */
export function groupByMachine(alerts: NormalizedAlert[]): MachineAlertGroup[] {
  const groups = new Map<string, MachineAlertGroup>();

  for (const alert of alerts) {
    let group = groups.get(alert.machineId);
    if (!group) {
      group = {
        machineId: alert.machineId,
        machineName: alert.machineName,
        zoneId: alert.zoneId,
        zoneName: alert.zoneName,
        alerts: [],
        worstSeverity: alert.severity,
        unacknowledgedCount: 0,
      };
      groups.set(alert.machineId, group);
    }
    group.alerts.push(alert);
    if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[group.worstSeverity]) {
      group.worstSeverity = alert.severity;
    }
    if (!alert.acknowledged) {
      group.unacknowledgedCount += 1;
    }
  }

  const newestValidMs = (group: MachineAlertGroup): number => {
    let max = -Infinity;
    for (const a of group.alerts) {
      if (a.timestampValid) {
        const ms = Date.parse(a.timestamp);
        if (ms > max) max = ms;
      }
    }
    return max; // -Infinity if the group has no valid timestamps at all
  };

  return Array.from(groups.values()).sort((a, b) => {
    const severityDelta = SEVERITY_RANK[a.worstSeverity] - SEVERITY_RANK[b.worstSeverity];
    if (severityDelta !== 0) return severityDelta;
    return newestValidMs(b) - newestValidMs(a);
  });
}

/**
 * Human-readable "time ago" string. Returns "Unknown time" for anything
 * parseValidTimestampMs rejects (unparseable or pre-2000) — this is the
 * same rule normalizeAlert uses for timestampValid, applied here directly
 * to a raw ISO string so components that only have `alert.timestamp` handy
 * (rather than a full NormalizedAlert) can still call this safely.
 * A timestamp in the future (clock skew, unlikely with this mock) is
 * clamped to "0s ago" rather than showing a negative duration.
 */
export function formatRelativeTime(iso: string): string {
  const ms = parseValidTimestampMs(iso);
  if (ms === null) return "Unknown time";

  const diffMs = Math.max(0, Date.now() - ms);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}h ago`;
}
```

## Test Case Table

| Case | Input | Expected Output | Type (happy/edge/error) |
|------|-------|------------------|--------------------------|
| Basic normalize | `alt-001` (well-formed, `zoneId: "packaging"`) with real `zoneById` | `machineName: "Box Press #1"`, `zoneName: "Packaging & Shipping"`, `timestampValid: true`, `source: "rest"` | happy |
| snake_case machine_name (alt-004) | `{ machineId: "welder-02", machine_name: "Spot Welder #2", machineName: undefined, ... }` | `machineName === "Spot Welder #2"` | edge |
| Missing both name fields | `{ machineId: "m-99" }`, no `machineName`/`machine_name` | `machineName === "m-99"` (falls back to machineId) | edge |
| Invalid epoch timestamp (alt-005) | `timestamp: "1969-12-31T23:59:59Z"` | `timestampValid === false`; `formatRelativeTime(...)` on the same string returns `"Unknown time"` | edge |
| Garbage timestamp string | `timestamp: "not-a-date"` | `timestampValid === false`; `formatRelativeTime` returns `"Unknown time"` | error |
| Valid but very old (pre-2000) | `timestamp: "1999-12-31T00:00:00Z"` | `timestampValid === false` | edge |
| Valid, just after cutoff | `timestamp: "2000-01-01T00:00:01Z"` | `timestampValid === true` | edge |
| Zone mismatch (alt-006) | `zoneId: "assembly"`, raw `zoneName: "Welding Bay"`, `zoneById` from real `zones.json` | `zoneName === "Assembly Line"` (resolved from `zoneById.get("assembly")`, NOT `"Welding Bay"`) | edge |
| Unknown zoneId | `zoneId: "nonexistent"`, `zoneById` from real `zones.json` | `zoneName === "Unknown Zone"` (never falls back to the raw, untrusted field) | error |
| WS alert zoneName-is-zoneId bug | `{ zoneId: "welding", zoneName: "welding" }` (as the mock WS actually sends), `source: "live"` | `zoneName === "Welding Bay"` (resolved, not `"welding"`) | edge |
| dedupeById, no collisions | 3 normalized alerts, distinct ids | all 3 returned, same order | happy |
| dedupeById, one collision | `[restAlt (id: "alt-002", source: "rest"), liveAlt (id: "alt-002", source: "live")]` | length 1, and the surviving alert is `restAlt` (first occurrence — REST wins) | edge |
| dedupeById, empty input | `[]` | `[]` | edge |
| sortAlerts — ack before severity | one acknowledged critical + one unacknowledged info | unacknowledged info comes first | happy |
| sortAlerts — severity ranking | one unacked warning + one unacked critical + one unacked info (same ack state) | order: critical, warning, info | happy |
| sortAlerts — recency within group | two unacked criticals, timestamps `10:00` and `10:30`, both valid | `10:30` (newer) first | happy |
| sortAlerts — invalid timestamp sorts last in group | two unacked criticals, one valid (`10:00`), one invalid (alt-005-style) | valid one first, invalid one second | edge |
| sortAlerts — empty input | `[]` | `[]`, no throw | edge |
| sortAlerts — full acceptance-criteria mix | all 6 alerts from `alerts.json`, normalized | unacked-critical(s) first, then unacked-warning(s), then unacked-info, then acked-info(s) (alt-005), matching the 4-key rule exactly | happy |
| groupByMachine — stress fixture | all 50 alerts from `alerts-50.json`, normalized + sorted | exactly 14 groups; group for `press-01` has `worstSeverity: "critical"`; every group's `unacknowledgedCount` matches a manual count from the fixture | happy |
| groupByMachine — worstSeverity correctness | a machine with only warning+info alerts (no critical) | `worstSeverity: "warning"` | edge |
| groupByMachine — single-alert machine | a machine with exactly one info alert | one group, `unacknowledgedCount` 0 or 1 matching that alert's `acknowledged` | edge |
| groupByMachine — empty input | `[]` | `[]` | edge |
| groupByMachine — group ordering | two machines, one with a critical alert, one with only info alerts | the critical machine's group appears first | happy |
| formatRelativeTime — seconds | timestamp 30s before "now" | `"30s ago"` | happy |
| formatRelativeTime — minutes | timestamp 5 minutes before "now" | `"5m ago"` | happy |
| formatRelativeTime — hours | timestamp 3 hours before "now" | `"3h ago"` | happy |
| formatRelativeTime — future timestamp | timestamp 10s in the future (clock skew) | `"0s ago"` (clamped, not negative) | error |
| No `any` anywhere | full file contents of `status.ts` and `alerts.ts` | zero occurrences of the `any` keyword; `tsc -b` passes | error-prevention |

## Verification Steps (manual, since no test runner exists)

No test runner and no new dependencies are allowed, so verification uses the TypeScript compiler already in `devDependencies` (`typescript` is already installed — `npx tsc` here does **not** install anything new, it runs the existing local binary) to compile the two library files to plain JS in a throwaway directory, then a small Node driver script exercises them against the real fixture files. Nothing here is committed to the repo.

1. **Type-check as part of the real build gate** (do this first and last):
   ```bash
   npm run build
   ```
   Expected: `tsc -b && vite build` completes with zero errors. This alone catches "no `any`", missing exports, and signature mismatches other stories will rely on.

2. **Compile just the new files (plus their one dependency, `types.ts`) to a scratch directory** for isolated runtime testing:
   ```bash
   npx tsc src/lib/status.ts src/lib/alerts.ts src/types.ts \
     --target ES2020 --module ESNext --moduleResolution bundler \
     --outDir /tmp/story1-verify --skipLibCheck
   ```
   Expected: no errors; `/tmp/story1-verify/lib/status.js` and `/tmp/story1-verify/lib/alerts.js` exist.

3. **Write a throwaway driver script** (e.g. `/tmp/story1-verify/run.mjs` — outside `src/`, never committed) that imports the compiled JS and the real fixtures, then logs results for manual inspection against the Test Case Table above:
   ```js
   import { normalizeAlert, dedupeById, sortAlerts, groupByMachine, formatRelativeTime }
     from "/tmp/story1-verify/lib/alerts.js";
   import { readFileSync } from "node:fs";

   const zones = JSON.parse(readFileSync("src/mocks/data/zones.json", "utf8"));
   const zoneById = new Map(zones.map(z => [z.id, z]));
   const alerts6 = JSON.parse(readFileSync("src/mocks/data/alerts.json", "utf8"));
   const alerts50 = JSON.parse(readFileSync("src/mocks/data/scenarios/alerts-50.json", "utf8"));

   // alt-004: machine_name fallback
   const n4 = normalizeAlert(alerts6.find(a => a.id === "alt-004"), zoneById, "rest");
   console.log("alt-004 machineName:", n4.machineName); // expect "Spot Welder #2"

   // alt-005: invalid timestamp
   const n5 = normalizeAlert(alerts6.find(a => a.id === "alt-005"), zoneById, "rest");
   console.log("alt-005 timestampValid:", n5.timestampValid); // expect false
   console.log("alt-005 relative:", formatRelativeTime(alerts6.find(a => a.id === "alt-005").timestamp)); // expect "Unknown time"

   // alt-006: zone mismatch
   const n6 = normalizeAlert(alerts6.find(a => a.id === "alt-006"), zoneById, "rest");
   console.log("alt-006 zoneName:", n6.zoneName); // expect "Assembly Line", NOT "Welding Bay"

   // sortAlerts on all 6
   const normalized6 = alerts6.map(a => normalizeAlert(a, zoneById, "rest"));
   const sorted6 = sortAlerts(normalized6);
   console.log("sorted6 order:", sorted6.map(a => `${a.id}(${a.severity},ack=${a.acknowledged},valid=${a.timestampValid})`));

   // dedupeById
   const dup = { ...normalized6[0], source: "live" };
   console.log("dedupe count (expect same as input length):", dedupeById([...normalized6, dup]).length, "vs", normalized6.length);

   // groupByMachine on the 50-alert stress fixture
   const normalized50 = sortAlerts(alerts50.map(a => normalizeAlert(a, zoneById, "rest")));
   const groups = groupByMachine(normalized50);
   console.log("group count (expect 14):", groups.length);
   console.log("groups:", groups.map(g => `${g.machineId}: worst=${g.worstSeverity} unacked=${g.unacknowledgedCount} n=${g.alerts.length}`));
   ```
   Run it:
   ```bash
   node /tmp/story1-verify/run.mjs
   ```

4. **Manually compare console output against the Test Case Table and Acceptance Criteria**:
   - `alt-004 machineName` → `"Spot Welder #2"`
   - `alt-005 timestampValid` → `false`, relative → `"Unknown time"`
   - `alt-006 zoneName` → `"Assembly Line"` (not `"Welding Bay"`)
   - `sorted6 order` → unacknowledged criticals/warnings first, acknowledged `alt-005` (info, invalid timestamp) last
   - dedupe count → equal to `normalized6.length` (6), confirming the injected duplicate was dropped
   - group count → exactly `14`
   - Cross-check 2-3 groups' `unacked`/`worst` fields by eye against `src/mocks/data/scenarios/alerts-50.json`

5. **Clean up**: delete `/tmp/story1-verify` when done. Nothing under `/tmp` or any ad-hoc `.mjs` driver should be committed.

## Out of Scope
- Any React/hook code — no `useState`, no JSX, no imports from `react` or `@tanstack/react-query` anywhere in `src/lib/status.ts` or `src/lib/alerts.ts`.
- Fetching data over the network or from the mock backend — `zoneById` is always passed in by the caller (Story 4 builds it from `useZones()`).
- Modifying `src/mocks/*` or `src/types.ts` — read-only references only; known data-quality bugs in the fixtures are worked around, not fixed at the source.
- `useActiveAlerts`, `LiveProvider`, `useAllMachines`, and all page/component code — those are Stories 2, 3, and 4+.
- Adding a test runner or any new npm dependency.

## Open Questions
None.
