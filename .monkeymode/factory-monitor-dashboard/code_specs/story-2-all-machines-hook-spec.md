# Code Spec: All-Machines Aggregation Hook

**Story ID:** story-2-all-machines-hook
**Status:** Ready for implementation

## Summary
Add a new hook, `useAllMachines()`, that fans out one `useQuery` per zone (via TanStack Query's `useQueries`) over the existing `/api/zones/:zoneId/machines` endpoint and flattens the results into a single `Machine[]`. This lets Dashboard and Topology get all 14 machines across the 4 mock zones without hand-rolling per-zone fetches, while keeping the request count bounded by zone count (4), never machine count (14) and never a sequential waterfall.

## Files to Create
- `src/hooks/useAllMachines.ts` — new hook: `useZones()` → `useQueries` (one query per zone) → flatMap → `{ machines, isLoading, isError }`.

## Files to Modify
None. This story touches no existing files (`useZones.ts`, `types.ts`, `handlers.ts` are read-only references).

## Task Breakdown
| # | Task | Files Touched | Notes |
|---|------|----------------|-------|
| 1 | Create `useAllMachines.ts` with the exact exported signature | `src/hooks/useAllMachines.ts` | Import `Machine`, `Zone` types from `../types`; import `useZones` from `./useZones`; import `useQueries` from `@tanstack/react-query` |
| 2 | Implement zone loading gate | `src/hooks/useAllMachines.ts` | While `useZones()` is loading/has no data, return `{ machines: undefined, isLoading: true, isError: false }` without calling `useQueries` with any queries (see Function/Component Signatures for the exact conditional pattern that keeps hook-call order stable) |
| 3 | Implement per-zone `useQueries` fan-out | `src/hooks/useAllMachines.ts` | One query object per zone: `queryKey: ["machines", zone.id]`, `queryFn` fetching `/api/zones/${zone.id}/machines`, matching `useZones.ts`'s fetch/error-throw style |
| 4 | Derive aggregate `isLoading` / `isError` / `machines` | `src/hooks/useAllMachines.ts` | `isLoading` true if zones are loading OR any machine query is loading; `isError` true if zones errored OR any machine query errored; `machines` is `undefined` unless zones loaded AND every machine query has `data`, in which case flatMap all `data` arrays |
| 5 | Manual verification per Verification Steps below | n/a (browser) | No test runner installed; verify via `npm run dev` + DevTools Network tab |

## Function/Component Signatures

```ts
// src/hooks/useAllMachines.ts
import { useQueries } from "@tanstack/react-query";
import type { Machine } from "../types";
import { useZones } from "./useZones";

export function useAllMachines(): {
  machines: Machine[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const {
    data: zones,
    isLoading: zonesLoading,
    isError: zonesError,
  } = useZones();

  const machineQueries = useQueries({
    queries: (zones ?? []).map((zone) => ({
      queryKey: ["machines", zone.id] as const,
      queryFn: async (): Promise<Machine[]> => {
        const response = await fetch(`/api/zones/${zone.id}/machines`);
        if (!response.ok) throw new Error("Failed to fetch machines");
        return response.json();
      },
      enabled: !!zones,
    })),
  });

  const isLoading =
    zonesLoading || (!!zones && machineQueries.some((q) => q.isLoading));
  const isError =
    zonesError || machineQueries.some((q) => q.isError);

  const machines =
    !zones || machineQueries.some((q) => !q.data)
      ? undefined
      : machineQueries.flatMap((q) => q.data as Machine[]);

  return { machines, isLoading, isError };
}
```

Notes on the signature above (binding for the implementer):
- `useQueries({ queries: [] })` when `zones` is `undefined` returns an empty array — this is safe and does **not** violate React's rules of hooks, since `useQueries` itself is always called unconditionally exactly once per render; only the *contents* of its `queries` array changes across renders, which is the documented, supported way to use `useQueries` with a data-dependent list.
- `enabled: !!zones` guards against firing fetches before zones exist, though in practice the `queries` array is empty until `zones` is defined, so this is a belt-and-suspenders guard, not the primary gate.
- `machines` must only ever be a fully-resolved `Machine[]` or `undefined` — never a partially-flattened array — so consumers can rely on "defined implies complete."
- Do not introduce `any`; `q.data` inside `flatMap` requires the cast to `Machine[]` shown above because `useQueries`' inferred per-query type is not always narrowed automatically depending on the TS config — if strict inference already narrows it without the cast, the cast may be omitted, but it must not be replaced with `any`.

## Test Case Table
| Case | Input | Expected Output | Type (happy/edge/error) |
|------|-------|------------------|--------------------------|
| Default mock resolves | 4 zones, 14 machines total (default `zones.json`/`machines.json`) | `machines.length === 14`; every machine's `zoneId` is one of the 4 zone ids; `isLoading === false`; `isError === false` | happy |
| Zones still loading | `useZones()` has not resolved (`isLoading: true`, `data: undefined`) | `isLoading === true`; `machines === undefined`; `isError === false` | edge |
| Zones resolved, machines still loading | `zones` resolved (4 zones), at least one per-zone machine query still in flight | `isLoading === true`; `machines === undefined` | edge |
| One per-zone machine fetch fails | e.g. `/api/zones/welding/machines` returns non-2xx or network error | `isError === true` (regardless of whether other zone queries succeeded) | error |
| Zones fetch itself fails | `/api/zones` returns non-2xx | `isError === true`; `machines === undefined` | error |
| Request count / shape | Default mock, 4 zones | Exactly 4 network requests total, one per zone to `/api/zones/:zoneId/machines`; 0 requests to any per-machine endpoint (e.g. `/api/machines/:machineId`) and 0 requests to a nonexistent `/api/machines` (all) endpoint | happy (perf/contract check) |
| Zero zones (degenerate) | `useZones()` resolves to `[]` | `isLoading === false`; `isError === false`; `machines === []` (empty array, not `undefined`, since zones did resolve and there's nothing to wait on) | edge |

## Verification Steps (manual, since no test runner exists)

1. Run `npm run build` (`tsc -b && vite build`) — must complete with zero TypeScript errors, confirming the exported signature exactly matches `{ machines: Machine[] | undefined; isLoading: boolean; isError: boolean }`.
2. Run `npm run dev`, open the app in a browser, and add a temporary throwaway console log or a scratch component that calls `useAllMachines()` and logs the result (or wire it into `Dashboard.tsx`/`Topology.tsx` transiently if either has landed) — confirm:
   - Immediately after navigation, `isLoading` is briefly `true` and `machines` is `undefined`.
   - Once resolved, `machines.length === 14` and `machines.every(m => ["packaging","welding","assembly","painting"].includes(m.zoneId))` (adjust to the actual 4 zone ids from `src/mocks/data/zones.json`).
3. Open DevTools Network tab, filter on `machines`, reload the page: confirm exactly 4 requests to `/api/zones/*/machines` (one per zone) and zero requests to any per-machine or all-machines endpoint. Confirm the 4 requests fire concurrently (overlapping in the waterfall view), not sequentially one-after-another.
4. Simulate a per-zone failure: temporarily throw inside one zone's mocked handler (or use browser devtools to block one `/api/zones/*/machines` request) and confirm `isError` becomes `true` while the app doesn't crash.
5. Simulate the zones-endpoint failure the same way (block `/api/zones`) and confirm `isError` is `true` and `machines` stays `undefined`.
6. Remove any temporary scratch logging/component added for steps 2 and 4-5 before considering the story done — this hook itself introduces no UI.

## Out of Scope
- Any UI rendering of machines (handled by Story 5 Dashboard and Story 7 Topology).
- A dedicated `/api/machines` (all) endpoint — the mock backend is not modified by this feature; there is intentionally no such endpoint, which is exactly why this hook exists.
- Automated unit tests (no test runner installed in this repo per `design/1b-contracts.md` Testing Strategy) — verification is manual per the steps above.
- Caching/staleness configuration changes — this hook inherits the app's existing `QueryClient` defaults (`staleTime: 10000`, `retry: 1`) unchanged; no per-hook overrides are introduced.

## Open Questions
None.
