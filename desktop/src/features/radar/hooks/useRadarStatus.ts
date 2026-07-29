import * as React from "react";

import type {
  RadarFinding,
  RadarSnapshot,
} from "@/features/radar/lib/radarTypes";

const BUZZ_COMMITS_URL =
  "https://api.github.com/repos/dschwartzAI/buzz/commits?sha=main&per_page=20";

type GithubCommit = {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { date?: string | null };
  };
};

function firstUsefulSentence(value: string | null | undefined): string | null {
  const normalized = value
    ?.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[#*_`>\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const sentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? normalized;
  return sentence.slice(0, 240);
}

function findingsFromMainCommits(value: unknown): RadarFinding[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    const entry = candidate as GithubCommit;
    const message = entry.commit?.message?.trim();
    const title = message?.split("\n", 1)[0]?.trim();
    const date = entry.commit?.author?.date;
    if (
      typeof entry.sha !== "string" ||
      typeof entry.html_url !== "string" ||
      !title ||
      typeof date !== "string"
    ) {
      return [];
    }

    const detail = message?.slice(title.length).trim();
    return [
      {
        id: `buzz-commit-${entry.sha}`,
        url: entry.html_url,
        summary: title,
        whyItMatters:
          firstUsefulSentence(detail) ?? "This shipped on Buzz's main branch.",
        chiefsTake: null,
        foundAt: date,
        source: "buzz_update" as const,
      },
    ];
  });
}

async function fetchRadarSnapshot(): Promise<RadarSnapshot> {
  const response = await fetch(BUZZ_COMMITS_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`Buzz updates returned HTTP ${response.status}`);
  }

  return {
    status: {
      state: "waiting_for_x_access",
      lastScanAt: new Date().toISOString(),
      nextScanAt: null,
      lastError: null,
    },
    sources: [
      { id: "buzz-main", label: "Buzz updates merged to main" },
      { id: "x-watch", label: "X watch (waiting for enrolled API access)" },
    ],
    findings: findingsFromMainCommits(await response.json()),
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
