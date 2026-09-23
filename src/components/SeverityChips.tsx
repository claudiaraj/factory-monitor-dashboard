import { HStack, Tag, TagLabel, Text } from "@chakra-ui/react";
import type { Alert } from "../types";
import { severityColor } from "../lib/status";

export interface SeverityCounts {
  critical: number;
  warning: number;
  info: number;
}

export interface SeverityChipsProps {
  counts: SeverityCounts;
  active: Alert["severity"] | null; // null = no severity filter active
  onToggle: (severity: Alert["severity"]) => void; // parent clears the filter if the already-active severity is clicked again
}

const SEVERITIES: Alert["severity"][] = ["critical", "warning", "info"];

const SEVERITY_LABELS: Record<Alert["severity"], string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

export function SeverityChips({ counts, active, onToggle }: SeverityChipsProps): JSX.Element {
  return (
    <HStack spacing={2} role="group" aria-label="Filter alerts by severity" flexWrap="wrap">
      {SEVERITIES.map((severity, index) => {
        const isActive = active === severity;
        return (
          <HStack key={severity} spacing={2}>
            {index > 0 && (
              <Text aria-hidden="true" color="gray.400">
                &middot;
              </Text>
            )}
            <Tag
              as="button"
              type="button"
              size="lg"
              borderRadius="full"
              colorScheme={severityColor[severity]}
              variant={isActive ? "solid" : "subtle"}
              cursor="pointer"
              boxShadow={isActive ? "outline" : undefined}
              onClick={() => onToggle(severity)}
              aria-pressed={isActive}
            >
              <TagLabel>
                {SEVERITY_LABELS[severity]} {counts[severity]}
              </TagLabel>
            </Tag>
          </HStack>
        );
      })}
    </HStack>
  );
}
