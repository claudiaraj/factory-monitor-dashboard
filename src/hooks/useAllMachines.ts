import { useQueries } from "@tanstack/react-query";
import type { Machine } from "../types";
import { useZones } from "./useZones";

export function useAllMachines(): {
  machines: Machine[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const {
    data: zones,
    isLoading: zonesLoading,
    isError: zonesError,
  } = useZones();

  const machineQueries = useQueries({
    queries: (zones ?? []).map((zone) => ({
      queryKey: ["machines", zone.id] as const,
      queryFn: async (): Promise<Machine[]> => {
        const response = await fetch(`/api/zones/${zone.id}/machines`);
        if (!response.ok) throw new Error("Failed to fetch machines");
        return response.json();
      },
      enabled: !!zones,
    })),
  });

  const isLoading =
    zonesLoading || (!!zones && machineQueries.some((q) => q.isLoading));
  const isError = zonesError || machineQueries.some((q) => q.isError);

  const machines =
    !zones || machineQueries.some((q) => !q.data)
      ? undefined
      : machineQueries.flatMap((q) => q.data as Machine[]);

  return { machines, isLoading, isError };
}
