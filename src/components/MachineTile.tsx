import { Box, Text, Tooltip } from "@chakra-ui/react";
import { machineStatusColor } from "../lib/status";
import type { Machine } from "../types";
import type { TelemetrySnapshot } from "../hooks/useLive";

interface MachineTileProps {
  machine: Machine;
  /** Only present when useLive.ts exists in the codebase; omit the prop entirely otherwise. */
  telemetrySnapshot?: TelemetrySnapshot;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

function TooltipLabel({ machine, telemetrySnapshot }: MachineTileProps): JSX.Element {
  if (!telemetrySnapshot) {
    return <Text>{machine.name}: No live data yet</Text>;
  }

  const { temperature, vibration, throughput, powerDraw } = telemetrySnapshot.telemetry;

  return (
    <Box>
      <Text fontWeight="bold">{machine.name}</Text>
      <Text>Temperature: {temperature}&deg;C</Text>
      <Text>Vibration: {vibration}</Text>
      <Text>Throughput: {throughput}</Text>
      <Text>Power draw: {powerDraw}W</Text>
      <Text fontSize="xs" color="gray.300">
        Updated {formatTimestamp(telemetrySnapshot.timestamp)}
      </Text>
    </Box>
  );
}

/**
 * A single machine's colored status tile with an optional hover tooltip
 * showing live telemetry. The tile color always comes from `machine.status`
 * (via `machineStatusColor`) — never from the telemetry snapshot, which has
 * no `status` field of its own.
 */
export function MachineTile({ machine, telemetrySnapshot }: MachineTileProps): JSX.Element {
  return (
    <Tooltip
      label={<TooltipLabel machine={machine} telemetrySnapshot={telemetrySnapshot} />}
      hasArrow
      placement="top"
    >
      <Box
        px={3}
        py={2}
        minW="110px"
        borderRadius="md"
        bg={`${machineStatusColor[machine.status]}.500`}
        color="white"
        fontSize="sm"
        fontWeight="medium"
        textAlign="center"
        cursor="default"
      >
        {machine.name}
      </Box>
    </Tooltip>
  );
}
