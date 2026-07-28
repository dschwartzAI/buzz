import * as React from "react";

import type { RadarSnapshot } from "@/features/radar/lib/radarTypes";

// Bob's slice ends here: this is the seam Scotty wires to the real
// collector/status contract (Buzz events or a narrow local API — see
// issue 9854ad5f). The status block is genuinely "waiting for X access" —
// that's today's real state, not a placeholder. Sources and findings below
// ARE placeholders (per Chief's direction) so the full shape of the screen
// is visible before Scotty wires either source in; the UI marks them as
// examples so they're never mistaken for live data.
async function fetchRadarSnapshot(): Promise<RadarSnapshot> {
  return {
    status: {
      state: "waiting_for_x_access",
      lastScanAt: null,
      nextScanAt: null,
      lastError: null,
    },
    sources: [
      { id: "example-source-1", label: "@AnthropicAI (X account)" },
      { id: "example-source-2", label: 'search: "buzz nostr"' },
    ],
    findings: [
      {
        id: "example-finding-1",
        url: "https://github.com/block/buzz/releases",
        summary: "Buzz shipped use-limited invite links",
        whyItMatters:
          "Makes it safer to share an invite link publicly without it being reused indefinitely.",
        chiefsTake: "Worth turning on for any channel we link from outside Buzz.",
        foundAt: "2026-07-27T12:00:00.000Z",
        source: "buzz_update",
      },
      {
        id: "example-finding-2",
        url: "https://x.com/example/status/0",
        summary: "An X account discusses a new agent-orchestration pattern",
        whyItMatters:
          "Relevant to how Buzz agents hand off work to each other.",
        chiefsTake: null,
        foundAt: "2026-07-27T09:00:00.000Z",
        source: "x_watch",
      },
    ],
  };
}

export function useRadarStatus(): {
  snapshot: RadarSnapshot | null;
  error: string | null;
  refresh: () => void;
} {
  const [snapshot, setSnapshot] = React.useState<RadarSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchOnce = React.useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await fetchRadarSnapshot();
        if (!cancelled) {
          setSnapshot(value);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => fetchOnce(), [fetchOnce]);

  return { snapshot, error, refresh: fetchOnce };
}
