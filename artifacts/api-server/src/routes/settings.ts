import { Router } from "express";
import { db, settingsTable, changeHistoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { DEFAULT_SEASONS, DEFAULT_HOLIDAYS, parseSeasons, parseHolidays } from "../lib/pricing";

function parseHolidaysByYear(json: string): Record<string, ReturnType<typeof parseHolidays>> {
  try {
    const obj = JSON.parse(json);
    return typeof obj === "object" && !Array.isArray(obj) && obj !== null ? obj : {};
  } catch {
    return {};
  }
}

const router = Router();

function rowToApi(row: typeof settingsTable.$inferSelect) {
  const seasons = parseSeasons(row.seasonsJson);
  const holidays = parseHolidays(row.holidaysJson);
  const holidaysByYear = parseHolidaysByYear(row.holidaysByYearJson ?? "{}");
  return {
    basePrice: row.basePrice,
    familyRate: row.familyRate,
    seasons,
    dayMultipliers: {
      Monday: row.dayMonday,
      Tuesday: row.dayTuesday,
      Wednesday: row.dayWednesday,
      Thursday: row.dayThursday,
      Friday: row.dayFriday,
      Saturday: row.daySaturday,
      Sunday: row.daySunday,
    },
    holidays,
    holidaysByYear,
  };
}

async function ensureDefaultSettings() {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  if (existing.length === 0) {
    await db.insert(settingsTable).values({
      id: 1,
      seasonsJson: JSON.stringify(DEFAULT_SEASONS),
      holidaysJson: JSON.stringify(DEFAULT_HOLIDAYS),
    });
  } else {
    const row = existing[0];
    const seasons = JSON.parse(row.seasonsJson || "[]");
    const holidays = JSON.parse(row.holidaysJson || "[]");
    const updates: Partial<typeof settingsTable.$inferInsert> = {};
    if (!Array.isArray(seasons) || seasons.length === 0) {
      updates.seasonsJson = JSON.stringify(DEFAULT_SEASONS);
    }
    if (!Array.isArray(holidays) || holidays.length === 0) {
      updates.holidaysJson = JSON.stringify(DEFAULT_HOLIDAYS);
    }
    if (Object.keys(updates).length > 0) {
      await db.update(settingsTable).set(updates).where(eq(settingsTable.id, 1));
    }
  }
  return db.select().from(settingsTable).where(eq(settingsTable.id, 1));
}

router.get("/settings", async (req, res) => {
  try {
    const rows = await ensureDefaultSettings();
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get settings");
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/settings", async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings", details: parsed.error.issues });
    return;
  }
  const body = parsed.data;

  try {
    await ensureDefaultSettings();
    await db.update(settingsTable).set({
      basePrice: body.basePrice,
      familyRate: body.familyRate,
      dayMonday: body.dayMultipliers.Monday,
      dayTuesday: body.dayMultipliers.Tuesday,
      dayWednesday: body.dayMultipliers.Wednesday,
      dayThursday: body.dayMultipliers.Thursday,
      dayFriday: body.dayMultipliers.Friday,
      daySaturday: body.dayMultipliers.Saturday,
      daySunday: body.dayMultipliers.Sunday,
      seasonsJson: JSON.stringify(body.seasons),
      holidaysJson: JSON.stringify(body.holidays),
      holidaysByYearJson: JSON.stringify(body.holidaysByYear ?? {}),
    }).where(eq(settingsTable.id, 1));

    // Log the change
    const yearKeys = Object.keys(body.holidaysByYear ?? {});
    const changeDesc = `Settings saved: base $${body.basePrice}, family $${body.familyRate}, ${body.seasons.length} seasons, ${body.holidays.length} default holidays${yearKeys.length > 0 ? `, per-year overrides for ${yearKeys.join(", ")}` : ""}`;
    await db.insert(changeHistoryTable).values({
      changeType: "settings",
      description: changeDesc,
      metadata: JSON.stringify({ basePrice: body.basePrice, familyRate: body.familyRate }),
    });

    const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export { ensureDefaultSettings, rowToApi };
export default router;
