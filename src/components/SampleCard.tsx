/**
 * SampleCard — A working example showing common Chakra UI patterns.
 *
 * Use this as a reference for how to build card components.
 * You can delete this file — it's not used by the app.
 */
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  Skeleton,
  SkeletonText,
  Text,
} from "@chakra-ui/react";

interface SampleCardProps {
  title: string;
  value: string | number;
  status: "good" | "warning" | "bad";
  isLoading?: boolean;
}

const statusColors = {
  good: "green",
  warning: "yellow",
  bad: "red",
};

export function SampleCard({ title, value, status, isLoading }: SampleCardProps) {
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
    <Card>
      <CardHeader>
        <HStack justifyContent="space-between">
          <Heading size="md">{title}</Heading>
          <Badge colorScheme={statusColors[status]}>{status.toUpperCase()}</Badge>
        </HStack>
      </CardHeader>
      <CardBody>
        <Text fontSize="2xl" fontWeight="bold">
          {value}
        </Text>
      </CardBody>
    </Card>
  );
}
