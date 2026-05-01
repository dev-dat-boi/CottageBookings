import { Router } from "express";
import { db, settingsTable, dayOverridesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateCalendar, computeEntry, parseSeasons, parseHolidays } from "../lib/pricing";
import type { Override } from "../lib/pricing";
import { ensureDefaultSettings } from "./settings";

const router = Router();

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
    const { s, seasons, holidays, overrides } = await getSettingsAndOverrides();
    res.json(generateCalendar(s, seasons, holidays, overrides));
  } catch (err) {
    req.log.error({ err }, "Failed to get calendar");
    res.status(500).json({ error: "Failed to get calendar" });
  }
});

router.put("/calendar/:date/override", async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    return;
  }

  const { seasonOverride = null, holidayOverride = null, dayOverride = null } = req.body;

  try {
    await db.insert(dayOverridesTable)
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
