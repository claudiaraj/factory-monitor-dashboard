import { Box, HStack, Text } from "@chakra-ui/react";
import { useLiveFreshness, type LiveFeedState } from "../hooks/useLiveFreshness";

const DOT_COLOR: Record<LiveFeedState, string> = {
  waiting: "gray.400",
  live: "green.400",
  stale: "orange.400",
};

/** Nav-bar status of the live feed, visible on every page. */
export function LiveIndicator(): JSX.Element {
  const { state, secondsAgo } = useLiveFreshness();

  const label =
    state === "waiting"
      ? "Connecting…"
      : state === "stale"
        ? `Stale · last update ${secondsAgo}s ago`
        : `Live · updated ${secondsAgo}s ago`;

  return (
    <HStack spacing={2} aria-live="polite">
      <Box w={2} h={2} borderRadius="full" bg={DOT_COLOR[state]} />
      <Text fontSize="sm" color="whiteAlpha.800" whiteSpace="nowrap">
        {label}
      </Text>
    </HStack>
  );
}
