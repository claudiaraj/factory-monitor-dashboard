# Design: Factory Monitor Dashboard - Phase 1C: Production Readiness

## Scope Note
This is a client-only demo SPA for a 90-minute interview exercise, built against an unmodified mock backend with no auth, no real network boundary, and no deployment target beyond a static build. Several standard Phase 1C subsections (JWT auth, DB connection pooling, Kubernetes rollback, distributed tracing, on-call paging) do not apply and are marked **N/A** with the reasoning stated, rather than silently dropped. Where a frontend-shaped equivalent of the concern exists (client-side scalability, build-time verification, a manual rollback), it's addressed in full.

## Security Design

### Authentication / Authorization
**N/A** — no auth in this exercise (confirmed in PRT §7 and Phase 1A discovery). Mock backend has no user concept.

### Input Validation
- Every value read off an `Alert`/`Machine`/`Zone` from the mock is treated as **untrusted for shape**, even though `types.ts` claims it's always well-formed — because it demonstrably isn't (`alt-004`'s `machine_name`, `alt-005`'s garbage timestamp, `alt-006`'s zone mismatch). `normalizeAlert` is the single validation boundary; no component reads a raw `Alert` field directly for `machineName`/`zoneName`/timestamp display.
- `Date.parse(timestamp)` is guarded — a `NaN` or a pre-2000 result is treated as invalid, never passed to `.toLocaleString()` or arithmetic unguarded (would otherwise render `Invalid Date` or produce a garbage relative-time string).
- No user-supplied input is ever rendered unescaped — React's default JSX text interpolation already escapes everything; no `dangerouslySetInnerHTML` is used anywhere in this feature.

### Data Protection
**N/A** — no PII, synthetic mock data only, nothing persisted beyond the mock's in-memory session state (which resets on reload by design).

### Security Headers / Secrets Management
**N/A** — static SPA with no server-side headers to configure in this exercise, and no secrets (no API keys, no env-based config) are introduced by this feature.

---

## Performance & Scalability

### Expected Load
Per PRT §7 and product's explicit input: ~20 alerts/day typical, 50+ on a bad day. Confirmed against the mock's own stress fixture: 50 alerts across 14 machines, 4 zones. One WebSocket client (this tab), one `telemetry` message every ~3s, one `alert` message roughly every ~50s (~30% chance per 15s tick). This is UI-scale, not server-scale — there is no request-per-second concern.

### Performance Targets (adapted to client-side UX, not server latency)
| Metric | Target | Rationale |
|---|---|---|
| Time to identify top problem after landing | < 5s | PRT §9 success metric |
| Acknowledge interaction | 1 click → visible feedback < 300ms (optimistic pending state), confirmed within the mutation's actual round-trip | PRT §9 |
| Live alert appears after arrival | Immediately (same render cycle as the WS message, via React state) | No artificial batching delay |
| Alert list render at 50 alerts (grouped: 14 rows) | No perceptible jank (no virtualization needed at this volume — see ADR-002) | Confirmed scope decision, not a gap |
| `npm run build` | Zero TypeScript errors | Only automated gate available (no test runner) |

### Optimization Strategy
**Rendering:**
- `normalizeAlert`/`sortAlerts`/`groupByMachine` results are memoized with `useMemo`, keyed on the actual REST/live alert arrays and the zone list — recomputation only happens when the underlying data actually changes, not on unrelated re-renders (e.g. a filter-unrelated parent re-render).
- Exactly one `useFactoryWebSocket` subscription exists for the whole app lifetime (`LiveProvider`, mounted once in `App.tsx`) — avoids the N-subscriptions-with-stale-closures problem identified in Phase 1A's Option B (rejected alternative).

**Data fetching:**
- `useAllMachines` fans out 4 parallel queries (one per zone, via `useQueries`) rather than 14 (one per machine) or a sequential waterfall — bounded by zone count, not machine count, so it doesn't get worse as machines are added within existing zones.
- TanStack Query's existing `staleTime: 10000` is left as-is; no additional client-side caching layer is introduced (would be premature for this data volume).

### Scalability Plan
- **Current scale (tens of alerts, 4 zones, 14 machines):** grouping + summary chips + bulk-ack (ADR-002) is sufficient; no virtualization, no pagination.
- **10x scale (~500 alerts):** `groupByMachine` still bounds rows to the machine count, not the alert count, so the grouped view degrades gracefully as long as machine count doesn't also grow 10x. This is noted explicitly as the point where `@tanstack/react-virtual` or server-side pagination would become worth the added complexity — a deliberate "not yet" decision, not an oversight (panel talking point, per PRT §7).
- **Beyond that:** would require the mock backend itself to support pagination/filtering server-side, which is out of scope (mock is not modified).

---

## Deployment Strategy

### Rollout Approach
Big-bang — appropriate for a single-developer, single-environment demo exercise with no existing users to protect. Each epic (E1–E5) is committed and pushed individually to the public GitHub repo as it's completed, so the deployed (or reviewable) state is never a single giant unreviewable diff, even though there's no staged environment.

### "Pipeline"
```
Code → npm run build (tsc -b && vite build) → manual browser verification
     → git commit (per epic) → git push
```
No CI is configured for this exercise; `npm run build` is run locally before each push as the equivalent of a build gate.

### Health Checks / Feature Flags
**N/A** — no server process to health-check, no staged rollout requiring flags. The closest equivalent is the mock's own `window.__setAlertScenario(...)` dev tool, used to manually exercise the empty/stress edge cases before each commit.

### Rollback Plan
**Trigger:** a commit breaks `npm run build` or visibly regresses a previously-working page.
**Steps:** `git revert` the offending commit (never `--force` on a shared/public repo); because each epic is its own commit, rollback granularity is one epic, not the whole feature.
**Rollback time target:** immediate — no deployment step to wait on, only a revert + push.

### Post-Deployment Verification
Since "deployment" here is just the working tree being pushed: after each epic's commit, re-run the epic's Definition of Done checks from `epic-breakdown.md` in the browser (`npm run dev`) before starting the next epic.

---

## Observability

### Logging
**N/A** in the structured-JSON/log-aggregation sense — no backend to emit logs from. The frontend equivalent: React Query surfaces fetch failures as `isError`/`error` on each hook, which every page renders as an inline error state rather than swallowing (FR-004). Nothing is currently sent to `console.error` by design in the happy path; if a query fails, the UI itself is the observability surface for this exercise.

### Metrics / Tracing / Alerting / Dashboards
**N/A** — no metrics backend, no on-call, no dashboards for a local demo app. The `LiveIndicator` component (FR-014) is the closest analog: a user-facing "is data still flowing" signal (last-message-at ticker), which is effectively a hand-rolled liveness indicator for the one dependency (the mock WebSocket) that could silently stop.

### What this app does keep, in place of full observability
- Every page-level error state is visible in the UI, not just the console — a stand-in for "someone will notice quickly" without real alerting infrastructure.
- The `LiveIndicator`'s "last update Ns ago" is a manual, visual health check the operator (and the panel, watching a demo) can read directly.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Running out of the 90-minute window before all Must requirements land | Medium | High | Strict epic order E1→E2→E3→E4→E5 with a commit after each, so a demoable state always exists even if E4/E5 are cut | Solo developer (this session) |
| Stale closure in `useFactoryWebSocket` causes live updates to silently stop reflecting current state | Medium (easy mistake) | Medium | `LiveProvider` uses only functional `setState` updates; single subscription point makes this easy to audit in one file | Dev |
| Live alerts silently dropped by `useAcknowledgeAlert`'s `invalidateQueries` | Was High before ADR-001 | High | ADR-001: live alerts never enter the React Query cache | Dev (resolved in design) |
| Browser tab backgrounding throttles `setInterval` timers in the mock WebSocket, making a live demo look "stalled" mid-presentation | Medium | Low (cosmetic during a live demo) | Keep the tab focused during the panel demo; the `LiveIndicator`'s "last update Ns ago" makes any real staleness visible rather than hidden | Dev |
| A live alert's `id` (`ws-alt-{timestamp}`) collides with a REST fixture id | Low (different id formats observed: `alt-00N` vs `ws-alt-{timestamp}`) | Low (dedup would hide one alert) | `dedupeById` runs regardless; monitored as a non-issue given the observed id schemes | Dev |
| Public repo accidentally exposes something sensitive | Low | Low | No secrets/env vars are introduced by this feature; nothing beyond public interview code is committed | Dev |

### Risk Monitoring
Given the single-session nature of this exercise, "monitoring" is: re-check the Risk table's mitigations are still true after each epic (especially ADR-001's cache-separation, since it's the one genuine correctness risk) rather than a recurring operational review.

---

## Final Sign-Off
- [x] Security reviewed (N/A items explicitly justified, input-validation boundary defined)
- [x] Performance targets defined and achievable (UI-scale, not server-scale; matches actual mock data volumes)
- [x] Deployment plan clear (commit-per-epic, revert-based rollback)
- [x] Observability in place (UI-surfaced errors + LiveIndicator, appropriate to a client-only demo)
- [x] Risks identified and mitigated (ADR-001 resolves the one real correctness risk; remaining risks are time/cosmetic)
