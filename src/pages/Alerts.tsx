import { useMemo, useRef, useState } from "react";
import {
  Alert as ChakraAlert,
  AlertIcon,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Container,
  Heading,
  Skeleton,
  SkeletonText,
  Text,
  VStack,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useSearchParams } from "react-router-dom";
import { groupByMachine } from "../lib/alerts";
import { useActiveAlerts } from "../hooks/useActiveAlerts";
import { useZones } from "../hooks/useZones";
import { SeverityChips, type SeverityCounts } from "../components/SeverityChips";
import { AlertsFilterBar } from "../components/AlertsFilterBar";
import { MachineAlertGroupCard } from "../components/MachineAlertGroupCard";
import { AlertsTable } from "../components/AlertsTable";
import type { Alert } from "../types";

export function Alerts(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const zoneParam = searchParams.get("zone") ?? "";

  const [severityFilter, setSeverityFilter] = useState<Alert["severity"] | null>(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [view, setView] = useState<"grouped" | "flat">("grouped");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAckId, setPendingAckId] = useState<string | null>(null);
  const [bulkAckGroupId, setBulkAckGroupId] = useState<string | null>(null);
  const [bulkAckShownPending, setBulkAckShownPending] = useState(false);

  const toast = useToast();
  const { data: zones } = useZones();
  const { alerts: zoneAlerts, isLoading, isError, bulkAcknowledge } =
    useActiveAlerts({ zone: zoneParam || undefined });
  // Single-row acknowledge deliberately calls bulkAcknowledge([id]) rather than the hook's
  // fire-and-forget `acknowledge(id)`: bulkAcknowledge is the only primitive in the Story 4
  // contract that returns a real per-call {succeeded, failed} result, so it's reused here to
  // get an accurate success/error toast instead of guessing from the global `acknowledgePending`
  // boolean. No change to Story 4's approved contract was needed.

  // Chip counts: zone- and ack-toggle-filtered (so a chip never counts alerts the list is hiding),
  // but NOT severity/search-filtered — so clicking a chip is meaningful.
  const severityCounts: SeverityCounts = useMemo(() => {
    const counted = showAcknowledged ? zoneAlerts : zoneAlerts.filter((a) => !a.acknowledged);
    return {
      critical: counted.filter((a) => a.severity === "critical").length,
      warning: counted.filter((a) => a.severity === "warning").length,
      info: counted.filter((a) => a.severity === "info").length,
    };
  }, [zoneAlerts, showAcknowledged]);

  const severityFiltered = useMemo(
    () => (severityFilter ? zoneAlerts.filter((a) => a.severity === severityFilter) : zoneAlerts),
    [zoneAlerts, severityFilter]
  );

  const searchFiltered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return severityFiltered;
    return severityFiltered.filter(
      (a) =>
        a.machineName.toLowerCase().includes(query) ||
        a.message.toLowerCase().includes(query) ||
        a.zoneName.toLowerCase().includes(query)
    );
  }, [severityFiltered, searchQuery]);

  const hiddenAcknowledgedCount = useMemo(
    () => searchFiltered.filter((a) => a.acknowledged).length,
    [searchFiltered]
  );

  const visible = useMemo(
    () => (showAcknowledged ? searchFiltered : searchFiltered.filter((a) => !a.acknowledged)),
    [searchFiltered, showAcknowledged]
  );

  const groups = useMemo(() => groupByMachine(visible), [visible]);

  function handleZoneChange(zoneId: string) {
    const next = new URLSearchParams(searchParams);
    if (zoneId) next.set("zone", zoneId);
    else next.delete("zone");
    setSearchParams(next);
  }

  function handleToggleSeverity(sev: Alert["severity"]) {
    setSeverityFilter((prev) => (prev === sev ? null : sev));
  }

  async function handleAcknowledge(id: string) {
    setPendingAckId(id);
    const { succeeded } = await bulkAcknowledge([id]);
    setPendingAckId(null);
    toast(
      succeeded.includes(id)
        ? { title: "Alert acknowledged", status: "success", duration: 3000 }
        : { title: "Couldn't acknowledge alert", status: "error", duration: 4000 }
    );
  }

  async function runBulkAck(ids: string[], onDone: () => void) {
    const { succeeded, failed } = await bulkAcknowledge(ids);
    onDone();
    toast({
      title:
        failed.length === 0
          ? `${succeeded.length} of ${ids.length} acknowledged`
          : `${succeeded.length} of ${ids.length} acknowledged, ${failed.length} failed`,
      status: failed.length === 0 ? "success" : "warning",
      duration: 4000,
    });
  }

  function handleAcknowledgeGroup(machineId: string, ids: string[]) {
    setBulkAckGroupId(machineId);
    void runBulkAck(ids, () => setBulkAckGroupId(null));
  }

  const confirm = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const unackedShown = visible.filter((a) => !a.acknowledged);

  function handleAcknowledgeAllShown() {
    const ids = unackedShown.map((a) => a.id);
    confirm.onClose();
    setBulkAckShownPending(true);
    void runBulkAck(ids, () => setBulkAckShownPending(false));
  }

  return (
    <Container maxW="container.xl" py={6}>
      <VStack align="stretch" spacing={6}>
        <Box>
          <Heading size="lg" mb={1}>
            Alerts
          </Heading>
          <Text color="gray.600">
            {zoneAlerts.filter((a) => !a.acknowledged).length} unacknowledged alert
            {zoneAlerts.filter((a) => !a.acknowledged).length === 1 ? "" : "s"}
          </Text>
        </Box>

        <SeverityChips counts={severityCounts} active={severityFilter} onToggle={handleToggleSeverity} />

        <AlertsFilterBar
          zones={zones ?? []}
          zone={zoneParam}
          onZoneChange={handleZoneChange}
          showAcknowledged={showAcknowledged}
          onShowAcknowledgedChange={setShowAcknowledged}
          hiddenAcknowledgedCount={hiddenAcknowledgedCount}
          view={view}
          onViewChange={setView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <Box>
          <Button
            size="sm"
            onClick={confirm.onOpen}
            isLoading={bulkAckShownPending}
            isDisabled={bulkAckShownPending || unackedShown.length === 0}
          >
            Acknowledge all shown ({unackedShown.length})
          </Button>
        </Box>

        <AlertDialog isOpen={confirm.isOpen} leastDestructiveRef={cancelRef} onClose={confirm.onClose}>
          <AlertDialogOverlay>
            <AlertDialogContent>
              <AlertDialogHeader fontSize="lg" fontWeight="bold">
                Acknowledge all shown alerts
              </AlertDialogHeader>
              <AlertDialogBody>
                This will acknowledge {unackedShown.length} alert{unackedShown.length === 1 ? "" : "s"} currently
                visible under the active filters. This can't be undone.
              </AlertDialogBody>
              <AlertDialogFooter>
                <Button ref={cancelRef} onClick={confirm.onClose}>
                  Cancel
                </Button>
                <Button colorScheme="blue" onClick={handleAcknowledgeAllShown} ml={3}>
                  Acknowledge all
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>

        {isLoading ? (
          <AlertsSkeleton />
        ) : isError ? (
          <ChakraAlert status="error" borderRadius="md">
            <AlertIcon />
            Couldn't load alerts.
          </ChakraAlert>
        ) : visible.length === 0 ? (
          <EmptyState hasAnyAlerts={zoneAlerts.length > 0} />
        ) : view === "grouped" ? (
          <VStack align="stretch" spacing={4}>
            {groups.map((group) => (
              <MachineAlertGroupCard
                key={group.machineId}
                group={group}
                onAcknowledge={handleAcknowledge}
                onAcknowledgeAll={(ids) => handleAcknowledgeGroup(group.machineId, ids)}
                pendingAckId={pendingAckId}
                bulkAckPending={bulkAckGroupId === group.machineId}
                defaultExpanded={group.worstSeverity === "critical"}
              />
            ))}
          </VStack>
        ) : (
          <AlertsTable alerts={visible} onAcknowledge={handleAcknowledge} pendingAckId={pendingAckId} />
        )}
      </VStack>
    </Container>
  );
}

function AlertsSkeleton(): JSX.Element {
  return (
    <VStack align="stretch" spacing={4}>
      {[0, 1, 2].map((i) => (
        <Box key={i} borderWidth="1px" borderRadius="md" p={4}>
          <Skeleton height="20px" width="200px" mb={3} />
          <SkeletonText noOfLines={2} spacing={3} />
        </Box>
      ))}
    </VStack>
  );
}

function EmptyState({ hasAnyAlerts }: { hasAnyAlerts: boolean }): JSX.Element {
  return (
    <ChakraAlert status="success" borderRadius="md">
      <AlertIcon />
      <Text>
        {hasAnyAlerts ? "No alerts match the current filters." : "No active problems — all clear."}
      </Text>
    </ChakraAlert>
  );
}
