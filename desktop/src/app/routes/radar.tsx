import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { usePreviewFeatureWarning } from "@/shared/features";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const RadarScreen = React.lazy(async () => {
  const module = await import("@/features/radar/ui/RadarScreen");
  return { default: module.RadarScreen };
});

export const Route = createFileRoute("/radar")({
  component: RadarRouteComponent,
});

function RadarRouteComponent() {
  usePreviewFeatureWarning("radar");
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="workflows" />}>
      <RadarScreen />
    </React.Suspense>
  );
}
