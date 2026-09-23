# Q&A Log — Factory Monitor Dashboard

## MonkeyPlan (planning phase)

**Q:** What's the goal of this session right now?
**A:** This IS the live 90-minute session.

**Q:** Given 90 minutes total, how do you want to balance the 5 asks (Overview, Active Problems, Zone Health, Real-Time, Topology)?
**A:** Depth-first on core 3 (Overview + Active Problems + Zone Health with real polish; Real-Time and Topology only if time remains).

**Q (from PM, relayed by user):** "NO OF ALERTS avg would be around 20 and bad day around 50+ best way to handle that smartly is the only addition."
**A:** Incorporated as S11 / FR-019–FR-024 in the PRT: severity summary chips, group-by-machine as the default view, bulk acknowledge, collapsed info section, stable ordering during live updates, and search (Could). Verified against the actual `alerts-50.json` stress fixture: 50 alerts across 14 machines, 10 critical / 21 warning / 19 info, 32 unacknowledged.

## MonkeyMode (build phase)

**Q:** How do you want me to execute now that the plan is approved — fast direct build, or the full MonkeyMode pipeline (Design → Stories → Acceptance Checklist → Code Specs → parallel test-writer/implementer subagents → Verification → Integration → Acceptance, with approval after every phase)?
**A:** Full MonkeyMode pipeline — proceeding with all phases despite the 90-minute constraint; user was warned this is unlikely to finish in the live-session window and chose to run it anyway.

**Q:** Save a Q&A log during MonkeyMode?
**A:** Yes.

**Q (Phase 2 discovery, required by the skill):** "Which components need to communicate?"
**A:** Already answered by Phase 1B Part 3 — reused rather than re-asked. Boundaries: `lib/status.ts`+`lib/alerts.ts` (pure, no deps) → `useAllMachines` and `LiveProvider`/`useLive` (each independent, existing-hook-only deps) → `useActiveAlerts` (the seam, depends on the two prior) → Dashboard/Alerts/Topology pages (leaves, depend on the seam). Decomposed into 7 stories across 3 sequential batches (documented dependency, not fake parallelism) per the phase guide's own escape hatch for genuinely layered features.
