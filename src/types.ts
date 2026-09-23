export interface Zone {
  id: string;
  name: string;
  machineCount: number;
  health: "healthy" | "degraded" | "faulted";
}

export interface MachineTelemetry {
  temperature: number;
  vibration: number;
  throughput: number;
  powerDraw: number;
}

export interface Machine {
  id: string;
  name: string;
  type: "cnc_mill" | "robotic_arm" | "conveyor" | "press" | "welder" | "spray_booth";
  zoneId: string;
  status: "running" | "idle" | "error" | "maintenance";
  telemetry: MachineTelemetry;
  lastUpdated: string;
}

export interface Alert {
  id: string;
  machineId: string;
  machineName: string;
  zoneId: string;
  zoneName: string;
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface FactoryEvent {
  id: string;
  machineId: string;
  machineName: string;
  type:
    | "machine_started"
    | "machine_stopped"
    | "alert_raised"
    | "alert_cleared"
    | "maintenance_scheduled";
  message: string;
  timestamp: string;
}

export interface FactoryStatus {
  connected: boolean;
  totalMachines: number;
  zoneCount: number;
  uptimeHours: number;
  lastUpdated: string;
}

export interface WebSocketMessage {
  type: "telemetry" | "alert" | "event";
  payload: unknown;
}
