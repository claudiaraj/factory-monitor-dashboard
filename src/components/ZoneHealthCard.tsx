import { Link as RouterLink } from "react-router-dom";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  HStack,
  Heading,
  LinkBox,
  LinkOverlay,
  Skeleton,
  SkeletonText,
  Text,
} from "@chakra-ui/react";
import type { Zone } from "../types";
import { healthColor, severityColor } from "../lib/status";

export interface ZoneHealthCardViewModel {
  zoneId: string;
  zoneName: string;
  health: Zone["health"]; // "healthy" | "degraded" | "faulted" — trusted as-is, never recomputed
  machineCount: number;
  criticalCount: number; // open (unacknowledged) critical alerts in this zone
  warningCount: number; // open (unacknowledged) warning alerts in this zone
}

export interface ZoneHealthCardProps {
  zone: ZoneHealthCardViewModel;
  isLoading?: boolean;
}

export function ZoneHealthCard({ zone, isLoading }: ZoneHealthCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton height="20px" width="120px" />
        </CardHeader>
        <CardBody>
          <SkeletonText noOfLines={2} spacing={4} />
        </CardBody>
      </Card>
    );
  }

  return (
    <LinkBox as={Card}>
      <CardHeader>
        <HStack justify="space-between">
          <Heading size="md">{zone.zoneName}</Heading>
          <Badge colorScheme={healthColor[zone.health]}>{zone.health.toUpperCase()}</Badge>
        </HStack>
      </CardHeader>
      <CardBody>
        <Text mb={2}>{zone.machineCount} machines</Text>
        <HStack spacing={2}>
          <Badge colorScheme={severityColor.critical}>{zone.criticalCount} critical</Badge>
          <Badge colorScheme={severityColor.warning}>{zone.warningCount} warning</Badge>
        </HStack>
      </CardBody>
      <LinkOverlay as={RouterLink} to={`/alerts?zone=${zone.zoneId}`} />
    </LinkBox>
  );
}
