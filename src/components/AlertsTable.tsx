import { useState } from "react";
import { Badge, Button, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr } from "@chakra-ui/react";
import { formatRelativeTime, type NormalizedAlert } from "../lib/alerts";
import { severityColor } from "../lib/status";

export interface AlertsTableProps {
  alerts: NormalizedAlert[]; // fully filtered (zone/severity/search/show-acked) and sorted; may include info-severity alerts
  onAcknowledge: (id: string) => void;
  pendingAckId: string | null;
  collapseInfo?: boolean; // default true
}

const COLUMN_COUNT = 6;

export function AlertsTable({ alerts, onAcknowledge, pendingAckId, collapseInfo = true }: AlertsTableProps): JSX.Element {
  const [showInfo, setShowInfo] = useState(false);

  const infoAlerts = collapseInfo ? alerts.filter((a) => a.severity === "info") : [];
  const primaryAlerts = collapseInfo ? alerts.filter((a) => a.severity !== "info") : alerts;

  return (
    <TableContainer>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Severity</Th>
            <Th>Machine</Th>
            <Th>Zone</Th>
            <Th>Message</Th>
            <Th>Time</Th>
            <Th>Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {primaryAlerts.map((alert) => (
            <AlertTableRow key={alert.id} alert={alert} onAcknowledge={onAcknowledge} pendingAckId={pendingAckId} />
          ))}
          {collapseInfo && infoAlerts.length > 0 && (
            <Tr>
              <Td colSpan={COLUMN_COUNT}>
                <Button
                  size="xs"
                  variant="link"
                  onClick={() => setShowInfo((v) => !v)}
                  aria-expanded={showInfo}
                >
                  {infoAlerts.length} info alert{infoAlerts.length === 1 ? "" : "s"}, {showInfo ? "hide" : "show"}
                </Button>
              </Td>
            </Tr>
          )}
          {collapseInfo &&
            showInfo &&
            infoAlerts.map((alert) => (
              <AlertTableRow key={alert.id} alert={alert} onAcknowledge={onAcknowledge} pendingAckId={pendingAckId} />
            ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}

interface AlertTableRowProps {
  alert: NormalizedAlert;
  onAcknowledge: (id: string) => void;
  pendingAckId: string | null;
}

function AlertTableRow({ alert, onAcknowledge, pendingAckId }: AlertTableRowProps): JSX.Element {
  return (
    <Tr>
      <Td>
        <Badge colorScheme={severityColor[alert.severity]} textTransform="capitalize">
          {alert.severity}
        </Badge>
      </Td>
      <Td>{alert.machineName}</Td>
      <Td>{alert.zoneName}</Td>
      <Td maxW="sm">
        <Text noOfLines={2}>{alert.message}</Text>
      </Td>
      <Td whiteSpace="nowrap">{formatRelativeTime(alert.timestamp)}</Td>
      <Td>
        {alert.acknowledged ? (
          <Badge colorScheme="gray">Acknowledged</Badge>
        ) : (
          <Button
            size="xs"
            onClick={() => onAcknowledge(alert.id)}
            isLoading={pendingAckId === alert.id}
            isDisabled={pendingAckId !== null && pendingAckId !== alert.id}
          >
            Acknowledge
          </Button>
        )}
      </Td>
    </Tr>
  );
}
