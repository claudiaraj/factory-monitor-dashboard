import { useEffect } from "react";
import type { WebSocketMessage } from "../types";
import { mockWebSocket } from "../mocks/websocket";

/**
 * Subscribe to real-time factory events via WebSocket.
 *
 * Usage:
 *   useFactoryWebSocket((message) => {
 *     if (message.type === "alert") { ... }
 *     if (message.type === "telemetry") { ... }
 *   });
 *
 * The hook manages connection lifecycle automatically —
 * it connects on mount and disconnects on unmount.
 */
export function useFactoryWebSocket(
  onMessage: (message: WebSocketMessage) => void
) {
  useEffect(() => {
    mockWebSocket.connect();
    const unsubscribe = mockWebSocket.onMessage(onMessage);

    return () => {
      unsubscribe();
    };
  }, []);
}
