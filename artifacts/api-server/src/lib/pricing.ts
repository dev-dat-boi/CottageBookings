import type { Settings } from "@workspace/db";

export interface SeasonDef {
  name: string;
  multiplier: number;
  startDate?: string | null;
  endDate?: string | null;
}

export interface HolidayDef {
  name: string;
  boost: number;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CalendarEntry {
  date: string;
  dayOfWeek: string;
  season: string;
  seasonMult: number;
  dayMult: number;
  holiday: string;
  holidayBoost: number;
  demandAdj: number;
  finalPct: number;
  price: number;
  isOverridden: boolean;
  seasonIsOverridden: boolean;
  holidayIsOverridden: boolean;
  dayIsOverridden: boolean;
  syncedSeason: string | null;
  syncedHoliday: string | null;
}

export interface Override {
  seasonOverride: string | null;
  holidayOverride: string | null;
  dayOverride: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULT_SEASONS: SeasonDef[] = [
  { name: "Winter", multiplier: 1.25 },
  { name: "Low", multiplier: 0.85 },
  { name: "Spring", multiplier: 0.9 },
  { name: "Summer", multiplier: 1.3 },
  { name: "Fall", multiplier: 1.15 },
];

export const DEFAULT_HOLIDAYS: HolidayDef[] = [
  { name: "New Year", boost: 0.5 },
  { name: "St-Jean", boost: 0.35 },
  { name: "Canada Day", boost: 0.35 },
  { name: "Construction Holiday", boost: 0.45 },
  { name: "Labor Day", boost: 0.25 },
  { name: "Thanksgiving", boost: 0.25 },
  { name: "Christmas", boost: 0.6 },
];

export function parseSeasons(json: string): SeasonDef[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_SEASONS;
  } catch {
    return DEFAULT_SEASONS;
  }
}

export function parseHolidays(json: string): HolidayDef[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_HOLIDAYS;
  } catch {
    return DEFAULT_HOLIDAYS;
  }
}

export function parseHolidaysByYear(json: string): Record<string, HolidayDef[]> {
  try {
    const obj = JSON.parse(json);
    return typeof obj === "object" && !Array.isArray(obj) && obj !== null ? obj : {};
  } catch {
    return {};
  }
}

export function holidaysForDate(d: Date, holidaysByYear: Record<string, HolidayDef[]>, fallback: HolidayDef[]): HolidayDef[] {
  const yr = d.getUTCFullYear().toString();
  return holidaysByYear[yr] ?? fallback;
}

function inMDRange(month: number, day: number, startMD: string, endMD: string): boolean {
  const [sm, sd] = startMD.split("-").map(Number);
  const [em, ed] = endMD.split("-").map(Number);
  const cur = month * 100 + day;
  const start = sm * 100 + sd;
  const end = em * 100 + ed;
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;
}

function resolveSeasonForDate(d: Date, seasons: SeasonDef[]): { season: string; synced: string | null } {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const s of seasons) {
    if (s.startDate && s.endDate && inMDRange(month, day, s.startDate, s.endDate)) {
      return { season: s.name, synced: s.name };
    }
  }
  let name = "Low";
  if (month <= 3) name = "Winter";
  else if (month <= 5) name = "Spring";
  else if (month <= 8) name = "Summer";
  else if (month <= 10) name = "Fall";
  return { season: name, synced: null };
}

function resolveHolidayForDate(d: Date, holidays: HolidayDef[]): { name: string; boost: number; synced: string | null } {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const h of holidays) {
    if (h.startDate && h.endDate && inMDRange(month, day, h.startDate, h.endDate)) {
      return { name: h.name, boost: h.boost, synced: h.name };
    }
  }
  const year = d.getFullYear();
  const holidayMap: Record<string, boolean> = {};
  if (month === 1 && day === 1) holidayMap["New Year"] = true;
  if (month === 6 && day === 24) holidayMap["St-Jean"] = true;
  if (month === 7 && day === 1) holidayMap["Canada Day"] = true;
  if (month === 7 && day >= 14 && day <= 27) holidayMap["Construction Holiday"] = true;
  const laborDay = firstMonday(year, 9);
  if (month === 9 && day === laborDay.getDate()) holidayMap["Labor Day"] = true;
  const thanksgiving = nthMonday(year, 10, 2);
  if (month === 10 && day === thanksgiving.getDate()) holidayMap["Thanksgiving"] = true;
  if (month === 12 && day === 25) holidayMap["Christmas"] = true;
  for (const h of holidays) {
    if (holidayMap[h.name]) return { name: h.name, boost: h.boost, synced: null };
  }
  return { name: "", boost: 0, synced: null };
}

