import { Box, Button, ButtonGroup, FormControl, FormLabel, HStack, Input, Select, Switch, Text } from "@chakra-ui/react";
import type { Zone } from "../types";

export interface AlertsFilterBarProps {
  zones: Zone[];
  zone: string; // "" = all zones
  onZoneChange: (zoneId: string) => void;
  showAcknowledged: boolean;
  onShowAcknowledgedChange: (value: boolean) => void;
  hiddenAcknowledgedCount: number; // FR-009: count of acked alerts currently hidden by the toggle
  view: "grouped" | "flat";
  onViewChange: (view: "grouped" | "flat") => void;
  // Could-priority, optional — wired up only if Task 6 is reached; omit entirely otherwise.
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export function AlertsFilterBar({
  zones,
  zone,
  onZoneChange,
  showAcknowledged,
  onShowAcknowledgedChange,
  hiddenAcknowledgedCount,
  view,
  onViewChange,
  searchQuery,
  onSearchChange,
}: AlertsFilterBarProps): JSX.Element {
  return (
    <Box>
      <HStack spacing={6} align="flex-end" flexWrap="wrap" rowGap={4}>
        <FormControl width="auto" minW="180px">
          <FormLabel fontSize="sm" mb={1}>
            Zone
          </FormLabel>
          <Select size="sm" value={zone} onChange={(e) => onZoneChange(e.target.value)} aria-label="Filter by zone">
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </FormControl>

        {onSearchChange && (
          <FormControl width="auto" minW="220px">
            <FormLabel fontSize="sm" mb={1}>
              Search
            </FormLabel>
            <Input
              size="sm"
              placeholder="Machine, message, or zone"
              value={searchQuery ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search alerts"
            />
          </FormControl>
        )}

        <FormControl display="flex" alignItems="center" width="auto">
          <Switch
            id="show-acknowledged"
            isChecked={showAcknowledged}
            onChange={(e) => onShowAcknowledgedChange(e.target.checked)}
            mr={2}
          />
          <FormLabel htmlFor="show-acknowledged" mb={0} fontSize="sm" whiteSpace="nowrap">
            Show acknowledged
            {!showAcknowledged && hiddenAcknowledgedCount > 0 && (
              <Text as="span" color="gray.500">
                {" "}
                ({hiddenAcknowledgedCount} hidden)
              </Text>
            )}
          </FormLabel>
        </FormControl>

        <ButtonGroup size="sm" isAttached variant="outline" aria-label="Switch between grouped and flat view">
          <Button
            onClick={() => onViewChange("grouped")}
            variant={view === "grouped" ? "solid" : "outline"}
            colorScheme={view === "grouped" ? "blue" : undefined}
            aria-pressed={view === "grouped"}
          >
            Grouped
          </Button>
          <Button
            onClick={() => onViewChange("flat")}
            variant={view === "flat" ? "solid" : "outline"}
            colorScheme={view === "flat" ? "blue" : undefined}
            aria-pressed={view === "flat"}
          >
            Flat
          </Button>
        </ButtonGroup>
      </HStack>
    </Box>
  );
}
