# Code Spec: Live Data Provider

**Story ID:** story-3-live-data-provider
**Status:** Ready for implementation

## Summary
Introduce a single app-wide React Context provider (`LiveProvider`) that owns the one and only `useFactoryWebSocket` subscription for the entire app, plus a `useLive()` hook for consumers to read live alerts, per-machine telemetry snapshots, connection freshness, and local-ack bookkeeping. This is pure plumbing: the provider stores raw WebSocket payloads faithfully (no normalization, no merging with REST data) and exists specifically to eliminate the duplicate-subscription / stale-closure risks documented in ADR-001 of `design/1a-discovery.md`.

## Files to Create
- `src/live/LiveProvider.tsx` — the Context object, `LiveProvider` component (owns the single `useFactoryWebSocket` call and all live state), and re-exports needed for `useLive.ts` to consume.
- `src/hooks/useLive.ts` — the `TelemetrySnapshot`/`LiveContextValue` type exports and the `useLive()` hook that reads the context and throws if used outside `LiveProvider`.

## Files to Modify
- `src/App.tsx` — import `LiveProvider` from `../live/LiveProvider` (relative to `src/App.tsx`: `./live/LiveProvider`) and wrap the tree with it: inside `<QueryClientProvider>`, wrapping (i.e. outside) `<BrowserRouter>`. No other change to `App.tsx`'s structure, imports, or the `queryClient` config.

## Task Breakdown
| # | Task | Files Touched | Notes |
|---|------|----------------|-------|
| 1 | Create `LiveContext` (React Context, default `undefined`) and the `LiveContextValue`/`TelemetrySnapshot` type exports | `src/hooks/useLive.ts` | Types live here per the exact interface contract given in the story; `LiveProvider.tsx` imports them rather than redeclaring |
| 2 | Implement `LiveProvider` component: `useState` for `liveAlerts`, `telemetry`, `lastMessageAt`, `localAckIds`; single `useFactoryWebSocket(onMessage)` call; `acknowledgeLocal` callback | `src/live/LiveProvider.tsx` | `onMessage` must be defined once (e.g. via `useCallback` with `[]` deps, or simply a plain function reference stable across renders since it only uses functional setState) and never read `liveAlerts`/`telemetry` from closure — every update goes through `setX(prev => ...)` |
| 3 | Implement `useLive()` hook: `useContext(LiveContext)`, throw descriptive `Error` if `undefined` | `src/hooks/useLive.ts` | Import `LiveContext` from `../live/LiveProvider` |
| 4 | Wire `LiveProvider` into `App.tsx` | `src/App.tsx` | Placement: inside `QueryClientProvider`, outside `BrowserRouter`, per story's explicit constraint |
| 5 | Manual verification per Verification Steps below | n/a | No test runner installed |

## Function/Component Signatures

```ts
// src/hooks/useLive.ts
import { useContext } from "react";
import type { Alert, MachineTelemetry } from "../types";
import { LiveContext } from "../live/LiveProvider";

export interface TelemetrySnapshot {
  machineId: string;
  machineName: string;
  zoneId: string;
  telemetry: MachineTelemetry;
  timestamp: string;
}

export interface LiveContextValue {
  liveAlerts: Alert[];
  telemetry: Record<string, TelemetrySnapshot>;
  lastMessageAt: number | null;
  localAckIds: Set<string>;
  acknowledgeLocal: (id: string) => void;
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (ctx === undefined) {
    throw new Error(
      "useLive() must be called within a <LiveProvider>. " +
        "Wrap your app (inside QueryClientProvider, outside BrowserRouter) with <LiveProvider> in src/App.tsx."
    );
  }
  return ctx;
}
```

```ts
// src/live/LiveProvider.tsx
import { createContext, useCallback, useState, type ReactNode } from "react";
import type { Alert, WebSocketMessage } from "../types";
import { useFactoryWebSocket } from "../hooks/useFactoryWebSocket";
import type { LiveContextValue, TelemetrySnapshot } from "../hooks/useLive";

export const LiveContext = createContext<LiveContextValue | undefined>(undefined);

export function LiveProvider({ children }: { children: ReactNode }): JSX.Element {
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, TelemetrySnapshot>>({});
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [localAckIds, setLocalAckIds] = useState<Set<string>>(new Set());

  const onMessage = useCallback((message: WebSocketMessage) => {
    setLastMessageAt(Date.now());

    if (message.type === "telemetry") {
      const payload = message.payload as TelemetrySnapshot;
      setTelemetry((prev) => ({ ...prev, [payload.machineId]: payload }));
      return;
    }

    if (message.type === "alert") {
      const payload = message.payload as Alert;
      setLiveAlerts((prev) =>
        prev.some((a) => a.id === payload.id) ? prev : [...prev, payload]
      );
      return;
    }
    // "event" type messages: no consumer for this story; ignored deliberately.
  }, []);

  useFactoryWebSocket(onMessage);

  const acknowledgeLocal = useCallback((id: string) => {
    setLocalAckIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const value: LiveContextValue = {
    liveAlerts,
    telemetry,
    lastMessageAt,
    localAckIds,
    acknowledgeLocal,
  };

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
```

```ts
// src/App.tsx — insertion points only (no other structural change)
import { LiveProvider } from "./live/LiveProvider";
// ...
<QueryClientProvider client={queryClient}>
  <LiveProvider>
    <BrowserRouter>
      {/* unchanged subtree */}
    </BrowserRouter>
  </LiveProvider>
</QueryClientProvider>
```

