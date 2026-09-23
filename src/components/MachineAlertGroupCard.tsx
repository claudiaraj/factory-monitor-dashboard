import { useState } from "react";
import { Badge, Box, Button, Card, CardBody, CardHeader, Collapse, HStack, Text, VStack } from "@chakra-ui/react";
import { formatRelativeTime, type MachineAlertGroup, type NormalizedAlert } from "../lib/alerts";
import { severityColor } from "../lib/status";

export interface MachineAlertGroupCardProps {
  group: MachineAlertGroup;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: (ids: string[]) => void; // parent owns the bulkAcknowledge call + summary toast
  pendingAckId: string | null; // id of the single-row ack currently in flight, or null
  bulkAckPending: boolean; // true while THIS group's "Acknowledge all" is in flight
  defaultExpanded?: boolean; // default false — group detail starts collapsed
}

export function MachineAlertGroupCard({
  group,
  onAcknowledge,
  onAcknowledgeAll,
  pendingAckId,
  bulkAckPending,
  defaultExpanded = false,
}: MachineAlertGroupCardProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showInfo, setShowInfo] = useState(false);

  const infoAlerts = group.alerts.filter((a) => a.severity === "info");
  const primaryAlerts = group.alerts.filter((a) => a.severity !== "info");
  const unacknowledgedIds = group.alerts.filter((a) => !a.acknowledged).map((a) => a.id);

  return (
    <Card>
      <CardHeader>
        <HStack justify="space-between" flexWrap="wrap" rowGap={2} spacing={3}>
          <HStack spacing={3} align="center">
            <Badge colorScheme={severityColor[group.worstSeverity]} textTransform="capitalize">
              {group.worstSeverity}
            </Badge>
            <Box>
              <Text fontWeight="semibold">{group.machineName}</Text>
              <Text fontSize="sm" color="gray.500">
                {group.zoneName}
              </Text>
            </Box>
          </HStack>
          <HStack spacing={3}>
            <Text fontSize="sm" color="gray.600" whiteSpace="nowrap">
              {group.unacknowledgedCount} unacknowledged
            </Text>
            <Button
              size="sm"
              onClick={() => onAcknowledgeAll(unacknowledgedIds)}
              isLoading={bulkAckPending}
              isDisabled={unacknowledgedIds.length === 0 || bulkAckPending}
            >
              Acknowledge all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded((v) => !v)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? "Collapse ▴" : "Expand ▾"}
            </Button>
          </HStack>
        </HStack>
      </CardHeader>
      <Collapse in={isExpanded} animateOpacity>
        <CardBody pt={0}>
          <VStack align="stretch" spacing={0}>
            {primaryAlerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onAcknowledge={onAcknowledge} pendingAckId={pendingAckId} />
            ))}
          </VStack>
          {infoAlerts.length > 0 && (
            <Box mt={2}>
              <Button
                size="xs"
                variant="link"
                onClick={() => setShowInfo((v) => !v)}
                aria-expanded={showInfo}
              >
                {infoAlerts.length} info alert{infoAlerts.length === 1 ? "" : "s"}, {showInfo ? "hide" : "show"}
              </Button>
              <Collapse in={showInfo} animateOpacity>
                <VStack align="stretch" spacing={0} mt={2}>
                  {infoAlerts.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} onAcknowledge={onAcknowledge} pendingAckId={pendingAckId} />
                  ))}
                </VStack>
              </Collapse>
            </Box>
          )}
        </CardBody>
      </Collapse>
    </Card>
  );
}

interface AlertRowProps {
  alert: NormalizedAlert;
  onAcknowledge: (id: string) => void;
  pendingAckId: string | null;
}

function AlertRow({ alert, onAcknowledge, pendingAckId }: AlertRowProps): JSX.Element {
  return (
    <HStack justify="space-between" py={2} borderBottomWidth="1px" _last={{ borderBottomWidth: 0 }} align="start" spacing={4}>
      <HStack align="start" spacing={3} flex="1" minW={0}>
        <Badge colorScheme={severityColor[alert.severity]} textTransform="capitalize">
          {alert.severity}
        </Badge>
        <Box minW={0}>
          <Text fontSize="sm">{alert.message}</Text>
          <Text fontSize="xs" color="gray.500">
            {formatRelativeTime(alert.timestamp)}
          </Text>
        </Box>
      </HStack>
      {alert.acknowledged ? (
        <Badge colorScheme="gray" flexShrink={0}>
          Acknowledged
        </Badge>
      ) : (
        <Button
          size="xs"
          flexShrink={0}
          onClick={() => onAcknowledge(alert.id)}
          isLoading={pendingAckId === alert.id}
          isDisabled={pendingAckId !== null && pendingAckId !== alert.id}
        >
          Acknowledge
        </Button>
      )}
    </HStack>
  );
}
