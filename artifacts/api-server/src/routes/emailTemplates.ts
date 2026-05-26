import { Router } from "express";
import { db, emailTemplatesTable, emailLogTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { sendEmail, buildEmailFromTemplate } from "../lib/email";

const router = Router();

function parseTemplatePatch(body: unknown): { subject?: string | null; body?: string | null; enabled?: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const result: { subject?: string | null; body?: string | null; enabled?: boolean } = {};
  if ("subject" in b) {
    if (b.subject != null && (typeof b.subject !== "string" || b.subject.trim() === "")) return null;
    result.subject = b.subject as string | null;
  }
  if ("body" in b) {
    if (b.body != null && (typeof b.body !== "string" || b.body.trim() === "")) return null;
    result.body = b.body as string | null;
  }
  if ("enabled" in b) {
    if (typeof b.enabled !== "boolean") return null;
    result.enabled = b.enabled;
  }
  return result;
}

const DEFAULTS: Record<string, { name: string; subject: string; body: string; variables: string[] }> = {
  renter_new_booking: {
    name: "Renter: Booking Requested",
    subject: "We Received Your Cottage Booking Request — [StartDate] to [EndDate]",
    body: [
      "Hi [Name],",
      "",
      "Thanks for your booking request! We've received it and have notified the owners for their approval.",
      "",
      "Dates: [StartDate] to [EndDate] ([Nights] nights)",
      "Estimated Total: $[Total]",
      "Rate: [RateType]",
      "",
      "Cottage Address: 40 Chem. Duncan E, Barkmere, QC J0T 2V0 Canada",
      "",
      "We'll be in touch once your booking has been reviewed. This usually takes 1–2 business days.",
      "",
      "Warm regards",
    ].join('\n'),
    variables: ["[Name]", "[StartDate]", "[EndDate]", "[Nights]", "[Total]", "[RateType]", "[ExtraDetails]"],
  },
  owner_new_booking: {
    name: "Owners: New Booking Request",
    subject: "New Booking Request — [Name] ([StartDate] to [EndDate])",
    body: [
      "A new booking request has been submitted and requires your approval.",
      "",
      "Guest: [Name]",
      "Phone: [Phone]",
      "Email: [Email]",
      "Dates: [StartDate] to [EndDate] ([Nights] nights)",
      "Estimated Total: $[Total]",
      "Rate: [RateType]",
      "",
      "Notes: [ExtraDetails]",
      "",
      "Please log in to approve or decline this booking.",
    ].join('\n'),
    variables: ["[Name]", "[Phone]", "[Email]", "[StartDate]", "[EndDate]", "[Nights]", "[Total]", "[RateType]", "[ExtraDetails]"],
  },
  renter_submitted: {
    name: "Renter: Booking Approved, Awaiting Confirmation",
    subject: "Your Cottage Booking Has Been Approved — [StartDate] to [EndDate]",
    body: [
      "Hi [Name],",
      "",
      "Great news! Your cottage rental request for [StartDate] to [EndDate] has been approved.",
      "",
      "Your booking is now awaiting final confirmation. We will be in touch shortly.",
      "",
      "Dates: [StartDate] to [EndDate] ([Nights] nights)",
      "Total: $[Total]",
      "Rate: [RateType]",
      "",
      "Cottage Address: 40 Chem. Duncan E, Barkmere, QC J0T 2V0 Canada",
      "",
      "If you have any questions, feel free to reach out.",
      "",
      "Warm regards",
    ].join('\n'),
    variables: ["[Name]", "[StartDate]", "[EndDate]", "[Nights]", "[Total]", "[RateType]", "[ExtraDetails]"],
  },
  renter_confirmed: {
    name: "Renter: Booking Confirmed",
    subject: "Your Cottage Rental is Confirmed — [StartDate] to [EndDate]",
    body: [
      "Hi [Name],",
      "",
      "Great news! Your cottage rental has been confirmed and we look forward to hosting you.",
      "",
      "Dates: [StartDate] to [EndDate] ([Nights] nights)",
      "[PriceDisplay]",
      "",
      "Cottage Address: 40 Chemin Duncan Est, Barkmere, QC J0T 2V0 Canada",
      "",
      "A calendar invite (.ics) is attached to this email — open it to add the dates to your calendar.",
      "",
      "Please confirm your booking by clicking the link below:",
      "[ConfirmLink]",
      "",
      "If you have any questions, feel free to reach out.",
      "",
      "Warm regards",
    ].join('\n'),
    variables: ["[Name]", "[StartDate]", "[EndDate]", "[Nights]", "[PriceDisplay]", "[Total]", "[AgreedPrice]", "[ExtraDetails]", "[ConfirmLink]"],
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
  renter_cancelled: {
    name: "Renter: Booking Cancelled",
    subject: "Your Cottage Booking Has Been Cancelled — [StartDate] to [EndDate]",
    body: [
      "Hi [Name],",
      "",
      "We're sorry to let you know that your cottage rental booking for [StartDate] to [EndDate] has been cancelled.",
      "",
      "Dates: [StartDate] to [EndDate] ([Nights] nights)",
      "Rate: [RateType]",
      "",
      "If you believe this is an error or would like to make a new booking, please get in touch.",
      "",
      "We apologize for any inconvenience.",
      "",
      "Warm regards",
    ].join('\n'),
    variables: ["[Name]", "[StartDate]", "[EndDate]", "[Nights]", "[Total]", "[RateType]", "[ExtraDetails]"],
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
    enabled: (row as any).enabled !== false,
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

export function isTemplateEnabled(type: string, tmplMap: Record<string, typeof emailTemplatesTable.$inferSelect>): boolean {
  const row = tmplMap[type];
  if (!row) return true;
  return (row as any).enabled !== false;
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
    if (parsed.enabled !== undefined) (updates as any).enabled = parsed.enabled;
    const rows = await db.update(emailTemplatesTable).set(updates).where(eq(emailTemplatesTable.type, type)).returning();
    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update email template");
    res.status(500).json({ error: "Server error" });
  }
});

const TEST_SAMPLE_VARS: Record<string, string> = {
  Name: "John Smith",
  Phone: "555-123-4567",
  Email: "guest@example.com",
  StartDate: "2025-07-01",
  EndDate: "2025-07-07",
  Nights: "6",
  Total: "1250.00",
  AgreedPrice: "1200.00",
  RateType: "Standard Rate",
  ExtraDetails: "Example notes for test email",
  ConfirmLink: "https://example.com/booking/test-token",
};

router.post("/email-templates/:type/test", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const type = String(req.params.type);
  try {
    await ensureDefaults();
    const rows = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.type, type));
    if (rows.length === 0) { res.status(404).json({ error: "Template not found" }); return; }
    const template = rows[0];

    const user = (req as any).user;
    const adminRows = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
    if (adminRows.length === 0) { res.status(404).json({ error: "Admin user not found" }); return; }
    const adminEmail = adminRows[0].email;

    const { subject, html } = buildEmailFromTemplate(template.subject, template.body, TEST_SAMPLE_VARS);
    const ok = await sendEmail({
      to: [adminEmail],
      subject: `[TEST] ${subject}`,
      html,
      templateType: `test_${type}`,
      isTest: true,
    });
    res.json({ ok, sentTo: adminEmail });
  } catch (err) {
    req.log.error({ err }, "Failed to send test email");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/email-logs", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsedLimit = parseInt(String(req.query.limit ?? "200"), 10);
  const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200, 500);
  try {
    const rows = await db
      .select()
      .from(emailLogTable)
      .orderBy(desc(emailLogTable.sentAt))
      .limit(limit);
    res.json(rows.map(r => ({
      id: r.id,
      sentAt: r.sentAt.toISOString(),
      recipients: r.recipients,
      templateType: r.templateType,
      rentalId: r.rentalId ?? null,
      subject: r.subject,
      success: r.success,
      errorMessage: r.errorMessage ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get email logs");
    res.status(500).json({ error: "Server error" });
  }
});

export { DEFAULTS as EMAIL_TEMPLATE_DEFAULTS };
export default router;
