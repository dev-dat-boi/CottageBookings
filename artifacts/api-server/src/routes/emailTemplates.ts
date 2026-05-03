import { Router } from "express";
import { db, emailTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

function parseTemplatePatch(body: unknown): { subject?: string | null; body?: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const result: { subject?: string | null; body?: string | null } = {};
  if ("subject" in b) {
    if (b.subject != null && (typeof b.subject !== "string" || b.subject.trim() === "")) return null;
    result.subject = b.subject as string | null;
  }
  if ("body" in b) {
    if (b.body != null && (typeof b.body !== "string" || b.body.trim() === "")) return null;
    result.body = b.body as string | null;
  }
  return result;
}

const DEFAULTS: Record<string, { name: string; subject: string; body: string; variables: string[] }> = {
  renter_confirmed: {
    name: "Renter: Booking Confirmed",
    subject: "Your Cottage Rental is Confirmed — [StartDate] to [EndDate]",
    body: [
      "Hi [Name],",
      "",
      "Great news! Your cottage rental has been confirmed and we look forward to hosting you.",
      "",
      "Dates: [StartDate] to [EndDate] ([Nights] nights)",
      "Total: $[Total]",
      "Rate: [RateType]",
      "",
      "Please confirm your booking by clicking the link below:",
      "[ConfirmLink]",
      "",
      "If you have any questions, feel free to reach out.",
      "",
      "Warm regards",
    ].join('\n'),
    variables: ["[Name]", "[StartDate]", "[EndDate]", "[Nights]", "[Total]", "[RateType]", "[Phone]", "[ExtraDetails]", "[ConfirmLink]"],
  },
  owner_confirmed: {
    name: "Owners & Admins: Booking Confirmed",
    subject: "Rental Confirmed — [Name] ([StartDate] to [EndDate])",
    body: [
      "A rental booking has been confirmed.",
      "",
      "Guest: [Name]",
      "Phone: [Phone]",
      "Email: [Email]",
      "Dates: [StartDate] to [EndDate] ([Nights] nights)",
      "Total: $[Total]",
      "Rate: [RateType]",
      "",
      "Notes: [ExtraDetails]",
    ].join('\n'),
    variables: ["[Name]", "[Phone]", "[Email]", "[StartDate]", "[EndDate]", "[Nights]", "[Total]", "[AgreedPrice]", "[RateType]", "[ExtraDetails]"],
  },
};

async function ensureDefaults() {
  for (const [type, d] of Object.entries(DEFAULTS)) {
    await db.insert(emailTemplatesTable)
      .values({ type, name: d.name, subject: d.subject, body: d.body })
      .onConflictDoNothing();
  }
}

function rowToApi(row: typeof emailTemplatesTable.$inferSelect) {
  const meta = DEFAULTS[row.type];
  return {
    type: row.type,
    name: row.name || meta?.name || row.type,
    subject: row.subject,
    body: row.body,
    variables: meta?.variables ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireAdmin(req: any, res: any): boolean {
  const user = req.user;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return false;
  }
  return true;
}

router.get("/email-templates", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureDefaults();
    const rows = await db.select().from(emailTemplatesTable).orderBy(emailTemplatesTable.type);
    res.json(rows.map(rowToApi));
  } catch (err) {
    req.log.error({ err }, "Failed to get email templates");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/email-templates/:type", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const type = String(req.params.type);
  try {
    await ensureDefaults();
    const rows = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.type, type));
    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get email template");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/email-templates/:type", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const type = String(req.params.type);
  const parsed = parseTemplatePatch(req.body);
  if (!parsed) { res.status(400).json({ error: "Invalid data" }); return; }
  try {
    await ensureDefaults();
    const updates: Partial<typeof emailTemplatesTable.$inferInsert> = { updatedAt: new Date() };
    if (parsed.subject != null) updates.subject = parsed.subject;
    if (parsed.body != null) updates.body = parsed.body;
    const rows = await db.update(emailTemplatesTable).set(updates).where(eq(emailTemplatesTable.type, type)).returning();
    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update email template");
    res.status(500).json({ error: "Server error" });
  }
});

export { DEFAULTS as EMAIL_TEMPLATE_DEFAULTS };
export default router;
