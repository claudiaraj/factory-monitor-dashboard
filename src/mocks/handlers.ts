import { http, HttpResponse } from "msw";
import type { Alert } from "../types";
import alertsData from "./data/alerts.json";
import alerts50Data from "./data/scenarios/alerts-50.json";
import alertsEmptyData from "./data/scenarios/alerts-empty.json";
import eventsData from "./data/events.json";
import machinesData from "./data/machines.json";
import zonesData from "./data/zones.json";

// In-memory state so acknowledge mutations persist during the session
let alerts: Alert[] = JSON.parse(JSON.stringify(alertsData));

// Scenario datasets for mid-session swapping
const scenarios: Record<string, Alert[]> = {
  default: alertsData as unknown as Alert[],
  stress: alerts50Data as unknown as Alert[],
  empty: alertsEmptyData as unknown as Alert[],
};

/**
 * Switch the active alert dataset.
 * Call from the browser console:
 *   window.__setAlertScenario("stress")  // 50 alerts
 *   window.__setAlertScenario("empty")   // 0 alerts
 *   window.__setAlertScenario("default") // original 6 alerts
 */
function setAlertScenario(scenario: string) {
  const data = scenarios[scenario];
  if (!data) {
    console.warn(
      `Unknown scenario "${scenario}". Available: ${Object.keys(scenarios).join(", ")}`
    );
    return;
  }
  alerts = JSON.parse(JSON.stringify(data));
  console.log(
    `[Mock] Switched to "${scenario}" scenario (${alerts.length} alerts). Refresh the alerts view to see changes.`
  );
}

// Expose to browser console for the interviewer
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__setAlertScenario =
    setAlertScenario;
}

export const handlers = [
  // GET /api/factory/status
  http.get("/api/factory/status", () => {
    return HttpResponse.json({
      connected: true,
      totalMachines: machinesData.length,
      zoneCount: zonesData.length,
      uptimeHours: 127.4,
      lastUpdated: new Date().toISOString(),
    });
  }),

  // GET /api/zones
  http.get("/api/zones", () => {
    return HttpResponse.json(zonesData);
  }),

  // GET /api/zones/:zoneId/machines
  http.get("/api/zones/:zoneId/machines", ({ params }) => {
    const { zoneId } = params;
    const machines = machinesData.filter((m) => m.zoneId === zoneId);
    return HttpResponse.json(machines);
  }),

  // GET /api/machines/:machineId
  http.get("/api/machines/:machineId", ({ params }) => {
    const { machineId } = params;
    const machine = machinesData.find((m) => m.id === machineId);
    if (!machine) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(machine);
  }),

  // GET /api/alerts — supports ?severity= and ?zone= query params
  http.get("/api/alerts", ({ request }) => {
    const url = new URL(request.url);
    const severity = url.searchParams.get("severity");
    const zone = url.searchParams.get("zone");

    let filtered = [...alerts];
    if (severity) {
      filtered = filtered.filter((a) => a.severity === severity);
    }
    if (zone) {
      filtered = filtered.filter((a) => a.zoneId === zone);
    }

    return HttpResponse.json(filtered);
  }),

  // GET /api/events
  http.get("/api/events", () => {
    return HttpResponse.json(eventsData);
  }),

  // POST /api/alerts/:alertId/acknowledge
  http.post("/api/alerts/:alertId/acknowledge", ({ params }) => {
    const { alertId } = params;
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) {
      return new HttpResponse(null, { status: 404 });
    }
    alert.acknowledged = true;
    return HttpResponse.json({ success: true });
  }),
];
