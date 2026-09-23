import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Container,
  Heading,
  HStack,
  Skeleton,
  SkeletonText,
  SimpleGrid,
  Text,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useMemo } from "react";
import { healthColor } from "../lib/status";
import { useAllMachines } from "../hooks/useAllMachines";
import { useZones } from "../hooks/useZones";
import { useLive } from "../hooks/useLive";
import { MachineTile } from "../components/MachineTile";
import type { Machine } from "../types";

function groupMachinesByZone(machines: Machine[] | undefined): Map<string, Machine[]> {
  const machinesByZoneId = new Map<string, Machine[]>();
  if (!machines) return machinesByZoneId;

  for (const machine of machines) {
    const existing = machinesByZoneId.get(machine.zoneId);
    if (existing) {
      existing.push(machine);
    } else {
      machinesByZoneId.set(machine.zoneId, [machine]);
    }
  }

  return machinesByZoneId;
}

function ZoneRegionSkeleton(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <Skeleton height="20px" width="140px" mb={2} />
        <Skeleton height="14px" width="80px" />
      </CardHeader>
      <CardBody pt={0}>
        <SkeletonText noOfLines={2} spacing={4} />
      </CardBody>
    </Card>
  );
}

export function Topology(): JSX.Element {
  const { data: zones, isLoading: zonesLoading, isError: zonesError } = useZones();
  const { machines, isLoading: machinesLoading, isError: machinesError } = useAllMachines();
  const { telemetry } = useLive();

  const machinesByZoneId = useMemo(() => groupMachinesByZone(machines), [machines]);

  const isLoading = zonesLoading || machinesLoading;
  const isError = zonesError || machinesError;

  return (
    <Container maxW="container.xl" py={6}>
      <Heading size="lg" mb={6}>
        Factory Topology
      </Heading>

      {isError && (
        <Text color="red.600" mb={4}>
          Unable to load factory topology right now. Please try again later.
        </Text>
      )}

      {isLoading && !isError && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {Array.from({ length: 4 }).map((_, index) => (
            <ZoneRegionSkeleton key={index} />
          ))}
        </SimpleGrid>
      )}

      {!isLoading && !isError && zones && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {zones.map((zone) => {
            const zoneMachines = machinesByZoneId.get(zone.id) ?? [];
            return (
              <Card key={zone.id}>
                <CardHeader pb={2}>
                  <HStack justifyContent="space-between">
                    <Heading size="md">{zone.name}</Heading>
                    <Badge colorScheme={healthColor[zone.health]}>
                      {zone.health.toUpperCase()}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="gray.500">
                    {zoneMachines.length} machine{zoneMachines.length === 1 ? "" : "s"}
                  </Text>
                </CardHeader>
                <CardBody pt={0}>
                  <Wrap>
                    {zoneMachines.map((machine) => (
                      <WrapItem key={machine.id}>
                        <MachineTile
                          machine={machine}
                          telemetrySnapshot={telemetry[machine.id]}
                        />
                      </WrapItem>
                    ))}
                  </Wrap>
                </CardBody>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </Container>
  );
}
