export type RadarRunState = "running" | "paused" | "waiting_for_x_access";

export type RadarStatus = {
  state: RadarRunState;
  lastScanAt: string | null;
  nextScanAt: string | null;
  lastError: string | null;
};

export type RadarSource = {
  id: string;
  label: string;
};

export type RadarFindingSource = "buzz_update" | "x_watch";

export type RadarFinding = {
  id: string;
  url: string;
  summary: string;
  whyItMatters: string;
  chiefsTake: string | null;
  foundAt: string;
  source: RadarFindingSource;
};

export type RadarSnapshot = {
  status: RadarStatus;
  sources: RadarSource[];
  findings: RadarFinding[];
};
