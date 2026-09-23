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
import type { NormalizedAlert } from "../lib/alerts";

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

export function Dashboard() {
  const { data: status, isLoading: statusLoading, isError: statusError } = useFactoryStatus();
  const { data: zones, isLoading: zonesLoading, isError: zonesError } = useZones();
  useAllMachines(); // wired in defensively per spec; its error must not blank the page
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

  const zoneViewModels = useMemo(() => {
    if (!zones) return [];
    const withCounts: ZoneHealthCardViewModel[] = zones.map((z) => ({
      zoneId: z.id,
      zoneName: z.name,
      health: z.health,
      machineCount: z.machineCount,
      criticalCount: zoneAlertCounts.get(z.id)?.critical ?? 0,
      warningCount: zoneAlertCounts.get(z.id)?.warning ?? 0,
    }));
    return sortZoneHealth(withCounts);
  }, [zones, zoneAlertCounts]);

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
            <StatTile
              label="Connection"
              value={statusLoading ? "" : status?.connected ? "Live" : "Disconnected"}
              badge={statusLoading ? undefined : status?.connected ? "Live" : "Disconnected"}
              colorScheme={status?.connected ? "green" : "red"}
              isLoading={statusLoading}
            />
            <StatTile
              label="Machines"
              value={status?.totalMachines ?? ""}
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