function firstMonday(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  const day = d.getDay();
  const offset = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  return new Date(year, month - 1, 1 + offset);
}

function nthMonday(year: number, month: number, n: number): Date {
  const first = firstMonday(year, month);
  return new Date(year, month - 1, first.getDate() + (n - 1) * 7);
}

function getSeasonMult(seasonName: string, seasons: SeasonDef[]): number {
  return seasons.find(s => s.name === seasonName)?.multiplier ?? 1;
}

function getDayMult(dayName: string, s: Settings): number {
  switch (dayName) {
    case "Monday": return s.dayMonday;
    case "Tuesday": return s.dayTuesday;
    case "Wednesday": return s.dayWednesday;
    case "Thursday": return s.dayThursday;
    case "Friday": return s.dayFriday;
    case "Saturday": return s.daySaturday;
    case "Sunday": return s.daySunday;
    default: return 1;
  }
}

export function computeEntry(
  d: Date,
  s: Settings,
  seasons: SeasonDef[],
  holidays: HolidayDef[],
  override?: Override | null,
  rateType: "standard" | "family" = "standard",
  includeMultipliers = true
): CalendarEntry {
  const naturalDay = DAYS[d.getDay()];

  // --- Per-field override flags ---
  const hasOverrideRow = override !== null && override !== undefined;
  const seasonIsOverridden = hasOverrideRow && override!.seasonOverride !== null;
  // holidayIsOverridden is true for any non-null value, including "" (suppress sentinel)
  const holidayIsOverridden = hasOverrideRow && override!.holidayOverride !== null;
  const dayIsOverridden = hasOverrideRow && override!.dayOverride !== null;

  // --- Day ---
  const dayOfWeek = dayIsOverridden ? override!.dayOverride! : naturalDay;

  // --- Season ---
  const { season: resolvedSeason, synced: syncedSeasonRaw } = resolveSeasonForDate(d, seasons);
  const season = seasonIsOverridden ? override!.seasonOverride! : resolvedSeason;
  const seasonMult = getSeasonMult(season, seasons);
  const syncedSeason = seasonIsOverridden ? null : syncedSeasonRaw;

  // --- Holiday ---
  // "" means "explicitly suppress holiday" (no boost, no highlight)
  let holiday = "";
  let holidayBoost = 0;
  let syncedHoliday: string | null = null;

  if (holidayIsOverridden) {
    holiday = override!.holidayOverride!; // could be "" (suppress) or a name
    const h = holidays.find(h => h.name === holiday);
    holidayBoost = h?.boost ?? 0;
    syncedHoliday = null;
  } else {
    const resolved = resolveHolidayForDate(d, holidays);
    holiday = resolved.name;
    holidayBoost = resolved.boost;
    syncedHoliday = resolved.synced;
  }

  // --- Price ---
  const dayMult = getDayMult(dayOfWeek, s);
  const demandAdj = 0;
  const finalPct = seasonMult * dayMult + holidayBoost + demandAdj;
  const basePrice = rateType === "family" ? s.familyRate : s.basePrice;
  let price: number;
  if (rateType === "family" && !includeMultipliers) {
    price = s.familyRate;
  } else {
    price = Math.max(basePrice, basePrice * finalPct);
  }

  // Row is "meaningfully" overridden (amber) only for real changes, not "" suppress
  const isOverridden = seasonIsOverridden || dayIsOverridden || (holidayIsOverridden && override!.holidayOverride !== "");

  return {
    date: d.toISOString().slice(0, 10),
    dayOfWeek,
    season,
    seasonMult,
    dayMult,
    holiday,
    holidayBoost,
    demandAdj,
    finalPct,
    price: Math.round(price * 100) / 100,
    isOverridden,
    seasonIsOverridden,
    holidayIsOverridden,
    dayIsOverridden,
    syncedSeason,
    syncedHoliday,
  };
}

export function generateCalendar(
  s: Settings,
  seasons: SeasonDef[],
  holidays: HolidayDef[],
  holidaysByYear: Record<string, HolidayDef[]>,
  overrides: Map<string, Override>,
  fromYear?: number,
  toYear?: number
): CalendarEntry[] {
  const defaultYear = new Date().getFullYear();
  const startYear = fromYear ?? defaultYear;
  const endYear = toYear ?? (startYear + 1);
  const entries: CalendarEntry[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const dateHolidays = holidaysForDate(new Date(d), holidaysByYear, holidays);
      entries.push(computeEntry(new Date(d), s, seasons, dateHolidays, overrides.get(dateStr) ?? null));
    }
  }
  return entries;
}
