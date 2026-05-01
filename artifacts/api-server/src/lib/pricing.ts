import type { Settings } from "@workspace/db";

export interface SeasonDef { name: string; multiplier: number }
export interface HolidayDef { name: string; boost: number }

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

function getDefaultSeason(month: number): string {
  if (month <= 3) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  if (month <= 10) return "Fall";
  return "Low";
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

function getDefaultHoliday(d: Date, holidays: HolidayDef[]): { name: string; boost: number } {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  const holidayMap: Record<string, boolean> = {};

  // New Year: Jan 1
  if (month === 1 && day === 1) holidayMap["New Year"] = true;
  // St-Jean: Jun 24
  if (month === 6 && day === 24) holidayMap["St-Jean"] = true;
  // Canada Day: Jul 1
  if (month === 7 && day === 1) holidayMap["Canada Day"] = true;
  // Construction Holiday: ~Jul 14–27
  if (month === 7 && day >= 14 && day <= 27) holidayMap["Construction Holiday"] = true;
  // Labor Day: first Monday of September
  const laborDay = firstMonday(year, 9);
  if (month === 9 && day === laborDay.getDate()) holidayMap["Labor Day"] = true;
  // Thanksgiving: second Monday of October (Canadian)
  const thanksgiving = nthMonday(year, 10, 2);
  if (month === 10 && day === thanksgiving.getDate()) holidayMap["Thanksgiving"] = true;
  // Christmas: Dec 25
  if (month === 12 && day === 25) holidayMap["Christmas"] = true;

  for (const h of holidays) {
    if (holidayMap[h.name]) return { name: h.name, boost: h.boost };
  }
  return { name: "", boost: 0 };
}

export function computeEntry(
  d: Date,
  s: Settings,
  seasons: SeasonDef[],
  holidays: HolidayDef[],
  override?: Override | null
): CalendarEntry {
  const month = d.getMonth() + 1;
  const naturalDay = DAYS[d.getDay()];

  const dayOfWeek = override?.dayOverride ?? naturalDay;
  const season = override?.seasonOverride ?? getDefaultSeason(month);
  const seasonMult = getSeasonMult(season, seasons);
  const dayMult = getDayMult(dayOfWeek, s);

  let holiday = "";
  let holidayBoost = 0;
  if (override?.holidayOverride !== undefined && override.holidayOverride !== null) {
    holiday = override.holidayOverride;
    const h = holidays.find(h => h.name === holiday);
    holidayBoost = h?.boost ?? 0;
  } else {
    const computed = getDefaultHoliday(d, holidays);
    holiday = computed.name;
    holidayBoost = computed.boost;
  }

  const demandAdj = 0;
  const finalPct = seasonMult * dayMult + holidayBoost + demandAdj;
  const price = Math.max(s.basePrice, s.basePrice * finalPct);
  const isOverridden = !!(override?.seasonOverride || override?.holidayOverride !== undefined || override?.dayOverride);

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
  };
}

export function generateCalendar(
  s: Settings,
  seasons: SeasonDef[],
  holidays: HolidayDef[],
  overrides: Map<string, Override>,
  years = 2
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const startYear = new Date().getFullYear();
  for (let y = 0; y < years; y++) {
    const year = startYear + y;
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      entries.push(computeEntry(new Date(d), s, seasons, holidays, overrides.get(dateStr) ?? null));
    }
  }
  return entries;
}
