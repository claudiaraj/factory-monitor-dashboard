import { useContext } from "react";
import type { Alert, MachineTelemetry } from "../types";
import { LiveContext } from "../live/LiveProvider";

export interface TelemetrySnapshot {
  machineId: string;
  machineName: string;
  zoneId: string;
  telemetry: MachineTelemetry;
  timestamp: string;
}

export interface LiveContextValue {
  liveAlerts: Alert[];
  telemetry: Record<string, TelemetrySnapshot>;
  lastMessageAt: number | null;
  localAckIds: Set<string>;
  acknowledgeLocal: (id: string) => void;
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (ctx === undefined) {
    throw new Error(
      "useLive() must be called within a <LiveProvider>. " +
        "Wrap your app (inside QueryClientProvider, outside BrowserRouter) with <LiveProvider> in src/App.tsx."
    );
  }
  return ctx;
}
