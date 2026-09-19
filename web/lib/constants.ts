// CC BY 4.0 licence condition -- must be visible in UI and on every export.
// ONE constant: the department has renamed DMIRS -> DEMIRS -> DMPE already.
export const ATTRIBUTION =
  "Based on Department of Mines, Petroleum and Exploration material";
export const LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";

// Methods that represent an attempt to test the subsurface for minerals.
// Water bores and costeans are excluded -- they would inflate any
// "how much exploration happened here" statistic.
export const EXPLORATION_HOLETYPES = [
  "RAB", "AC", "RC", "DD", "RCD",
  "AUGER", "PERCUSSION", "ROTARY", "VACUUM", "SONIC",
];

export const HOLETYPE_LABELS: Record<string, string> = {
  RAB: "Rotary air blast",
  AC: "Aircore",
  RC: "Reverse circulation",
  DD: "Diamond",
  RCD: "RC with diamond tail",
  AUGER: "Auger",
  PERCUSSION: "Percussion",
  ROTARY: "Rotary",
  VACUUM: "Vacuum",
  SONIC: "Sonic",
  WATER_BORE: "Water bore",
  COSTEAN: "Costean (trench)",
  UNKNOWN: "Unrecorded",
  OTHER: "Other",
};

export const HOLETYPE_COLORS: Record<string, string> = {
  DD: "#e11d48",
  RC: "#2563eb",
  AC: "#0891b2",
  RAB: "#94a3b8",
  RCD: "#7c3aed",
  AUGER: "#ca8a04",
};
