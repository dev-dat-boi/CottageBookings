import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  UpdateSettingsBody,
} from "@workspace/api-zod";

const router = Router();

function rowToApi(row: typeof settingsTable.$inferSelect) {
  return {
    basePrice: row.basePrice,
    seasonMultipliers: {
      Winter: row.seasonWinter,
      Low: row.seasonLow,
      Spring: row.seasonSpring,
      Summer: row.seasonSummer,
      Fall: row.seasonFall,
    },
    dayMultipliers: {
      Monday: row.dayMonday,
      Tuesday: row.dayTuesday,
      Wednesday: row.dayWednesday,
      Thursday: row.dayThursday,
      Friday: row.dayFriday,
      Saturday: row.daySaturday,
      Sunday: row.daySunday,
    },
    holidayBoosts: {
      "New Year": row.holidayNewYear,
      "St-Jean": row.holidayStJean,
      "Canada Day": row.holidayCanadaDay,
      "Construction Holiday": row.holidayConstruction,
      "Labor Day": row.holidayLaborDay,
      "Thanksgiving": row.holidayThanksgiving,
      "Christmas": row.holidayChristmas,
    },
  };
}

async function ensureDefaultSettings() {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  if (existing.length === 0) {
    await db.insert(settingsTable).values({ id: 1 });
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
      seasonWinter: body.seasonMultipliers.Winter,
      seasonLow: body.seasonMultipliers.Low,
      seasonSpring: body.seasonMultipliers.Spring,
      seasonSummer: body.seasonMultipliers.Summer,
      seasonFall: body.seasonMultipliers.Fall,
      dayMonday: body.dayMultipliers.Monday,
      dayTuesday: body.dayMultipliers.Tuesday,
      dayWednesday: body.dayMultipliers.Wednesday,
      dayThursday: body.dayMultipliers.Thursday,
      dayFriday: body.dayMultipliers.Friday,
      daySaturday: body.dayMultipliers.Saturday,
      daySunday: body.dayMultipliers.Sunday,
      holidayNewYear: body.holidayBoosts["New Year"],
      holidayStJean: body.holidayBoosts["St-Jean"],
      holidayCanadaDay: body.holidayBoosts["Canada Day"],
      holidayConstruction: body.holidayBoosts["Construction Holiday"],
      holidayLaborDay: body.holidayBoosts["Labor Day"],
      holidayThanksgiving: body.holidayBoosts.Thanksgiving,
      holidayChristmas: body.holidayBoosts.Christmas,
    }).where(eq(settingsTable.id, 1));

    const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
