# Code Spec: Active Alerts Aggregation Hook

**Story ID:** story-4-active-alerts-hook
**Status:** Ready for implementation

## Summary
`useActiveAlerts` is the single read/write seam between the REST alert list (`useAlerts`, TanStack Query) and the live WebSocket alert stream (`useLive`, Story 3), producing one normalized, deduped, sorted, filterable `NormalizedAlert[]` and one `acknowledge`/`bulkAcknowledge` API that routes by id shape. It must merge REST and live data at read time only — per ADR-001, live alerts must never be written into the `["alerts"]` TanStack Query cache entry, because `useAcknowledgeAlert`'s `invalidateQueries(["alerts"])` would silently erase them. This story depends on Story 1 (`src/lib/alerts.ts`) and Story 3 (`src/hooks/useLive.ts`) landing first; both are currently absent from disk (confirmed by directory listing), so this spec is written strictly against their approved contracts and is otherwise self-contained.

## Files to Create
- `src/hooks/useActiveAlerts.ts` — the merge/normalize/sort/filter hook and unified `acknowledge`/`bulkAcknowledge` API described below.

## Files to Modify
None. This story is additive only — it does not change `useAlerts.ts`, `useAcknowledgeAlert.ts`, `useZones.ts`, or any existing file.

## Task Breakdown
| # | Task | Files Touched | Notes |
|---|------|----------------|-------|
| 1 | Import and wire the four upstream sources (`useAlerts`, `useLive`, `useZones`, `useAcknowledgeAlert`) | `src/hooks/useActiveAlerts.ts` | No new query keys are introduced; this hook reads existing hook results only. |
| 2 | Build `zoneById: Map<string, Zone>` from `useZones().data`, memoized on the zones array reference | `src/hooks/useActiveAlerts.ts` | Empty map when zones haven't loaded yet — `normalizeAlert` must tolerate an unresolved zone id (falls back per Story 1's contract; if Story 1's `normalizeAlert` has no explicit fallback documented, treat a missing map entry as `zoneName: raw.zoneId` and flag in Open Questions). |
| 3 | Normalize REST alerts (`source: "rest"`) and live alerts (`source: "live"`) separately via `normalizeAlert`, then concatenate, `dedupeById`, `sortAlerts` — all inside one `useMemo` | `src/hooks/useActiveAlerts.ts` | This produces the full merged+sorted set *before* any filtering, per the "filter the merged set" acceptance criterion. |
| 4 | Apply `filters.severity`/`filters.zone` as a client-side `.filter()` over the merged, sorted array in a second `useMemo` layer (or the same memo, filter last) | `src/hooks/useActiveAlerts.ts` | Filtering must run after merge/dedupe/sort, never on REST and live separately. `useAlerts(filters)` is still called with the same filters so the REST fetch itself is also narrowed (smaller payload / consistent with existing hook usage), but correctness does not depend on the REST-side filter — the in-memory filter is authoritative and must be re-applied regardless, since live alerts were never filtered server-side. |
| 5 | Derive `isLoading`/`isError` from `useAlerts()` only (live data has no loading/error state — `useLive()` is synchronous local state) | `src/hooks/useActiveAlerts.ts` | Matches Story 3's contract: `useLive()` returns state directly, no `isLoading`/`isError` fields exist on `LiveContextValue`. |
| 6 | Implement `acknowledge(id)`: branch on `id.startsWith("ws-alt-")` → `useLive().acknowledgeLocal(id)` (synchronous, no REST call); else → `useAcknowledgeAlert().mutate(id)` | `src/hooks/useActiveAlerts.ts` | This is the mechanism that avoids the 404 described in ADR-001's Negative consequence. |
| 7 | Expose `acknowledgePending` from `useAcknowledgeAlert().isPending` (local acks are synchronous so contribute no pending state) | `src/hooks/useActiveAlerts.ts` | |
| 8 | Implement `bulkAcknowledge(ids)`: wrap each `acknowledge(id)` call in a `Promise` (resolving immediately for local acks, resolving/rejecting on the mutation's promise for REST acks), collect via `Promise.allSettled`, partition into `{succeeded, failed}` | `src/hooks/useActiveAlerts.ts` | `useAcknowledgeAlert().mutate` is fire-and-forget by default; use `mutateAsync` (from the same `useMutation` instance) inside `bulkAcknowledge` instead of `.mutate`, since `allSettled` needs a promise per id. Must never let a rejected mutation surface as an unhandled rejection — `allSettled` on the mapped promises guarantees this. |
| 9 | Wrap the whole merge/filter pipeline in `useMemo` with dependency array `[restAlerts, liveAlerts, zones, filters?.severity, filters?.zone]` (or equivalent stable refs) so recomputation is skipped on unrelated re-renders | `src/hooks/useActiveAlerts.ts` | Per Conventions Seed and `1c-operations.md`'s optimization strategy. |

## Function/Component Signatures

```ts
// src/hooks/useActiveAlerts.ts
import { useMemo, useCallback } from "react";
import type { Alert } from "../types";
import { normalizeAlert, sortAlerts, dedupeById, type NormalizedAlert } from "../lib/alerts";
import { useLive } from "./useLive";
import { useAlerts } from "./useAlerts";
import { useAcknowledgeAlert } from "./useAcknowledgeAlert";
import { useZones } from "./useZones";

export interface UseActiveAlertsFilters {
  severity?: Alert["severity"];
  zone?: string;
}

export interface UseActiveAlertsResult {
  alerts: NormalizedAlert[];
  isLoading: boolean;
  isError: boolean;
  acknowledge: (id: string) => void;
  acknowledgePending: boolean;
  bulkAcknowledge: (ids: string[]) => Promise<{ succeeded: string[]; failed: string[] }>;
}

export function useActiveAlerts(
  filters?: UseActiveAlertsFilters
): UseActiveAlertsResult;
```

**Internal helper shape (not exported, illustrative of required behavior):**
```ts
// Inside useActiveAlerts:
const { data: zones } = useZones();
const zoneById = useMemo<Map<string, Zone>>(
  () => new Map((zones ?? []).map((z) => [z.id, z])),
  [zones]
);

const { data: restAlerts, isLoading, isError } = useAlerts(filters);
const { liveAlerts, acknowledgeLocal } = useLive();
const { mutate, mutateAsync, isPending } = useAcknowledgeAlert();

const alerts = useMemo(() => {
  const normalizedRest = (restAlerts ?? []).map((a) => normalizeAlert(a, zoneById, "rest"));
  const normalizedLive = liveAlerts.map((a) => normalizeAlert(a, zoneById, "live"));
  const merged = sortAlerts(dedupeById([...normalizedRest, ...normalizedLive]));
  return merged.filter((a) => {
    if (filters?.severity && a.severity !== filters.severity) return false;
    if (filters?.zone && a.zoneId !== filters.zone) return false;
    return true;
  });
}, [restAlerts, liveAlerts, zoneById, filters?.severity, filters?.zone]);

const acknowledge = useCallback(
  (id: string) => {
    if (id.startsWith("ws-alt-")) {
      acknowledgeLocal(id);
    } else {
      mutate(id);
    }
  },
  [acknowledgeLocal, mutate]
);

const bulkAcknowledge = useCallback(
  async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) =>
        id.startsWith("ws-alt-")
          ? Promise.resolve(acknowledgeLocal(id)).then(() => id)
          : mutateAsync(id).then(() => id)
      )
    );
    const succeeded: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") succeeded.push(ids[i]);
      else failed.push(ids[i]);
    });
    return { succeeded, failed };
  },
  [acknowledgeLocal, mutateAsync]
);

return { alerts, isLoading, isError, acknowledge, acknowledgePending: isPending, bulkAcknowledge };
```

**Note on `zoneId` used for zone filtering:** `filters.zone` is matched against `NormalizedAlert.zoneId` (the raw zone id, e.g. `"welding"`), not `zoneName`, consistent with `useAlerts(filters)`'s own `?zone=` query param semantics (`src/hooks/useAlerts.ts` passes `filters.zone` straight through as `zone` to the REST query string, which the mock filters by zone id).

## Test Case Table
| Case | Input | Expected Output | Type (happy/edge/error) |
|------|-------|------------------|--------------------------|
| Default REST-only | Default mock, 6 REST alerts, 0 live | `alerts.length === 6`, normalized (`alt-004.machineName === "Spot Welder #2"`, `alt-005.timestampValid === false`, `alt-006.zoneName` resolved from `zoneById.get("assembly")` not the raw `"Welding Bay"`), sorted unacked-first/severity-desc/newest-first with `alt-005` last in its group | happy |
| Live alert appended | One `alert` WS message arrives via `useLive()` (raw payload with `zoneName === zoneId` bug) | New `NormalizedAlert` appears in `alerts` with `source: "live"`, `zoneName` correctly resolved via `zoneById`, not the raw (buggy) `zoneName` field | happy |
| Merged filter | `filters = { severity: "critical", zone: "welding" }`, mix of REST + live alerts including a live critical Welding alert | Only critical Welding alerts returned, live ones included; a live critical Assembly alert is excluded; a live warning Welding alert is excluded | happy |
| Filter applies post-merge, not pre-merge | Same REST alert id present in both REST and a stale live copy with a different severity (should not occur per dedup, but the filter pipeline must not filter each source before dedup) | `dedupeById` runs before filtering — verify by code inspection that `.filter()` is called on the already-merged array, not on `normalizedRest`/`normalizedLive` individually | edge |
| REST acknowledge | `acknowledge("alt-002")` | `useAcknowledgeAlert().mutate("alt-002")` called; on success, `["alerts"]` query invalidated (existing behavior of `useAcknowledgeAlert`), `alt-002.acknowledged === true` on next `useAlerts` read | happy |
| Live acknowledge | `acknowledge("ws-alt-1758617400000")` | No `fetch` to `/api/alerts/.../acknowledge` is made; `useLive().acknowledgeLocal("ws-alt-1758617400000")` called; alert appears acknowledged (dependent on Story 3's local-ack rendering, e.g. `normalizeAlert` combined with `localAckIds`) | happy |
| Unknown/malformed id | `acknowledge("")` or `acknowledge("garbage-id")` | Falls through to `mutate(id)` (does not start with `"ws-alt-"`); resulting 404 surfaces via the mutation's own `onError`/`isError` — this hook does not need to special-case it beyond the documented prefix routing | edge |
| Bulk acknowledge partial failure | `bulkAcknowledge(["alt-001", "alt-002"])`, mock configured so the second POST 404s | Promise resolves (never rejects) with `{ succeeded: ["alt-001"], failed: ["alt-002"] }` | error (partial) |
| Bulk acknowledge all live | `bulkAcknowledge(["ws-alt-1", "ws-alt-2"])` | Both resolve via `acknowledgeLocal`, no REST calls; `{ succeeded: ["ws-alt-1","ws-alt-2"], failed: [] }` | happy |
| Bulk acknowledge empty list | `bulkAcknowledge([])` | `Promise.allSettled([])` resolves immediately; `{ succeeded: [], failed: [] }` | edge |
| Zones not yet loaded | `useZones()` still loading (`zones === undefined`) when `useActiveAlerts()` is called | `zoneById` is an empty `Map`; alerts still normalize (zone name falls back per `normalizeAlert`'s own contract) without throwing; `alerts.isLoading` reflects `useAlerts`'s loading state, unaffected by zones still loading (per contract, only REST alerts drive `isLoading`) | edge |
| Cache isolation (ADR-001) | A live alert arrives, then any `acknowledge()` call successfully resolves and triggers `invalidateQueries(["alerts"])` | The live alert is still present in `alerts` on the next render (it was never written into the `["alerts"]` cache entry, so invalidation cannot drop it) — verify by code inspection that no `queryClient.setQueryData(["alerts"], ...)` call exists anywhere in this file | error (regression the spec exists to prevent) |
| Stress volume | `window.__setAlertScenario("stress")` (50 REST alerts) + several live alerts | `alerts` contains all merged/deduped/sorted entries; `useMemo` dependency array prevents recomputation on an unrelated parent re-render (verify via a temporary `console.count` during manual testing, then remove) | edge |

## Verification Steps (manual, since no test runner exists)
1. Confirm `src/lib/alerts.ts` (Story 1) and `src/hooks/useLive.ts` (Story 3) exist and export exactly the signatures listed in "Interfaces used by this story" above; if either is missing, implementation of this story cannot proceed (see Open Questions).
2. `npm run build` (`tsc -b && vite build`) must pass with zero TypeScript errors — this is the only automated gate.
3. In the browser at `http://localhost:5173`, add a temporary scratch component (or use an existing page stub) that calls `useActiveAlerts()` and logs the result, or use React DevTools to inspect the hook's return value directly.
4. With the default scenario active, confirm `alerts.length === 6` and manually check `alt-004`, `alt-005`, `alt-006` render their corrected fields (machineName, "Unknown time", resolved zoneName) as described in the Test Case Table.
5. Wait for a live `alert` WebSocket message (~15s interval, ~30% chance per tick — may take a few ticks) and confirm it appears in `alerts` with a correctly resolved `zoneName` (not the raw buggy value).
6. Apply `useActiveAlerts({ severity: "critical", zone: "welding" })` and confirm only matching alerts appear, including any live one that matches.
7. Call `acknowledge("alt-002")` from a temporary button/console call; confirm (a) a network request fires to `POST /api/alerts/alt-002/acknowledge`, (b) after it resolves, `useAlerts()`'s cache reflects `acknowledged: true` on next read.
8. Call `acknowledge()` on a live alert's id (copy the `ws-alt-...` id from the console/DevTools); confirm via the Network tab that **no** request fires, and the alert is marked acknowledged in the returned `alerts` array on next render.
9. Call `bulkAcknowledge(["alt-001", "alt-002"])`; confirm both succeed under normal conditions. To exercise the partial-failure path, call `bulkAcknowledge(["alt-001", "nonexistent-id"])` and confirm the promise resolves with `succeeded: ["alt-001"], failed: ["nonexistent-id"]` and no uncaught promise rejection appears in the console.
10. Switch to `window.__setAlertScenario("stress")`, reload, and confirm `useActiveAlerts()` returns 50 normalized/sorted/deduped alerts without console errors or visible lag.
11. Grep the finished `useActiveAlerts.ts` for `setQueryData` to confirm it is never used with the `["alerts"]` key (ADR-001 compliance check).

## Out of Scope
- Any rendering of alerts (Dashboard/Alerts pages are Stories 5 and 6).
- Persisting local (live) acknowledgements across a page reload — the mock resets on reload regardless, and `useLive`'s `localAckIds` is in-memory only per Story 3's contract.
- Modifying `useAlerts.ts`, `useAcknowledgeAlert.ts`, or `useZones.ts` — all consumed as-is.
- Building `src/lib/alerts.ts` or `src/hooks/useLive.ts` themselves — those are Stories 1 and 3's deliverables; this spec only consumes their contracts.
- Any change to the MSW mock backend or `MockWebSocketServer`.

## Open Questions
- **Non-blocking (default: proceed as specified).** `src/lib/alerts.ts` (Story 1) and `src/hooks/useLive.ts` (Story 3) do not exist on disk yet (confirmed via directory listing at spec-writing time). Implementation of this story must wait until both land and export exactly the interfaces documented in `design/1b-contracts.md` Part 3 and `stories/user_stories.md` Stories 1 and 3. If either lands with a signature deviating from what's specified here (e.g., a different `acknowledgeLocal` return type, or `normalizeAlert`'s fallback behavior for an unresolved `zoneById` entry), this spec's Task Breakdown step 2 and the Function/Component Signatures section should be revisited before coding.
- **Non-blocking.** Story 1's contract does not explicitly document `normalizeAlert`'s behavior when `zoneById.get(raw.zoneId)` misses (e.g., zones still loading, or a zone id with no matching zone). This spec assumes `normalizeAlert` handles that internally (e.g., falling back to the raw `zoneId` string) rather than throwing; `useActiveAlerts` passes a possibly-empty `Map` without special-casing it. If Story 1's actual implementation throws instead, `useActiveAlerts` would need a defensive `try/catch` or to gate normalization on `zones` being loaded — flagged for confirmation once Story 1 lands, not blocking this spec.
- **Non-blocking.** `useAcknowledgeAlert` as currently implemented only exposes `mutate`/`isPending`/etc. (standard `useMutation` return); this spec relies on also destructuring `mutateAsync` from the same hook instance for `bulkAcknowledge`, which is standard TanStack Query behavior (`useMutation` always returns both `mutate` and `mutateAsync`) and requires no change to `useAcknowledgeAlert.ts` itself.
