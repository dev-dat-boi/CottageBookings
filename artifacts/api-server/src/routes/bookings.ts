import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeEntry } from "../lib/pricing";
import { CalculateBookingBody } from "@workspace/api-zod";

const router = Router();

router.post("/bookings/calculate", async (req, res) => {
  const parsed = CalculateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { startDate, endDate } = parsed.data;
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid dates" });
    return;
  }

  if (end <= start) {
    res.status(400).json({ error: "End date must be after start date" });
    return;
  }

  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    if (rows.length === 0) {
      await db.insert(settingsTable).values({ id: 1 });
    }
    const s = rows.length > 0 ? rows[0] : (await db.select().from(settingsTable).where(eq(settingsTable.id, 1)))[0];

    const breakdown = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      breakdown.push(computeEntry(new Date(d), s));
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
      breakdown,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to calculate booking");
    res.status(500).json({ error: "Failed to calculate booking" });
  }
});

export default router;
