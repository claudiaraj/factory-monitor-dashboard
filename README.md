# Factory Floor Monitoring Dashboard

A React + TypeScript starter project for a factory floor monitoring UI. The app simulates a factory with multiple **zones**, each containing **machines** that report telemetry data and raise **alerts**.

All backend data is mocked via [MSW](https://mswjs.io/) (Mock Service Worker) — no real server required.

---

## Quick Start

All dependencies are pre-installed. Just run:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The mock API is already running — you should see a navigation bar with Dashboard, Alerts, and Topology links.

> If you need to reinstall dependencies for any reason: `npm install`

---

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Vite | 6 | Dev server and build |
| Chakra UI | 2 | Component library ([docs](https://v2.chakra-ui.com/docs/components)) |
| React Query | 5 | Server state management |
| React Router | 6 | Client-side routing |
| MSW | 2 | API mocking |

---

## Project Structure

```
src/
├── types.ts                  # All TypeScript interfaces
├── App.tsx                   # Root component (providers, router, navbar)
├── main.tsx                  # Entry point (MSW initialization)
├── hooks/
│   ├── useFactoryStatus.ts   # Factory connection status + stats
│   ├── useZones.ts           # Zone list with health
│   ├── useAlerts.ts          # Alerts with optional filtering
│   ├── useAcknowledgeAlert.ts # Mutation to acknowledge an alert
│   └── useFactoryWebSocket.ts # Real-time event subscription
├── components/
│   └── SampleCard.tsx        # Example Chakra UI card (for reference)
├── pages/
│   ├── Dashboard.tsx         # Main dashboard page
│   ├── Alerts.tsx            # Alerts / active problems page
│   └── Topology.tsx          # Factory topology page
└── mocks/
    ├── browser.ts            # MSW browser setup
    ├── handlers.ts           # REST API mock handlers
    ├── websocket.ts          # WebSocket emulator
    └── data/
        ├── zones.json        # 4 factory zones
        ├── machines.json     # 14 machines across zones
        ├── alerts.json       # Active alerts
        └── events.json       # Event log
```

---

## Data Hooks

Pre-built hooks that handle all data fetching via React Query. Import from `src/hooks/`.

### `useFactoryStatus()`

Returns overall factory connection info.

```ts
const { data, isLoading, isError } = useFactoryStatus();
// data: FactoryStatus | undefined
```

### `useZones()`

Returns the list of factory zones.

```ts
const { data, isLoading, isError } = useZones();
// data: Zone[] | undefined
```

### `useAlerts(filters?)`

Returns active alerts. Accepts optional filters.

```ts
const { data, isLoading, isError } = useAlerts();
const { data } = useAlerts({ severity: "critical" });
const { data } = useAlerts({ zone: "welding" });
```

### `useAcknowledgeAlert()`

Mutation hook. Marks an alert as acknowledged.

```ts
const { mutate } = useAcknowledgeAlert();
mutate("alert-id-here");
```

### `useFactoryWebSocket(callback)`

Subscribes to real-time events. Manages connection lifecycle.

```ts
useFactoryWebSocket((message) => {
  // message.type: "telemetry" | "alert" | "event"
  // message.payload: varies by type
});
```

---

## REST API Endpoints

All endpoints are mocked and available immediately when the dev server runs.

| Endpoint | Method | Returns |
|---|---|---|
| `/api/factory/status` | GET | `FactoryStatus` object |
| `/api/zones` | GET | `Zone[]` |
| `/api/zones/:zoneId/machines` | GET | `Machine[]` for that zone |
| `/api/machines/:machineId` | GET | Single `Machine` |
| `/api/alerts` | GET | `Alert[]` — supports `?severity=` and `?zone=` query params |
| `/api/events` | GET | `FactoryEvent[]` |
| `/api/alerts/:alertId/acknowledge` | POST | `{ success: true }` |

---

## Data Types

All TypeScript interfaces are defined in `src/types.ts`:

```ts
interface FactoryStatus {
  connected: boolean;
  totalMachines: number;
  zoneCount: number;
  uptimeHours: number;
  lastUpdated: string;
}

interface Zone {
  id: string;
  name: string;
  machineCount: number;
  health: "healthy" | "degraded" | "faulted";
}

interface Machine {
  id: string;
  name: string;
  type: "cnc_mill" | "robotic_arm" | "conveyor" | "press" | "welder" | "spray_booth";
  zoneId: string;
  status: "running" | "idle" | "error" | "maintenance";
  telemetry: MachineTelemetry;
  lastUpdated: string;
}

interface MachineTelemetry {
  temperature: number;
  vibration: number;
  throughput: number;
  powerDraw: number;
}

interface Alert {
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

interface FactoryEvent {
  id: string;
  machineId: string;
  machineName: string;
  type: "machine_started" | "machine_stopped" | "alert_raised" | "alert_cleared" | "maintenance_scheduled";
  message: string;
  timestamp: string;
}

interface WebSocketMessage {
  type: "telemetry" | "alert" | "event";
  payload: unknown;
}
```

---

## Mock Data Summary

| Dataset | Records | Notes |
|---|---|---|
| Zones | 4 | Assembly, Welding, Painting, Packaging |
| Machines | 14 | Spread across all zones |
| Alerts | 6 | Mix of critical, warning, info; some acknowledged |
| Events | 20 | Machine starts/stops, alerts raised, maintenance |

### WebSocket Events

The WebSocket emulator pushes:
- **Telemetry updates** every ~3 seconds (random machine)
- **New alerts** every ~15 seconds (30% chance each interval)

---

## Reference Component

`src/components/SampleCard.tsx` demonstrates common Chakra UI patterns:
- Card with header, body, badge
- Loading skeleton state
- Props interface with TypeScript
