import * as React from "react";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const RadarView = React.lazy(async () => {
  const module = await import("@/features/radar/ui/RadarView");
  return { default: module.RadarView };
});

export function RadarScreen() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <React.Suspense fallback={<ViewLoadingFallback kind="workflows" />}>
        <RadarView />
      </React.Suspense>
    </div>
  );
}
