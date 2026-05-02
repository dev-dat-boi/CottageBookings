import { Router } from "express";
import { db, changeHistoryTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

const router = Router();

router.get("/history", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
    const rows = await db
      .select()
      .from(changeHistoryTable)
      .orderBy(desc(changeHistoryTable.createdAt))
      .limit(limit);
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to get history");
    res.status(500).json({ error: "Failed to get history" });
  }
});

router.delete("/history", async (req, res) => {
  try {
    const result = await db.delete(changeHistoryTable);
    res.json({ deleted: result.rowCount ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to clear history");
    res.status(500).json({ error: "Failed to clear history" });
  }
});

export default router;
