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
