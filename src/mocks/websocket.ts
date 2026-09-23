import type { WebSocketMessage } from "../types";
import machinesData from "./data/machines.json";

type MessageHandler = (message: WebSocketMessage) => void;

/**
 * MockWebSocketServer simulates a WebSocket connection that pushes
 * real-time telemetry updates and occasional alerts.
 *
 * Usage:
 *   const ws = new MockWebSocketServer();
 *   ws.connect();
 *   ws.onMessage((msg) => { console.log(msg); });
 *   // later:
 *   ws.disconnect();
 */
export class MockWebSocketServer {
  private listeners: MessageHandler[] = [];
  private telemetryInterval: ReturnType<typeof setInterval> | null = null;
  private alertInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  connect() {
    if (this.connected) return;
    this.connected = true;

    // Push a random machine's telemetry every 3 seconds
    this.telemetryInterval = setInterval(() => {
      const machine =
        machinesData[Math.floor(Math.random() * machinesData.length)];
      const message: WebSocketMessage = {
        type: "telemetry",
        payload: {
          machineId: machine.id,
          machineName: machine.name,
          zoneId: machine.zoneId,
          telemetry: {
            temperature:
              machine.telemetry.temperature + (Math.random() - 0.5) * 5,
            vibration:
              machine.telemetry.vibration + (Math.random() - 0.5) * 0.5,
            throughput: Math.max(
              0,
              machine.telemetry.throughput + Math.floor((Math.random() - 0.5) * 10)
            ),
            powerDraw:
              machine.telemetry.powerDraw + (Math.random() - 0.5) * 2,
          },
          timestamp: new Date().toISOString(),
        },
      };
      this.emit(message);
    }, 3000);

    // Occasionally push a new alert (every 15 seconds, 30% chance)
    this.alertInterval = setInterval(() => {
      if (Math.random() > 0.3) return;

      const machine =
        machinesData[Math.floor(Math.random() * machinesData.length)];
      const severities = ["critical", "warning", "info"] as const;
      const severity = severities[Math.floor(Math.random() * severities.length)];
      const messages: Record<string, string[]> = {
        critical: [
          "Temperature exceeded safe operating limit",
          "Emergency stop triggered",
          "Power supply voltage out of range",
        ],
        warning: [
          "Vibration levels above normal threshold",
          "Coolant level running low",
          "Belt tension requires adjustment",
        ],
        info: [
          "Routine calibration check due soon",
          "Filter replacement recommended",
          "Operating hours milestone reached",
        ],
      };
      const msgList = messages[severity];
      const alertMessage = msgList[Math.floor(Math.random() * msgList.length)];

      const message: WebSocketMessage = {
        type: "alert",
        payload: {
          id: `ws-alt-${Date.now()}`,
          machineId: machine.id,
          machineName: machine.name,
          zoneId: machine.zoneId,
          zoneName: machine.zoneId,
          severity,
          message: alertMessage,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        },
      };
      this.emit(message);
    }, 15000);
  }

  disconnect() {
    this.connected = false;
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    if (this.alertInterval) {
      clearInterval(this.alertInterval);
      this.alertInterval = null;
    }
  }

  onMessage(handler: MessageHandler) {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  private emit(message: WebSocketMessage) {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}

// Singleton instance for the app
export const mockWebSocket = new MockWebSocketServer();
