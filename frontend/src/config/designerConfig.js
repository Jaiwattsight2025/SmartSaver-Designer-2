/*
 * SMARTSAVER DESIGNER - MODELLING ASSUMPTIONS
 *
 * Every number the Designer uses that does NOT come from the customer's bill
 * or Google's roof data lives here.
 *   [ASSUMPTION]  engineering / industry rule of thumb - reasonable, but review.
 * Prices live in pricing.js (all [PLACEHOLDER]).
 *
 * Values marked "same as Wattsight" are copied from
 * Wattsight\platform\config\assumptions.py so both tools give the same answer.
 */

export const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

// Fallbacks used only when the bill (or the customer) does not give a value.
export const DEFAULT_IMPORT_RATE = 0.3 // [ASSUMPTION] $/kWh (same as Wattsight)
export const DEFAULT_SUPPLY_PER_DAY = 1.1 // [ASSUMPTION] $/day (same as Wattsight)
export const DEFAULT_FEED_IN_RATE = 0.05 // [ASSUMPTION] $/kWh (same as Wattsight)

// [ASSUMPTION] Annual AC output per kW of panels, kWh/kW/yr (same as Wattsight).
// Used only when Google's roof-specific panel data is not available.
export const SOLAR_YIELD_BY_STATE = {
  NSW: 1424, ACT: 1570, VIC: 1314, QLD: 1533, SA: 1533, WA: 1606, TAS: 1278, NT: 1606,
}
export const NATIONAL_FALLBACK_YIELD = 1460

// [ASSUMPTION] Summer/winter swing in solar output (same as Wattsight).
export const SEASONAL_SWING_BY_STATE = {
  TAS: 0.5, VIC: 0.45, SA: 0.38, NSW: 0.33, ACT: 0.4, WA: 0.35, QLD: 0.25, NT: 0.1,
}
export const DEFAULT_SEASONAL_SWING = 0.35

// [ASSUMPTION] Hourly shapes (fraction of the day's total), same as Wattsight.
export const SOLAR_HOURLY_SHAPE = [
  0, 0, 0, 0, 0, 0.005, 0.02, 0.045, 0.075, 0.1, 0.115, 0.125,
  0.125, 0.115, 0.1, 0.075, 0.05, 0.03, 0.015, 0, 0, 0, 0, 0,
]
export const LOAD_HOURLY_SHAPE = [
  0.025, 0.022, 0.02, 0.02, 0.021, 0.026, 0.04, 0.05, 0.045, 0.038,
  0.035, 0.035, 0.035, 0.035, 0.037, 0.042, 0.055, 0.07, 0.08, 0.075,
  0.065, 0.055, 0.043, 0.031,
]

// [ASSUMPTION] Google's yearlyEnergyDcKwh is DC at the panel; this covers
// inverter, wiring, soiling and temperature losses (Google's own sample uses 0.85).
export const DC_TO_AC_DERATE = 0.85

// Panels
export const MODULE_WATT_OPTIONS = [400, 415, 420, 440, 450, 475] // [ASSUMPTION] common sizes
export const DEFAULT_MODULE_WATTS = 440 // [ASSUMPTION] same as Wattsight PANEL_WATTS
// [ASSUMPTION] Typical 440 W module, metres (default size for the layout).
export const MODULE_WIDTH_M = 1.134
export const MODULE_HEIGHT_M = 1.762
// [ASSUMPTION] Typical module sizes (width x height, metres) per wattage - check the actual datasheet.
export const MODULE_DIMENSIONS_BY_WATTS = {
  400: { widthM: 1.134, heightM: 1.722 },
  415: { widthM: 1.134, heightM: 1.722 },
  420: { widthM: 1.134, heightM: 1.762 },
  440: { widthM: 1.134, heightM: 1.762 },
  450: { widthM: 1.134, heightM: 1.762 },
  475: { widthM: 1.134, heightM: 1.909 },
}
export const PANEL_GAP_M = 0.02 // [ASSUMPTION] clamp gap between panels in a row
export const ROW_GAP_M = 0.02 // [ASSUMPTION] gap between rows (flush-mounted)
export const ROOF_EDGE_SETBACK_M = 0.4 // [ASSUMPTION] keep panels this far inside every roof edge
export const OBSTACLE_CLEARANCE_M = 0.3 // [ASSUMPTION] keep panels this far from vents, skylights, etc.
export const DEFAULT_PANEL_ORIENTATION = 'portrait' // long side up the roof
export const MAX_ADDED_PANEL_SNAP_M = 1.5 // a dragged panel snaps to the nearest grid spot within this distance
// A map drag shorter than this is a shaky click (remove), not a move. Just past
// half a module width: the next slot's centre is ~1.15 m away, so a real move
// has to pass the halfway line and this distance.
export const PANEL_CLICK_SLOP_M = 0.6
export const MIN_PANELS_PER_FACE = 1 // placement floor: 1–3 panels are allowed for planning
export const SMALL_GROUP_WARN_PANELS = 4 // warning only: small groups are harder to wire. Not a placement ban.
export const MIN_PANELS_PER_FACE_SMALL = 1
export const SMALL_SYSTEM_PANELS = 8
export const PLANNING_KW_MIN = 1
export const PLANNING_KW_MAX = 100 // adjustable planning size, not a network determination
export const MIN_FACE_AREA_M2 = 4 // faces smaller than this are not worth a panel row
export const MAX_RESIDENTIAL_KW = 13.2 // [ASSUMPTION] default planning size, not a statement of what the network allows

// Inverter & battery
export const INVERTER_SIZES_KW = [3, 5, 6, 8, 10, 15] // [ASSUMPTION] common single/three-phase sizes
export const MAX_DC_AC_RATIO = 1.33 // [ASSUMPTION] CEC panel-to-inverter oversizing limit
export const BATTERY_SIZE_OPTIONS_KWH = [0, 5, 10, 13.5, 16, 20, 25, 30] // [ASSUMPTION]
export const BATTERY_ROUND_TRIP_EFFICIENCY = 0.9 // [ASSUMPTION] same as Wattsight

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Flat roofs (D2.3): panels go on tilt frames facing north instead of flush.
export const FLAT_ROOF_MAX_PITCH_DEG = 5 // [ASSUMPTION] below this a roof is treated as flat
export const TILT_FRAME_DEG = 10 // [ASSUMPTION] common low-profile tilt frame
export const WINTER_NOON_SUN_DEG = 29 // [ASSUMPTION] used only when the design has no latitude. Melbourne is about 29°, Sydney about 33°.

/**
 * Main-roof filter (lib/mainRoof.js) [ASSUMPTION - tuned on 7 public test roofs]:
 * STEP_M: planes within this of each other along a shared edge are one roof (ridge/hip/valley);
 * MIN_EDGE_M: shortest shared edge that joins two faces; WALL_EDGE_M: shortest wall that can join
 * another storey; HOUSE_MAX_M2: above this plan area a wall step is treated as a boundary to next
 * door; SEED_MAX_M: the locked point must be within this of a face for the filter to run.
 * CONNECT_GAP_M: outlines closer than this (a shared edge, or a thin tracing gap)
 * are the same roof even when the 3D model did not record a join.
 */
export const MAIN_ROOF = { STEP_M: 1.0, MIN_EDGE_M: 1.0, WALL_EDGE_M: 2.0, HOUSE_MAX_M2: 1000, SEED_MAX_M: 8, CONNECT_GAP_M: 0.6 }

/** Panel blocks (chooseBlock): blocks up to this long-to-short ratio count as compact. */
export const BLOCK_MAX_ASPECT = 2
