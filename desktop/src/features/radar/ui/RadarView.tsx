import { Pause, Play, Radar as RadarIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useRadarStatus } from "@/features/radar/hooks/useRadarStatus";
import type {
  RadarFinding,
  RadarFindingSource,
  RadarRunState,
  RadarSource,
} from "@/features/radar/lib/radarTypes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

function notWiredYet(action: string) {
  toast.info(
    `${action} needs the VPS collector bridge, which is not connected yet.`,
  );
}

const FINDING_SOURCE_COPY: Record<
  RadarFindingSource,
  { label: string; variant: "secondary" | "info" }
> = {
  buzz_update: { label: "Buzz update", variant: "secondary" },
  x_watch: { label: "X watch", variant: "info" },
};

const STATE_COPY: Record<
  RadarRunState,
  { label: string; variant: "success" | "secondary" | "warning"; blurb: string }
> = {
  running: {
    label: "Running",
    variant: "success",
    blurb: "Radar is actively scanning its watched sources.",
  },
  paused: {
    label: "Paused",
    variant: "secondary",
    blurb: "Radar is paused. Resume it to pick scanning back up.",
  },
  waiting_for_x_access: {
    label: "Waiting for X access",
    variant: "warning",
    blurb:
      "Radar is safely paused because no enrolled X app is connected yet. It will start scanning once one is.",
  },
};

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

function StatusCard({
  state,
  lastScanAt,
  nextScanAt,
  lastError,
  onRefresh,
  isRefreshing,
}: {
  state: RadarRunState;
  lastScanAt: string | null;
  nextScanAt: string | null;
  lastError: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const copy = STATE_COPY[state];
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RadarIcon className="h-4 w-4 text-muted-foreground" />
          <Badge variant={copy.variant}>{copy.label}</Badge>
        </div>
        <Button
          aria-label="Refresh status"
          disabled={isRefreshing}
          onClick={onRefresh}
          size="icon"
          variant="ghost"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{copy.blurb}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>Last scan: {formatTimestamp(lastScanAt)}</span>
        <span>Next scan: {formatTimestamp(nextScanAt)}</span>
      </div>
      {lastError ? <p className="text-sm text-red-400">{lastError}</p> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          onClick={() => notWiredYet("Scan now")}
          size="sm"
          variant="outline"
        >
          Scan now
        </Button>
        <Button
          onClick={() => notWiredYet(state === "paused" ? "Resume" : "Pause")}
          size="sm"
          variant="outline"
        >
          {state === "paused" ? (
            <Play className="mr-1 h-4 w-4" />
          ) : (
            <Pause className="mr-1 h-4 w-4" />
          )}
          {state === "paused" ? "Resume" : "Pause"}
        </Button>
      </div>
    </Card>
  );
}

function SourcesSection({ sources }: { sources: RadarSource[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Watched sources
        </h3>
        <Button
          onClick={() => notWiredYet("Edit sources")}
          size="sm"
          variant="ghost"
        >
          Edit sources
        </Button>
      </div>
      {sources.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No sources configured yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <Card className="p-3 text-sm" key={source.id}>
              {source.label}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FindingsSection({ findings }: { findings: RadarFinding[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">
        Recent finds
      </h3>
      {findings.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Nothing yet — finds will show up here after the first scan.
        </Card>
      ) : (
        <div className="space-y-2">
          {findings.map((finding) => {
            const sourceCopy = FINDING_SOURCE_COPY[finding.source];
            return (
              <Card className="space-y-1 p-3 text-sm" key={finding.id}>
                <div className="flex items-center gap-2">
                  <Badge variant={sourceCopy.variant}>{sourceCopy.label}</Badge>
                </div>
                <a
                  className="font-medium text-primary hover:underline"
                  href={finding.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {finding.summary}
                </a>
                <p className="text-muted-foreground">{finding.whyItMatters}</p>
                {finding.chiefsTake ? (
                  <p className="text-muted-foreground italic">
                    Chief's take: {finding.chiefsTake}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RadarViewSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-64" />
      </Card>
      <Skeleton className="h-4 w-32" />
      <Card className="p-4">
        <Skeleton className="h-4 w-full max-w-sm" />
      </Card>
    </div>
  );
}

export function RadarView() {
  const { snapshot, error, refresh } = useRadarStatus();

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4"
      data-testid="radar-view"
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold">Radar</h2>
      </div>

      {error ? (
        <Card className="mb-4 p-4 text-sm text-red-400">
          Couldn't load Radar status: {error}
        </Card>
      ) : null}

      {!snapshot ? (
        <RadarViewSkeleton />
      ) : (
        <div className="space-y-4">
          <StatusCard
            isRefreshing={false}
            lastError={snapshot.status.lastError}
            lastScanAt={snapshot.status.lastScanAt}
            nextScanAt={snapshot.status.nextScanAt}
            onRefresh={refresh}
            state={snapshot.status.state}
          />
          <SourcesSection sources={snapshot.sources} />
          <FindingsSection findings={snapshot.findings} />
        </div>
      )}
    </div>
  );
}
