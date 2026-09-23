import { createContext, useCallback, useState, type ReactNode } from "react";
import type { Alert, WebSocketMessage } from "../types";
import { useFactoryWebSocket } from "../hooks/useFactoryWebSocket";
import type { LiveContextValue, TelemetrySnapshot } from "../hooks/useLive";

export const LiveContext = createContext<LiveContextValue | undefined>(undefined);

export function LiveProvider({ children }: { children: ReactNode }): JSX.Element {
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, TelemetrySnapshot>>({});
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [localAckIds, setLocalAckIds] = useState<Set<string>>(new Set());

  const onMessage = useCallback((message: WebSocketMessage) => {
    setLastMessageAt(Date.now());

    if (message.type === "telemetry") {
      const payload = message.payload as TelemetrySnapshot;
      setTelemetry((prev) => ({ ...prev, [payload.machineId]: payload }));
      return;
    }

    if (message.type === "alert") {
      const payload = message.payload as Alert;
      setLiveAlerts((prev) =>
        prev.some((a) => a.id === payload.id) ? prev : [...prev, payload]
      );
      return;
    }
    // "event" type messages: no consumer for this story; ignored deliberately.
  }, []);

  useFactoryWebSocket(onMessage);

  const acknowledgeLocal = useCallback((id: string) => {
    setLocalAckIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const value: LiveContextValue = {
    liveAlerts,
    telemetry,
    lastMessageAt,
    localAckIds,
    acknowledgeLocal,
  };

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
