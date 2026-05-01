import type { Settings } from "@workspace/db";

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
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getSeason(month: number): string {
  if (month <= 3) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  if (month <= 10) return "Fall";
  return "Low";
}

function getSeasonMult(season: string, s: Settings): number {
  switch (season) {
    case "Winter": return s.seasonWinter;
    case "Low": return s.seasonLow;
    case "Spring": return s.seasonSpring;
    case "Summer": return s.seasonSummer;
    case "Fall": return s.seasonFall;
    default: return 1;
  }
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

/** First Monday of a month in a given year */
function firstMonday(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  const day = d.getDay(); // 0=Sun
  const offset = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  return new Date(year, month - 1, 1 + offset);
}

/** Nth Monday of a month in a given year (n=1-indexed) */
function nthMonday(year: number, month: number, n: number): Date {
  const first = firstMonday(year, month);
  return new Date(year, month - 1, first.getDate() + (n - 1) * 7);
}

/**
 * Construction Holiday in Quebec: typically 2 weeks starting from the last
 * full week of July. We use July 14–27 as a reasonable approximation.
 */
function isConstructionHoliday(d: Date): boolean {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return m === 7 && day >= 14 && day <= 27;
}

function getHoliday(d: Date, s: Settings): { name: string; boost: number } {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  // New Year: Jan 1
  if (month === 1 && day === 1) return { name: "New Year", boost: s.holidayNewYear };

  // St-Jean: Jun 24
  if (month === 6 && day === 24) return { name: "St-Jean", boost: s.holidayStJean };

  // Canada Day: Jul 1
  if (month === 7 && day === 1) return { name: "Canada Day", boost: s.holidayCanadaDay };

  // Construction Holiday: ~Jul 14–27
  if (isConstructionHoliday(d)) return { name: "Construction Holiday", boost: s.holidayConstruction };

  // Labor Day: first Monday of September
  const laborDay = firstMonday(year, 9);
  if (month === 9 && day === laborDay.getDate()) return { name: "Labor Day", boost: s.holidayLaborDay };

  // Thanksgiving: second Monday of October (Canadian)
  const thanksgiving = nthMonday(year, 10, 2);
  if (month === 10 && day === thanksgiving.getDate()) return { name: "Thanksgiving", boost: s.holidayThanksgiving };

  // Christmas: Dec 25
  if (month === 12 && day === 25) return { name: "Christmas", boost: s.holidayChristmas };

  return { name: "", boost: 0 };
}

export function computeEntry(d: Date, s: Settings): CalendarEntry {
  const month = d.getMonth() + 1;
  const dayName = DAYS[d.getDay()];
  const season = getSeason(month);
  const seasonMult = getSeasonMult(season, s);
  const dayMult = getDayMult(dayName, s);
  const { name: holiday, boost: holidayBoost } = getHoliday(d, s);
  const demandAdj = 0;
  const finalPct = seasonMult * dayMult + holidayBoost + demandAdj;
  const price = Math.max(s.basePrice, s.basePrice * finalPct);

  return {
    date: d.toISOString().slice(0, 10),
    dayOfWeek: dayName,
    season,
    seasonMult,
    dayMult,
    holiday,
    holidayBoost,
    demandAdj,
    finalPct,
    price: Math.round(price * 100) / 100,
  };
}

export function generateCalendar(s: Settings, years = 2): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const startYear = new Date().getFullYear();
  for (let y = 0; y < years; y++) {
    const year = startYear + y;
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      entries.push(computeEntry(new Date(d), s));
    }
  }
  return entries;
}
