import { useQuery } from "@tanstack/react-query";
import type { Zone } from "../types";

export function useZones() {
  return useQuery<Zone[]>({
    queryKey: ["zones"],
    queryFn: async () => {
      const response = await fetch("/api/zones");
      if (!response.ok) throw new Error("Failed to fetch zones");
      return response.json();
    },
  });
}
