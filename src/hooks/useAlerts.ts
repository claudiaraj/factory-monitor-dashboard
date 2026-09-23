import { useQuery } from "@tanstack/react-query";
import type { Alert } from "../types";

export function useAlerts(filters?: { severity?: string; zone?: string }) {
  const params = new URLSearchParams();
  if (filters?.severity) params.set("severity", filters.severity);
  if (filters?.zone) params.set("zone", filters.zone);

  return useQuery<Alert[]>({
    queryKey: ["alerts", filters],
    queryFn: async () => {
      const response = await fetch(`/api/alerts?${params}`);
      if (!response.ok) throw new Error("Failed to fetch alerts");
      return response.json();
    },
  });
}
