import { useCallback, useMemo } from "react";
import type { Alert } from "../types";
import { normalizeAlert, sortAlerts, dedupeById, type NormalizedAlert } from "../lib/alerts";
import { useLive } from "./useLive";
import { useAlerts } from "./useAlerts";
import { useAcknowledgeAlert } from "./useAcknowledgeAlert";
import { useZones } from "./useZones";

export interface UseActiveAlertsFilters {
  severity?: Alert["severity"];
  zone?: string;
}

export interface UseActiveAlertsResult {
  alerts: NormalizedAlert[];
  isLoading: boolean;
  isError: boolean;
  acknowledge: (id: string) => void;
  acknowledgePending: boolean;
  bulkAcknowledge: (ids: string[]) => Promise<{ succeeded: string[]; failed: string[] }>;
}

/** Live alert ids are minted by the mock WS server with this prefix (see
 * design/1b-contracts.md); REST alert ids never use it. Routing acknowledge()
 * on this prefix is what keeps a live-only alert from ever hitting the REST
 * acknowledge endpoint (which would 404, per ADR-001). */
const LIVE_ID_PREFIX = "ws-alt-";

export function useActiveAlerts(filters?: UseActiveAlertsFilters): UseActiveAlertsResult {
  const { data: zones } = useZones();
  const zoneById = useMemo(
    () => new Map((zones ?? []).map((z) => [z.id, z])),
    [zones]
  );

  const { data: restAlerts, isLoading, isError } = useAlerts(filters);
  const { liveAlerts, localAckIds, acknowledgeLocal } = useLive();
  const { mutate, mutateAsync, isPending } = useAcknowledgeAlert();

  const alerts = useMemo(() => {
    const normalizedRest = (restAlerts ?? []).map((a) => normalizeAlert(a, zoneById, "rest"));
    // Live alerts never get an `acknowledged` update pushed back over the
    // WebSocket (see LiveProvider) — a local ack only records the id in
    // localAckIds. Fold that in here, at read time, so an acknowledged live
    // alert renders as acknowledged without ever touching the ["alerts"]
    // query cache (ADR-001).
    const normalizedLive = liveAlerts.map((a) =>
      normalizeAlert(
        localAckIds.has(a.id) ? { ...a, acknowledged: true } : a,
        zoneById,
        "live"
      )
    );
    const merged = sortAlerts(dedupeById([...normalizedRest, ...normalizedLive]));
    return merged.filter((a) => {
      if (filters?.severity && a.severity !== filters.severity) return false;
      if (filters?.zone && a.zoneId !== filters.zone) return false;
      return true;
    });
  }, [restAlerts, liveAlerts, localAckIds, zoneById, filters?.severity, filters?.zone]);

  const acknowledge = useCallback(
    (id: string) => {
      if (id.startsWith(LIVE_ID_PREFIX)) {
        acknowledgeLocal(id);
      } else {
        mutate(id);
      }
    },
    [acknowledgeLocal, mutate]
  );

  const bulkAcknowledge = useCallback(
    async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          id.startsWith(LIVE_ID_PREFIX)
            ? Promise.resolve(acknowledgeLocal(id)).then(() => id)
            : mutateAsync(id).then(() => id)
        )
      );

      const succeeded: string[] = [];
      const failed: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          succeeded.push(ids[index]);
        } else {
          failed.push(ids[index]);
        }
      });
      return { succeeded, failed };
    },
    [acknowledgeLocal, mutateAsync]
  );

  return {
    alerts,
    isLoading,
    isError,
    acknowledge,
    acknowledgePending: isPending,
    bulkAcknowledge,
  };
}
