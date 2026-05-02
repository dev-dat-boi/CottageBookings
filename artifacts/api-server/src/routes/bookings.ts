import { Router } from "express";
import { db, dayOverridesTable } from "@workspace/db";
import { computeEntry, parseSeasons, parseHolidays } from "../lib/pricing";
import type { Override } from "../lib/pricing";
import { CalculateBookingBody } from "@workspace/api-zod";
import { ensureDefaultSettings } from "./settings";

const router = Router();

router.post("/bookings/calculate", async (req, res) => {
  const parsed = CalculateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { startDate, endDate, rateType, includeMultipliers } = parsed.data;
  const effectiveRateType = (rateType === "family" ? "family" : "standard") as "standard" | "family";
  const effectiveMultipliers = effectiveRateType === "family" ? (includeMultipliers ?? false) : true;

  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid dates" });
    return;
  }
  if (end <= start) {
    res.status(400).json({ error: "End date must be after start date" });
    return;
  }

  try {
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

    const breakdown = [];
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      breakdown.push(
        computeEntry(new Date(d), s, seasons, holidays, overrides.get(dateStr) ?? null, effectiveRateType, effectiveMultipliers)
      );
    }

    const nights = breakdown.length;
    const totalPrice = breakdown.reduce((sum, e) => sum + e.price, 0);
    const avgDailyRate = nights > 0 ? totalPrice / nights : 0;

    res.json({
      startDate,
      endDate,
      nights,
      totalPrice: Math.round(totalPrice * 100) / 100,
      avgDailyRate: Math.round(avgDailyRate * 100) / 100,
      rateType: effectiveRateType,
      includeMultipliers: effectiveMultipliers,
      breakdown,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to calculate booking");
    res.status(500).json({ error: "Failed to calculate booking" });
  }
});

export default router;
