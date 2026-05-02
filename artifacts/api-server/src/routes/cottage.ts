import { Router } from "express";
import { db, cottageInfoTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

function rowToApi(row: typeof cottageInfoTable.$inferSelect) {
  let photos: string[] = [];
  try { photos = JSON.parse(row.photosJson); } catch { photos = []; }
  return { title: row.title, description: row.description, photos };
}

async function ensureCottageInfo() {
  const rows = await db.select().from(cottageInfoTable).where(eq(cottageInfoTable.id, 1));
  if (rows.length === 0) {
    await db.insert(cottageInfoTable).values({ id: 1, title: "Our Cottage", description: "", photosJson: "[]" });
    return db.select().from(cottageInfoTable).where(eq(cottageInfoTable.id, 1));
  }
  return rows;
}

router.get("/cottage-info", async (req, res) => {
  try {
    const rows = await ensureCottageInfo();
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get cottage info");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/cottage-info", requireAdmin, async (req, res) => {
  const { title, description, photos } = req.body;
  if (typeof title !== "string" || typeof description !== "string") {
    res.status(400).json({ error: "title and description required" });
    return;
  }
  try {
    await ensureCottageInfo();
    await db.update(cottageInfoTable).set({
      title: title.trim(),
      description,
      photosJson: JSON.stringify(Array.isArray(photos) ? photos : []),
      updatedAt: new Date(),
    }).where(eq(cottageInfoTable.id, 1));
    const rows = await db.select().from(cottageInfoTable).where(eq(cottageInfoTable.id, 1));
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update cottage info");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
