import { useQuery } from "@tanstack/react-query";
import type { FactoryStatus } from "../types";

export function useFactoryStatus() {
  return useQuery<FactoryStatus>({
    queryKey: ["factory", "status"],
    queryFn: async () => {
      const response = await fetch("/api/factory/status");
      if (!response.ok) throw new Error("Failed to fetch factory status");
      return response.json();
    },
    refetchInterval: 30000,
  });
}
