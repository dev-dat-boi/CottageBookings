import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, settingsTable, changeHistoryTable, usersTable } from "@workspace/db";
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

function parseOwners(json: string): { name: string; email: string }[] {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
}

const router = Router();

function rowToApi(row: typeof settingsTable.$inferSelect) {
  const seasons = parseSeasons(row.seasonsJson);
  const holidays = parseHolidays(row.holidaysJson);
  const holidaysByYear = parseHolidaysByYear(row.holidaysByYearJson ?? "{}");
  const owners = parseOwners((row as any).ownersJson ?? "[]");
  return {
    basePrice: row.basePrice,
    familyRate: row.familyRate,
    familyRateCode: (row as any).familyRateCode ?? "",
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
    owners,
  };
}

export async function ensureDefaultSettings() {
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

/** Build a human-readable diff of what changed in settings */
function buildSettingsDiff(old: typeof settingsTable.$inferSelect, body: any): string {
  const diffs: string[] = [];

  if (old.basePrice !== body.basePrice) diffs.push(`Standard rate: $${old.basePrice} → $${body.basePrice}`);
  if (old.familyRate !== body.familyRate) diffs.push(`Family rate: $${old.familyRate} → $${body.familyRate}`);

  const dayMap: [keyof typeof settingsTable.$inferSelect, string][] = [
    ["dayMonday", "Monday"], ["dayTuesday", "Tuesday"], ["dayWednesday", "Wednesday"],
    ["dayThursday", "Thursday"], ["dayFriday", "Friday"], ["daySaturday", "Saturday"], ["daySunday", "Sunday"],
  ];
  for (const [col, name] of dayMap) {
    const newVal = body.dayMultipliers?.[name];
    if (newVal !== undefined && Math.abs((old[col] as number) - newVal) > 0.001) {
      diffs.push(`${name} mult: ${(old[col] as number).toFixed(2)} → ${Number(newVal).toFixed(2)}`);
    }
  }

  const oldSeasons = parseSeasons(old.seasonsJson);
  const newSeasons = body.seasons ?? [];
  if (JSON.stringify(oldSeasons) !== JSON.stringify(newSeasons)) {
    diffs.push(`Seasons: ${newSeasons.length} configured`);
  }

  const oldHols = parseHolidays(old.holidaysJson);
  const newHols = body.holidays ?? [];
  if (JSON.stringify(oldHols) !== JSON.stringify(newHols)) {
    diffs.push(`Holidays: ${newHols.length} configured`);
  }

  const oldOwners = parseOwners((old as any).ownersJson ?? "[]");
  const newOwners = body.owners ?? [];
  if (JSON.stringify(oldOwners) !== JSON.stringify(newOwners)) {
    const added = newOwners.filter((o: any) => !oldOwners.find((e: any) => e.email === o.email));
    const removed = oldOwners.filter((e: any) => !newOwners.find((o: any) => o.email === e.email));
    if (added.length) diffs.push(`Owners added: ${added.map((o: any) => o.name || o.email).join(", ")}`);
    if (removed.length) diffs.push(`Owners removed: ${removed.map((o: any) => o.name || o.email).join(", ")}`);
  }

  const oldByYear = parseHolidaysByYear(old.holidaysByYearJson ?? "{}");
  const newByYear = body.holidaysByYear ?? {};
  const yearKeys = new Set([...Object.keys(oldByYear), ...Object.keys(newByYear)]);
  for (const yr of yearKeys) {
    if (JSON.stringify(oldByYear[yr]) !== JSON.stringify(newByYear[yr])) {
      if (!newByYear[yr]) diffs.push(`Removed holidays for ${yr}`);
      else if (!oldByYear[yr]) diffs.push(`Added holidays for ${yr} (${newByYear[yr].length})`);
      else diffs.push(`Updated holidays for ${yr}`);
    }
  }

  if (diffs.length === 0) return "Settings saved (no changes)";
  return `Settings changed: ${diffs.join("; ")}`;
}

/** Sync owners list to users table: create viewer users for new owners, remove users for deleted owners */
async function syncOwnersToUsers(oldOwners: { name: string; email: string }[], newOwners: { name: string; email: string }[]): Promise<string[]> {
  const added = newOwners.filter(o => !oldOwners.find(e => e.email.toLowerCase() === o.email.toLowerCase()));
  const removed = oldOwners.filter(e => !newOwners.find(o => o.email.toLowerCase() === e.email.toLowerCase()));
  const createdPasswords: string[] = [];

  const DEFAULT_PASSWORD = "cottage123";

  for (const owner of added) {
    const emailLower = owner.email.toLowerCase().trim();
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, emailLower));
    if (existing.length === 0) {
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      await db.insert(usersTable).values({
        email: emailLower,
        name: owner.name || "",
        passwordHash: hash,
        role: "owner",
      }).onConflictDoNothing();
      createdPasswords.push(`${owner.name || owner.email} (${emailLower}): ${DEFAULT_PASSWORD}`);
    } else {
      // Update name if it changed
      if (owner.name && existing[0].name !== owner.name) {
        await db.update(usersTable).set({ name: owner.name }).where(eq(usersTable.email, emailLower));
      }
    }
  }

  for (const owner of removed) {
    const emailLower = owner.email.toLowerCase().trim();
    await db.delete(usersTable).where(eq(usersTable.email, emailLower));
  }

  return createdPasswords;
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
    const existing = await ensureDefaultSettings();
    const oldRow = existing[0];
    const oldOwners = parseOwners((oldRow as any).ownersJson ?? "[]");
    const hasOwners = Array.isArray((body as any).owners);
    const newOwners: { name: string; email: string }[] = hasOwners ? (body as any).owners : oldOwners;

    const diffDesc = buildSettingsDiff(oldRow, body);

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
      holidaysByYearJson: JSON.stringify((body as any).holidaysByYear ?? {}),
      ownersJson: JSON.stringify(newOwners),
      familyRateCode: (body as any).familyRateCode ?? "",
    } as any).where(eq(settingsTable.id, 1));

    const createdPasswords = await syncOwnersToUsers(oldOwners, newOwners);

    await db.insert(changeHistoryTable).values({
      changeType: "settings",
      description: diffDesc,
      metadata: JSON.stringify({ basePrice: body.basePrice, familyRate: body.familyRate }),
    });

    const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    const result: any = rowToApi(rows[0]);
    if (createdPasswords.length > 0) {
      result._newUserPasswords = createdPasswords;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to update settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export { rowToApi };
export default router;
