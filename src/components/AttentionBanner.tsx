import { Link as RouterLink } from "react-router-dom";
import {
  Alert as ChakraAlert,
  AlertIcon,
  Button,
  Skeleton,
  Text,
} from "@chakra-ui/react";

export interface AttentionBannerProps {
  criticalCount: number;
  warningCount: number;
  /** True when there is nothing to show (criticalCount === 0 && warningCount === 0). */
  isClear: boolean;
  isLoading?: boolean;
  href?: string; // default "/alerts"
}

export function AttentionBanner({
  criticalCount,
  warningCount,
  isClear,
  isLoading,
  href = "/alerts",
}: AttentionBannerProps) {
  if (isLoading) {
    return <Skeleton height="60px" width="100%" borderRadius="md" />;
  }

  if (isClear) {
    return (
      <ChakraAlert status="success" borderRadius="md">
        <AlertIcon />
        <Text>All clear — no active critical or warning alerts.</Text>
      </ChakraAlert>
    );
  }

  return (
    <ChakraAlert
      status={criticalCount > 0 ? "error" : "warning"}
      borderRadius="md"
      justifyContent="space-between"
    >
      <AlertIcon />
      <Text flex="1">
        {criticalCount} critical · {warningCount} warning unacknowledged
      </Text>
      <Button as={RouterLink} to={href} size="sm" ml={4}>
        View alerts
      </Button>
    </ChakraAlert>
  );
}
