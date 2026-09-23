import { useEffect, useState } from "react";
import { useLive } from "./useLive";

/** Telemetry arrives every ~3s, so a feed silent for this long has stalled. */
const STALE_AFTER_MS = 10000;

export type LiveFeedState = "waiting" | "live" | "stale";

/**
 * How fresh the WebSocket feed is, re-evaluated every second. This is the
 * real "are we live?" signal — FactoryStatus.connected comes from a REST
 * poll and says nothing about whether pushed updates are still arriving.
 * Call it from small leaf components: the 1s tick re-renders the caller.
 */
export function useLiveFreshness(): { state: LiveFeedState; secondsAgo: number | null } {
  const { lastMessageAt } = useLive();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (lastMessageAt === null) return { state: "waiting", secondsAgo: null };

  const ageMs = Math.max(0, now - lastMessageAt);
  return {
    state: ageMs > STALE_AFTER_MS ? "stale" : "live",
    secondsAgo: Math.floor(ageMs / 1000),
  };
}
