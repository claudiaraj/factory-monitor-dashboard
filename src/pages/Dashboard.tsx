import { useMemo } from "react";
import {
  Alert as ChakraAlert,
  AlertIcon,
  Container,
  Heading,
  SimpleGrid,
  Stack,
} from "@chakra-ui/react";
import { StatTile } from "../components/StatTile";
import { AttentionBanner } from "../components/AttentionBanner";
import { ZoneHealthCard, type ZoneHealthCardViewModel } from "../components/ZoneHealthCard";
import { useFactoryStatus } from "../hooks/useFactoryStatus";
import { useZones } from "../hooks/useZones";
import { useAllMachines } from "../hooks/useAllMachines";
import { useActiveAlerts } from "../hooks/useActiveAlerts";
import { useLiveFreshness } from "../hooks/useLiveFreshness";
import type { NormalizedAlert } from "../lib/alerts";
import type { Machine } from "../types";

const HEALTH_RANK: Record<ZoneHealthCardViewModel["health"], number> = {
  faulted: 0,
  degraded: 1,
  healthy: 2,
};

/** Sorts zone view-models faulted > degraded > healthy, then criticalCount desc, then warningCount desc, then zoneName asc. */
function sortZoneHealth(zones: ZoneHealthCardViewModel[]): ZoneHealthCardViewModel[] {
  return [...zones].sort((a, b) => {
    const healthDelta = HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
    if (healthDelta !== 0) return healthDelta;

    const criticalDelta = b.criticalCount - a.criticalCount;
    if (criticalDelta !== 0) return criticalDelta;

    const warningDelta = b.warningCount - a.warningCount;
    if (warningDelta !== 0) return warningDelta;

    return a.zoneName.localeCompare(b.zoneName);
  });
}

/** Groups an already-fetched, unfiltered NormalizedAlert[] into a Map<zoneId, {critical: number; warning: number}> counting only unacknowledged critical/warning alerts. */
function countOpenAlertsByZone(
  alerts: NormalizedAlert[]
): Map<string, { critical: number; warning: number }> {
  const counts = new Map<string, { critical: number; warning: number }>();
  for (const alert of alerts) {
    if (alert.acknowledged) continue;
    if (alert.severity !== "critical" && alert.severity !== "warning") continue;

    const entry = counts.get(alert.zoneId) ?? { critical: 0, warning: 0 };
    if (alert.severity === "critical") entry.critical++;
    else entry.warning++;
    counts.set(alert.zoneId, entry);
  }
  return counts;
}

const STATUS_ORDER: Machine["status"][] = ["running", "error", "maintenance", "idle"];

/** "10 running · 2 error · 1 maintenance · 1 idle", skipping zero counts. */
function summarizeMachineStatus(machines: Machine[]): string {
  const counts = new Map<Machine["status"], number>();
  for (const m of machines) counts.set(m.status, (counts.get(m.status) ?? 0) + 1);
  return STATUS_ORDER.filter((s) => counts.get(s))
    .map((s) => `${counts.get(s)} ${s}`)
    .join(" · ");
}

/**
 * Connection = REST says connected AND the WebSocket feed is fresh. Its own
 * component so the 1s freshness tick re-renders this tile, not the page.
 */
function ConnectionStatTile({
  apiConnected,
  isLoading,
}: {
  apiConnected: boolean | undefined;
  isLoading: boolean;
}) {
  const { state, secondsAgo } = useLiveFreshness();

  const [label, colorScheme] = !apiConnected
    ? ["Disconnected", "red"]
    : state === "live"
      ? ["Live", "green"]
      : state === "stale"
        ? ["Stale", "orange"]
        : ["Connecting", "gray"];

  return (
    <StatTile
      label="Connection"
      value={label}
      badge={label}
      colorScheme={colorScheme}
      helpText={secondsAgo === null ? "Waiting for live data" : `Last update ${secondsAgo}s ago`}
      isLoading={isLoading}
    />
  );
}

export function Dashboard() {
  const { data: status, isLoading: statusLoading, isError: statusError } = useFactoryStatus();
  const { data: zones, isLoading: zonesLoading, isError: zonesError } = useZones();
  // Its error must not blank the page — tiles fall back to the zone/status API values.
  const { machines } = useAllMachines();
  const { alerts, isLoading: alertsLoading } = useActiveAlerts(); // UNFILTERED — single call

  const zoneAlertCounts = useMemo(() => countOpenAlertsByZone(alerts ?? []), [alerts]);

  const attentionCounts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    for (const a of alerts ?? []) {
      if (a.acknowledged) continue;
      if (a.severity === "critical") critical++;
      else if (a.severity === "warning") warning++;
    }
    return { critical, warning };
  }, [alerts]);

  // zones.json's machineCount has drifted from reality (Painting says 4, has 3),
  // so count real machines once they've loaded — same source Topology uses.
  const machineCountByZone = useMemo(() => {
    if (!machines) return null;
    const counts = new Map<string, number>();
    for (const m of machines) counts.set(m.zoneId, (counts.get(m.zoneId) ?? 0) + 1);
    return counts;
  }, [machines]);

  const zoneViewModels = useMemo(() => {
    if (!zones) return [];
    const withCounts: ZoneHealthCardViewModel[] = zones.map((z) => ({
      zoneId: z.id,
      zoneName: z.name,
      health: z.health,
      machineCount: machineCountByZone ? machineCountByZone.get(z.id) ?? 0 : z.machineCount,
      criticalCount: zoneAlertCounts.get(z.id)?.critical ?? 0,
      warningCount: zoneAlertCounts.get(z.id)?.warning ?? 0,
    }));
    return sortZoneHealth(withCounts);
  }, [zones, zoneAlertCounts, machineCountByZone]);

  const zoneGridLoading = zonesLoading || alertsLoading;

  return (
    <Container maxW="container.xl" py={6}>
      <Stack spacing={6}>
        {statusError ? (
          <ChakraAlert status="error" borderRadius="md">
            <AlertIcon />
            Failed to load factory status.
          </ChakraAlert>
        ) : (
          <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
            <ConnectionStatTile apiConnected={status?.connected} isLoading={statusLoading} />
            <StatTile
              label="Machines"
              value={machines?.length ?? status?.totalMachines ?? ""}
              helpText={machines ? summarizeMachineStatus(machines) : undefined}
              isLoading={statusLoading}
            />
            <StatTile label="Zones" value={status?.zoneCount ?? ""} isLoading={statusLoading} />
            <StatTile
              label="Uptime"
              value={status ? `${status.uptimeHours}h` : ""}
              isLoading={statusLoading}
            />
          </SimpleGrid>
        )}

        <AttentionBanner
          criticalCount={attentionCounts.critical}
          warningCount={attentionCounts.warning}
          isClear={attentionCounts.critical === 0 && attentionCounts.warning === 0}
          isLoading={alertsLoading}
        />

        <Stack spacing={4}>
          <Heading size="md">Zone Health</Heading>
          {zonesError ? (
            <ChakraAlert status="error" borderRadius="md">
              <AlertIcon />
              Failed to load zone health.
            </ChakraAlert>
          ) : (
            <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
              {zoneGridLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <ZoneHealthCard
                      key={i}
                      isLoading
                      zone={{
                        zoneId: "",
                        zoneName: "",
                        health: "healthy",
                        machineCount: 0,
                        criticalCount: 0,
                        warningCount: 0,
                      }}
                    />
                  ))
                : zoneViewModels.map((zone) => <ZoneHealthCard key={zone.zoneId} zone={zone} />)}
            </SimpleGrid>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
