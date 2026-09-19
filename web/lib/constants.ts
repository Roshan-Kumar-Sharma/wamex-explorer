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

// The commodities a WA geologist would expect to see checked. Used only to
// say "no open-file report on this ground records X as a target" -- a fact
// about the record, never a claim about the rocks. Top of the statewide
// distribution (GOLD 77k reports ... TUNGSTEN 576), plus lithium and REE,
// which are recent and therefore under-represented in a 60-year archive.
export const MAJOR_COMMODITIES = [
  "GOLD", "NICKEL", "COPPER", "IRON", "BASE METALS", "ZINC", "URANIUM", "DIAMOND",
  "LEAD", "PLATINUM GROUP ELEMENTS", "COBALT", "SILVER", "LITHIUM", "MINERAL SANDS",
  "RARE EARTH ELEMENTS", "TANTALUM", "MANGANESE", "COAL", "TIN", "VANADIUM",
  "POTASH", "BAUXITE", "TUNGSTEN",
];

/** Where a brief's data came from, for the document footer. */
export const SOURCE_NOTE =
  "Drillhole collars from DMPE SLIP layer 28 and WAMEX report metadata from layer 22, " +
  "via the DASC bulk download. Open-file records only; confidential reports are not included.";