## Test Case Table
| Case | Input | Expected Output | Type (happy/edge/error) |
|------|-------|------------------|--------------------------|
| Telemetry message updates snapshot | A `telemetry` WebSocketMessage for `machineId: "cnc-01"` arrives | `useLive().telemetry["cnc-01"]` equals the payload; `lastMessageAt` is a fresh `Date.now()` value | happy |
| Alert message appended | An `alert` WebSocketMessage with a new `id` arrives | `useLive().liveAlerts` array grows by one, containing the raw payload unmodified (including the known `zoneName`-is-`zoneId` bug — not fixed here) | happy |
| Duplicate alert id deduped | Two `alert` messages arrive with the same `id` | `useLive().liveAlerts` contains only one entry for that `id` | edge |
| Second telemetry for same machine overwrites | Two `telemetry` messages for the same `machineId`, different values | `telemetry[machineId]` reflects only the latest snapshot (record has exactly one entry per machineId) | edge |
| Multiple consumers, one subscription | Dashboard, Alerts, and a test component all call `useLive()` while mounted simultaneously | `grep -rn "useFactoryWebSocket(" src/` shows exactly one call site (inside `LiveProvider.tsx`); only one `mockWebSocket.connect()` occurs | happy |
| Functional setState only | Multiple rapid messages arrive back-to-back (e.g. two alerts before a re-render flushes) | No message is lost — both alerts appear in `liveAlerts` (proves `setLiveAlerts(prev => ...)` is used, not a closure-captured variable) | edge |
| acknowledgeLocal marks id | `acknowledgeLocal("ws-alt-171234")` is called | Subsequent `useLive().localAckIds.has("ws-alt-171234")` is `true` | happy |
| acknowledgeLocal idempotent | `acknowledgeLocal(id)` called twice with the same id | `localAckIds` still contains exactly one entry for `id`; no unnecessary re-render loop | edge |
| useLive outside provider | A component calls `useLive()` while not a descendant of `LiveProvider` | Throws an `Error` with a message naming `useLive` and `LiveProvider` (not a generic "Cannot read properties of undefined") | error |
| App boots with provider mounted | `npm run dev`, load `/` | No console errors; app renders normally; after ~3-6s, telemetry/alerts observably begin arriving (verified via a temporary console.log or React DevTools inspection of `LiveProvider`'s state) | happy |

## Verification Steps (manual, since no test runner exists)
1. Run `npm run build` — must complete with zero TypeScript errors (this is the only automated gate; it will catch signature mismatches such as `LiveContextValue` fields not matching the story's exact interface).
2. Run `grep -rn "useFactoryWebSocket(" src/` — confirm the only match is inside `src/live/LiveProvider.tsx`. No page or component should import/call `useFactoryWebSocket` directly.
3. Run `npm run dev`, open `http://localhost:5173` in a browser with DevTools open and the tab kept in the foreground (per the 1c-operations.md risk note: background tabs throttle `setInterval`, which would make this look falsely "stalled").
4. Temporarily add a `console.log` inside `LiveProvider`'s `onMessage` (or inspect via React DevTools' component state panel on `LiveProvider`) and confirm:
   - A `telemetry` log/state-update appears roughly every 3 seconds, and `telemetry[machineId]` updates for whichever machine was picked.
   - Over 60 seconds, at least one `alert` log/state-update is likely to appear (≈30% chance per 15s tick — if none arrives in 60s, wait for a full 2-3 minutes since it's probabilistic, or briefly lower the mock's threshold locally only to observe, then revert — do not commit a modified `websocket.ts`).
   - `lastMessageAt` changes on every message of either type.
5. Remove the temporary console.log/debug code before considering the story done (do not modify `useFactoryWebSocket.ts` or `src/mocks/websocket.ts`).
6. Mount two temporary sibling components that both call `useLive()` (or use two different pages, e.g. Dashboard and Alerts stubs, both rendering `JSON.stringify(useLive().lastMessageAt)`), navigate between routes, and confirm both reflect the same live state without a second subscription starting (no duplicate/accelerated message frequency, no console errors on route change).
7. In a scratch component or the browser console (via a temporary render), call `acknowledgeLocal("test-id")` and confirm a subsequent read of `useLive().localAckIds` contains `"test-id"`.
8. Temporarily render a component that calls `useLive()` outside of `<LiveProvider>` (e.g. comment out the provider wrap or render the component in isolation) and confirm a clear thrown error naming `useLive`/`LiveProvider` appears — then revert the temporary change.
9. Confirm `src/App.tsx`'s provider order after the edit is: `ChakraProvider` > `QueryClientProvider` > `LiveProvider` > `BrowserRouter` > the rest of the existing tree (no other reordering).

## Out of Scope
- Normalizing, merging, or deduping-across-sources of alerts with REST data — that is Story 4 (`src/hooks/useActiveAlerts.ts`), which sits downstream of this story and consumes `useLive().liveAlerts` as raw input.
- Fixing the known `zoneName`-is-actually-`zoneId` bug in the live alert payload — `LiveProvider` stores the payload faithfully as received; normalization (via `normalizeAlert`, Story 1) happens downstream.
- Routing `acknowledge(id)` to the REST `useAcknowledgeAlert` mutation for non-live ids — this story only provides `acknowledgeLocal` for local bookkeeping of live-originated ids; the routing logic (`id.startsWith("ws-alt-")` branch) belongs to Story 4.
- Any UI component (indicator, banner, tooltip) that reads `useLive()` — those are Story 5/6/7's concern; this story only provides the context/hook.
- Modifying `src/hooks/useFactoryWebSocket.ts` or `src/mocks/websocket.ts` — both are correct as given and must not change.
- Persisting `localAckIds` or any live state across a page reload — the mock and the whole feature explicitly reset on reload (PRT scope).

## Open Questions
None.
