import type { ReactNode } from "react";
import {
  Badge,
  Card,
  CardBody,
  Skeleton,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  HStack,
} from "@chakra-ui/react";

export interface StatTileProps {
  label: string;
  value: string | number;
  /** Optional colorScheme override for the value/badge (e.g. "green" for Connected=Live, "red" for Disconnected). */
  colorScheme?: string;
  /** Optional small badge text shown next to the label (e.g. "Live" / "Disconnected"). */
  badge?: string;
  helpText?: ReactNode;
  isLoading?: boolean;
}

export function StatTile({ label, value, colorScheme, badge, helpText, isLoading }: StatTileProps) {
  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <Skeleton height="16px" width="80px" mb={3} />
          <Skeleton height="28px" width="60px" />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <Stat>
          <HStack justify="space-between" align="center">
            <StatLabel>{label}</StatLabel>
            {badge && <Badge colorScheme={colorScheme}>{badge}</Badge>}
          </HStack>
          <StatNumber color={colorScheme ? `${colorScheme}.600` : undefined}>{value}</StatNumber>
          {helpText && <StatHelpText>{helpText}</StatHelpText>}
        </Stat>
      </CardBody>
    </Card>
  );
}
