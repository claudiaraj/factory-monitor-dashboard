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
