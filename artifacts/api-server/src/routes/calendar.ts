import { Router } from "express";
import { db, settingsTable, dayOverridesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateCalendar, computeEntry, parseSeasons, parseHolidays } from "../lib/pricing";
import type { Override } from "../lib/pricing";
import { ensureDefaultSettings } from "./settings";

const router = Router();

const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function getSettingsAndOverrides() {
  const rows = await ensureDefaultSettings();
  const s = rows[0];
  const seasons = parseSeasons(s.seasonsJson);
  const holidays = parseHolidays(s.holidaysJson);
  const overrideRows = await db.select().from(dayOverridesTable);
  const overrides = new Map<string, Override>();
  for (const row of overrideRows) {
    overrides.set(row.date, {
      seasonOverride: row.seasonOverride ?? null,
      holidayOverride: row.holidayOverride ?? null,
      dayOverride: row.dayOverride ?? null,
    });
  }
  return { s, seasons, holidays, overrides };
}

router.get("/calendar", async (req, res) => {
  try {
    const fromYear = req.query.fromYear ? parseInt(req.query.fromYear as string) : undefined;
    const toYear = req.query.toYear ? parseInt(req.query.toYear as string) : undefined;
    const { s, seasons, holidays, overrides } = await getSettingsAndOverrides();
    res.json(generateCalendar(s, seasons, holidays, overrides, fromYear, toYear));
  } catch (err) {
    req.log.error({ err }, "Failed to get calendar");
    res.status(500).json({ error: "Failed to get calendar" });
  }
});

// Bulk-days must be registered before /:date/override to avoid route conflict
router.post("/calendar/bulk-days", async (req, res) => {
  const { startDay, fromYear, toYear } = req.body;
  if (!startDay || !DAY_OPTIONS.includes(startDay)) {
    res.status(400).json({ error: "Invalid or missing startDay. Must be a full day name (e.g. Monday)." });
    return;
  }

  const curYear = new Date().getFullYear();
  const from: number = typeof fromYear === "number" ? fromYear : curYear;
  const to: number = typeof toYear === "number" ? toYear : from + 1;

  const startIndex = DAY_OPTIONS.indexOf(startDay);

  const dates: string[] = [];
  for (let year = from; year <= to; year++) {
    const end = new Date(year + 1, 0, 1);
    for (let d = new Date(year, 0, 1); d < end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
  }

  try {
    for (let i = 0; i < dates.length; i++) {
      const dayName = DAY_OPTIONS[(startIndex + i) % 7];
      await db
        .insert(dayOverridesTable)
        .values({ date: dates[i], dayOverride: dayName, seasonOverride: null, holidayOverride: null })
        .onConflictDoUpdate({
          target: dayOverridesTable.date,
          set: { dayOverride: dayName },
        });
    }
    res.json({ updated: dates.length });
  } catch (err) {
    req.log.error({ err }, "Failed to apply bulk day overrides");
    res.status(500).json({ error: "Failed to apply bulk day overrides" });
  }
});

router.put("/calendar/:date/override", async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    return;
  }

  const { seasonOverride = null, holidayOverride = null, dayOverride = null } = req.body;

  // If all fields are null → delete the row entirely
  if (seasonOverride === null && holidayOverride === null && dayOverride === null) {
    await db.delete(dayOverridesTable).where(eq(dayOverridesTable.date, date));
    const { s, seasons, holidays, overrides } = await getSettingsAndOverrides();
    const entry = computeEntry(new Date(date + "T12:00:00Z"), s, seasons, holidays, overrides.get(date) ?? null);
    res.json(entry);
    return;
  }

  try {
    await db
      .insert(dayOverridesTable)
      .values({ date, seasonOverride, holidayOverride, dayOverride })
      .onConflictDoUpdate({
        target: dayOverridesTable.date,
        set: { seasonOverride, holidayOverride, dayOverride },
      });

    const { s, seasons, holidays, overrides } = await getSettingsAndOverrides();
    const d = new Date(date + "T12:00:00Z");
    const entry = computeEntry(d, s, seasons, holidays, overrides.get(date) ?? null);
    res.json(entry);
  } catch (err) {
    req.log.error({ err }, "Failed to set day override");
    res.status(500).json({ error: "Failed to set day override" });
  }
});

router.delete("/calendar/:date/override", async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    return;
  }

  try {
    await db.delete(dayOverridesTable).where(eq(dayOverridesTable.date, date));
    const { s, seasons, holidays, overrides } = await getSettingsAndOverrides();
    const d = new Date(date + "T12:00:00Z");
    const entry = computeEntry(d, s, seasons, holidays, overrides.get(date) ?? null);
    res.json(entry);
  } catch (err) {
    req.log.error({ err }, "Failed to remove day override");
    res.status(500).json({ error: "Failed to remove day override" });
  }
});

export default router;
