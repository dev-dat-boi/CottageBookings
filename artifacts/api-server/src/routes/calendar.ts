import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateCalendar } from "../lib/pricing";

const router = Router();

router.get("/calendar", async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    if (rows.length === 0) {
      await db.insert(settingsTable).values({ id: 1 });
      const newRows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
      res.json(generateCalendar(newRows[0]));
      return;
    }
    res.json(generateCalendar(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get calendar");
    res.status(500).json({ error: "Failed to get calendar" });
  }
});

export default router;
