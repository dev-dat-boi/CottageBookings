import { Router } from "express";
import { randomUUID } from "crypto";
import { db, rentalsTable, settingsTable, ownerApprovalsTable, bookingConfirmationsTable, usersTable, emailTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateRentalBody, UpdateRentalBody } from "@workspace/api-zod";
import { sendEmail, buildIcalDataUrl, buildEmailFromTemplate } from "../lib/email";
import { EMAIL_TEMPLATE_DEFAULTS } from "./emailTemplates";
import { ensureDefaultSettings } from "./settings";
import { extractToken, requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "../lib/googleCalendar";

const router = Router();

function parseOwners(json: string): { name: string; email: string }[] {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
}

async function getOwners(): Promise<{ name: string; email: string }[]> {
  const rows = await ensureDefaultSettings();
  return parseOwners((rows[0] as any).ownersJson ?? "[]");
}

async function getEffectiveCalendarId(): Promise<string | null> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    const dbCalendarId = rows[0] ? (rows[0] as any).googleCalendarId : null;
    return dbCalendarId || process.env.GOOGLE_CALENDAR_ID || null;
  } catch {
    return process.env.GOOGLE_CALENDAR_ID || null;
  }
}

async function syncConfirmedRentalToCalendar(rental: typeof rentalsTable.$inferSelect): Promise<void> {
  try {
    const calendarId = await getEffectiveCalendarId();
    const existingEventId = rental.googleCalendarEventId;
    if (existingEventId) {
      await updateCalendarEvent(existingEventId, rental, calendarId);
    } else {
      const eventId = await createCalendarEvent(rental, calendarId);
      if (eventId) {
        await db.update(rentalsTable)
          .set({ googleCalendarEventId: eventId })
          .where(eq(rentalsTable.id, rental.id));
      }
    }
  } catch (err) {
    logger.error({ err, rentalId: rental.id }, "Google Calendar sync failed (non-fatal)");
  }
}

async function removeRentalFromCalendar(rental: typeof rentalsTable.$inferSelect): Promise<void> {
  const eventId = rental.googleCalendarEventId;
  if (!eventId) return;
  try {
    const calendarId = await getEffectiveCalendarId();
    const deleted = await deleteCalendarEvent(eventId, calendarId);
    if (deleted) {
      // Only clear the stored event ID on confirmed deletion so a retry is possible on failure
      await db.update(rentalsTable)
        .set({ googleCalendarEventId: null })
        .where(eq(rentalsTable.id, rental.id));
    }
  } catch (err) {
    logger.error({ err, rentalId: rental.id }, "Google Calendar delete failed (non-fatal)");
  }
}

function buildVars(row: typeof rentalsTable.$inferSelect): Record<string, string> {
  return {
    Name: row.renterName,
    Phone: row.phone ?? "",
    Email: row.email ?? "",
    StartDate: row.startDate,
    EndDate: row.endDate,
    Nights: String(row.nights),
    Total: (row.agreedPrice ?? row.totalPrice).toFixed(2),
    AgreedPrice: row.agreedPrice != null ? row.agreedPrice.toFixed(2) : (row.totalPrice ?? 0).toFixed(2),
    RateType: row.rateType === "family" ? "Family Rate" : "Standard Rate",
    ExtraDetails: row.extraDetails ?? "",
  };
}

function getBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
  return domains[0] ? `https://${domains[0]}` : "http://localhost:80";
}

async function getTemplateMap(): Promise<Record<string, typeof emailTemplatesTable.$inferSelect>> {
  const rows = await db.select().from(emailTemplatesTable);
  return Object.fromEntries(rows.map(t => [t.type, t]));
}

async function sendStatusEmails(
  rental: typeof rentalsTable.$inferSelect,
  newStatus: "pending_approval" | "submitted" | "confirmed" | "cancelled",
): Promise<void> {
  try {
    const ical = buildIcalDataUrl({ ...rental, agreedPrice: rental.agreedPrice ?? null });
    const tmplMap = await getTemplateMap();
    const vars = buildVars(rental);
    const owners = await getOwners();
    const ownerEmails = owners.map(o => o.email).filter(Boolean);

    if (newStatus === "pending_approval") {
      if (ownerEmails.length > 0) {
        const def = EMAIL_TEMPLATE_DEFAULTS.owner_new_booking;
        const tmpl = tmplMap["owner_new_booking"] ?? def;
        const { subject, html } = buildEmailFromTemplate(tmpl.subject, tmpl.body, vars, ical);
        sendEmail({ to: ownerEmails, subject, html, templateType: "owner_new_booking", rentalId: rental.id }).catch(err =>
          logger.error({ err, rentalId: rental.id, template: "owner_new_booking" }, "Failed to send owner_new_booking email"),
        );
      }
    } else if (newStatus === "submitted") {
      if (rental.email) {
        const def = EMAIL_TEMPLATE_DEFAULTS.renter_submitted;
        const tmpl = tmplMap["renter_submitted"] ?? def;
        const { subject, html } = buildEmailFromTemplate(tmpl.subject, tmpl.body, vars, ical);
        sendEmail({ to: [rental.email], subject, html, templateType: "renter_submitted", rentalId: rental.id }).catch(err =>
          logger.error({ err, rentalId: rental.id, template: "renter_submitted" }, "Failed to send renter_submitted email"),
        );
      }
    } else if (newStatus === "confirmed") {
      const baseUrl = getBaseUrl();
      const confirmUrl = `${baseUrl}/booking/${rental.confirmationToken}`;
      if (rental.email) {
        const def = EMAIL_TEMPLATE_DEFAULTS.renter_confirmed;
        const tmpl = tmplMap["renter_confirmed"] ?? def;
        const { subject, html } = buildEmailFromTemplate(tmpl.subject, tmpl.body, { ...vars, ConfirmLink: confirmUrl }, ical);
        sendEmail({ to: [rental.email], subject, html, templateType: "renter_confirmed", rentalId: rental.id }).catch(err =>
          logger.error({ err, rentalId: rental.id, template: "renter_confirmed" }, "Failed to send renter_confirmed email"),
        );
      }
      if (ownerEmails.length > 0) {
        const def = EMAIL_TEMPLATE_DEFAULTS.owner_confirmed;
        const tmpl = tmplMap["owner_confirmed"] ?? def;
        const { subject, html } = buildEmailFromTemplate(tmpl.subject, tmpl.body, vars, ical);
        sendEmail({ to: ownerEmails, subject, html, templateType: "owner_confirmed", rentalId: rental.id }).catch(err =>
          logger.error({ err, rentalId: rental.id, template: "owner_confirmed" }, "Failed to send owner_confirmed email"),
        );
      }
    } else if (newStatus === "cancelled") {
      if (rental.email) {
        const def = EMAIL_TEMPLATE_DEFAULTS.renter_cancelled;
        const tmpl = tmplMap["renter_cancelled"] ?? def;
        const { subject, html } = buildEmailFromTemplate(tmpl.subject, tmpl.body, vars);
        sendEmail({ to: [rental.email], subject, html, templateType: "renter_cancelled", rentalId: rental.id }).catch(err =>
          logger.error({ err, rentalId: rental.id, template: "renter_cancelled" }, "Failed to send renter_cancelled email"),
        );
      }
    }
  } catch (err) {
    logger.error({ err, rentalId: rental.id, newStatus }, "sendStatusEmails: unexpected error preparing email");
  }
}

function rowToApi(row: typeof rentalsTable.$inferSelect) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    renterName: row.renterName,
    phone: row.phone,
    email: row.email,
    startDate: row.startDate,
    endDate: row.endDate,
    nights: row.nights,
    totalPrice: row.totalPrice,
    agreedPrice: row.agreedPrice ?? null,
    rateType: row.rateType,
    bookingType: row.bookingType,
    extraDetails: row.extraDetails,
    status: row.status,
    confirmationToken: row.confirmationToken ?? null,
    renterConfirmed: row.renterConfirmed,
  };
}

function confirmationRowToApi(row: typeof bookingConfirmationsTable.$inferSelect) {
  return {
    id: row.id,
    rentalId: row.rentalId,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    confirmed: row.confirmed,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}

async function seedConfirmationsForRental(rentalId: number) {
  try {
    const users = await db.select().from(usersTable);
    for (const u of users) {
      await db.insert(bookingConfirmationsTable)
        .values({ rentalId, userId: u.id, userName: u.name, userEmail: u.email, confirmed: false })
        .onConflictDoNothing();
    }
  } catch {}
}

function rowToPublic(row: typeof rentalsTable.$inferSelect) {
  return {
    id: row.id,
    confirmationToken: row.confirmationToken ?? "",
    renterName: row.renterName,
    startDate: row.startDate,
    endDate: row.endDate,
    nights: row.nights,
    totalPrice: row.totalPrice,
    agreedPrice: row.agreedPrice ?? null,
    rateType: row.rateType,
    bookingType: row.bookingType,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    extraDetails: row.extraDetails,
    renterConfirmed: row.renterConfirmed,
  };
}

async function checkAndAutoConfirm(rentalId: number) {
  const approvals = await db.select().from(ownerApprovalsTable).where(eq(ownerApprovalsTable.rentalId, rentalId));
  if (approvals.length === 0) return;
  const allApproved = approvals.every(a => a.approved);
  if (!allApproved) return;

  const rentals = await db.update(rentalsTable)
    .set({ status: "submitted" })
    .where(and(eq(rentalsTable.id, rentalId), eq(rentalsTable.status, "pending_approval")))
    .returning();
  if (rentals.length === 0) return;

  await sendStatusEmails(rentals[0], "submitted");
}

router.get("/rentals", async (req, res) => {
  try {
    const rows = await db.select().from(rentalsTable).orderBy(rentalsTable.createdAt);
    res.json(rows.map(rowToApi));
  } catch (err) {
    req.log.error({ err }, "Failed to get rentals");
    res.status(500).json({ error: "Failed to get rentals" });
  }
});

router.post("/rentals", async (req, res) => {
  const parsed = CreateRentalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid rental data", details: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  try {
    const owners = await getOwners();
    const initialStatus = owners.length === 0 ? "submitted" : "pending_approval";
    const token = randomUUID();
    const inserted = await db.insert(rentalsTable).values({
      renterName: body.renterName,
      phone: body.phone,
      email: body.email,
      startDate: body.startDate,
      endDate: body.endDate,
      nights: body.nights,
      totalPrice: body.totalPrice,
      rateType: body.rateType,
      bookingType: (body as any).bookingType ?? "standard",
      extraDetails: body.extraDetails ?? "",
      status: initialStatus,
      confirmationToken: token,
    }).returning();
    const rental = inserted[0];

    if (owners.length > 0) {
      for (const owner of owners) {
        await db.insert(ownerApprovalsTable).values({
          rentalId: rental.id,
          ownerEmail: owner.email,
          ownerName: owner.name,
          approved: false,
        });
      }
    }

    await seedConfirmationsForRental(rental.id);

    res.status(201).json(rowToApi(rental));

    await sendStatusEmails(rental, initialStatus as "pending_approval" | "submitted");
  } catch (err) {
    req.log.error({ err }, "Failed to create rental");
    res.status(500).json({ error: "Failed to create rental" });
  }
});

// Public confirmation endpoint — must be declared BEFORE /rentals/:id
router.get("/rentals/confirm/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const rows = await db.select().from(rentalsTable)
      .where(eq(rentalsTable.confirmationToken, token));
    if (rows.length === 0) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json(rowToPublic(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get booking by token");
    res.status(500).json({ error: "Server error" });
  }
});

// Renter confirms their booking via token link — no auth required
router.post("/rentals/renter-confirm", async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") { res.status(400).json({ error: "token required" }); return; }
  try {
    const rows = await db.select().from(rentalsTable).where(eq(rentalsTable.confirmationToken, token));
    if (rows.length === 0) { res.status(404).json({ error: "Booking not found" }); return; }
    await db.update(rentalsTable).set({ renterConfirmed: true }).where(eq(rentalsTable.confirmationToken, token));
    res.json({ ok: true, renterConfirmed: true });
  } catch (err) {
    req.log.error({ err }, "Failed to confirm booking as renter");
    res.status(500).json({ error: "Server error" });
  }
});

// Get rental IDs where current user has pending confirmations — auth required
router.get("/rentals/my-pending-confirmations", requireAuth, async (req, res) => {
  const user = (req as any).user;
  try {
    const myConfs = await db.select().from(bookingConfirmationsTable)
      .where(and(eq(bookingConfirmationsTable.userId, user.userId), eq(bookingConfirmationsTable.confirmed, false)));
    const rentalIds = myConfs.map(c => c.rentalId);

    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    const now = new Date();
    const allRentals = await db.select().from(rentalsTable);
    const urgentRentalIds = allRentals.filter(r => {
      if (r.status === "cancelled") return false;
      const startDate = new Date(r.startDate + "T12:00:00");
      return startDate > now && startDate <= twoWeeks && (r.status !== "confirmed" || !r.renterConfirmed);
    }).map(r => r.id);

    res.json({ rentalIds, urgentRentalIds });
  } catch (err) {
    req.log.error({ err }, "Failed to get pending confirmations");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/rentals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rows = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get rental");
    res.status(500).json({ error: "Failed to get rental" });
  }
});

router.patch("/rentals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateRentalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid data", details: parsed.error.issues }); return; }
  const { status, renterName, phone, email, extraDetails, agreedPrice, sendOwnerEmail, sendRenterEmail, renterConfirmed } = parsed.data;
  try {
    const updates: Partial<typeof rentalsTable.$inferInsert> = {};
    if (status != null) updates.status = status;
    if (renterName != null) updates.renterName = renterName;
    if (phone != null) updates.phone = phone;
    if (email != null) updates.email = email;
    if (extraDetails != null) updates.extraDetails = extraDetails;
    if (agreedPrice !== undefined) updates.agreedPrice = agreedPrice ?? undefined;
    if (renterConfirmed != null) updates.renterConfirmed = renterConfirmed;

    const previousRows = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
    if (previousRows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    const previousStatus = previousRows[0].status;

    let updatedRows;
    if (Object.keys(updates).length > 0) {
      updatedRows = await db.update(rentalsTable).set(updates).where(eq(rentalsTable.id, id)).returning();
    } else {
      updatedRows = previousRows;
    }
    if (updatedRows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    const rental = updatedRows[0];
    const apiRental = rowToApi(rental);

    res.json(apiRental);

    const newStatus = rental.status;
    const statusChanged = status != null && newStatus !== previousStatus;

    // Google Calendar sync — exactly one action per request, fire-and-forget
    if (statusChanged && newStatus === "confirmed") {
      // Newly confirmed — create (or update if event already exists)
      syncConfirmedRentalToCalendar(rental).catch(() => {});
    } else if (statusChanged && previousStatus === "confirmed") {
      // Moved away from confirmed (cancelled, etc.) — remove from calendar
      removeRentalFromCalendar(rental).catch(() => {});
    } else if (!statusChanged && newStatus === "confirmed" && Object.keys(updates).length > 0) {
      // Already confirmed, details changed — update the event
      syncConfirmedRentalToCalendar(rental).catch(() => {});
    }

    try {
      if (statusChanged && (newStatus === "submitted" || newStatus === "confirmed" || newStatus === "cancelled")) {
        await sendStatusEmails(rental, newStatus as "submitted" | "confirmed" | "cancelled");
      }

      // Skip manual resend for recipients that already received an automatic email
      // from the status transition above to avoid duplicates.
      const autoSentToRenter = statusChanged && (newStatus === "submitted" || newStatus === "confirmed");
      const autoSentToOwners = statusChanged && newStatus === "confirmed";

      const needsManualOwner = sendOwnerEmail && !autoSentToOwners;
      const needsManualRenter = sendRenterEmail && !autoSentToRenter;

      if (needsManualOwner || needsManualRenter) {
        const ical = buildIcalDataUrl(rental);
        const tmplMap = await getTemplateMap();
        const vars = buildVars(rental);

        if (needsManualOwner) {
          const owners = await getOwners();
          const ownerEmails = owners.map(o => o.email).filter(Boolean);
          if (ownerEmails.length > 0) {
            const def = EMAIL_TEMPLATE_DEFAULTS.owner_confirmed;
            const tmpl = tmplMap["owner_confirmed"] ?? def;
            const { subject, html } = buildEmailFromTemplate(tmpl.subject, tmpl.body, vars, ical);
            sendEmail({ to: ownerEmails, subject, html, templateType: "owner_confirmed", rentalId: rental.id }).catch(err =>
              req.log.error({ err, rentalId: rental.id }, "Failed to send manual owner email"),
            );
          }
        }
        if (needsManualRenter && rental.email) {
          const def = EMAIL_TEMPLATE_DEFAULTS.renter_confirmed;
          const tmpl = tmplMap["renter_confirmed"] ?? def;
          const confirmUrl = `${getBaseUrl()}/booking/${rental.confirmationToken}`;
          const { subject, html } = buildEmailFromTemplate(tmpl.subject, tmpl.body, { ...vars, ConfirmLink: confirmUrl }, ical);
          sendEmail({ to: [rental.email], subject, html, templateType: "renter_confirmed", rentalId: rental.id }).catch(err =>
            req.log.error({ err, rentalId: rental.id }, "Failed to send manual renter email"),
          );
        }
      }
    } catch (emailErr) {
      req.log.error({ err: emailErr }, "Failed to send post-update emails");
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update rental");
    res.status(500).json({ error: "Failed to update rental" });
  }
});

router.delete("/rentals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rentalRows = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
    await db.delete(bookingConfirmationsTable).where(eq(bookingConfirmationsTable.rentalId, id));
    await db.delete(ownerApprovalsTable).where(eq(ownerApprovalsTable.rentalId, id));
    await db.delete(rentalsTable).where(eq(rentalsTable.id, id));
    res.json({ deleted: 1 });
    if (rentalRows.length > 0) {
      removeRentalFromCalendar(rentalRows[0]).catch(() => {});
    }
  } catch (err) {
    req.log.error({ err }, "Failed to delete rental");
    res.status(500).json({ error: "Failed to delete rental" });
  }
});

router.get("/rentals/:id/approvals", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rows = await db.select().from(ownerApprovalsTable).where(eq(ownerApprovalsTable.rentalId, id));
    res.json(rows.map(r => ({
      id: r.id,
      rentalId: r.rentalId,
      ownerEmail: r.ownerEmail,
      ownerName: r.ownerName,
      approved: r.approved,
      approvedAt: r.approvedAt?.toISOString() ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get approvals");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/rentals/:id/approvals/:ownerEmail", async (req, res) => {
  const rentalId = parseInt(req.params.id);
  const ownerEmail = decodeURIComponent(req.params.ownerEmail);
  if (isNaN(rentalId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { approved } = req.body;
  if (typeof approved !== "boolean") { res.status(400).json({ error: "'approved' boolean required" }); return; }
  try {
    await db.update(ownerApprovalsTable)
      .set({ approved, approvedAt: approved ? new Date() : null })
      .where(and(eq(ownerApprovalsTable.rentalId, rentalId), eq(ownerApprovalsTable.ownerEmail, ownerEmail)));

    if (approved) await checkAndAutoConfirm(rentalId);

    const rental = await db.select().from(rentalsTable).where(eq(rentalsTable.id, rentalId));
    if (rental.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(rental[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to set approval");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/rentals/:id/confirmations", requireAuth, async (req, res) => {
  const rentalId = parseInt(req.params.id as string);
  if (isNaN(rentalId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = (req as any).user;
  try {
    const rows = await db.select().from(bookingConfirmationsTable)
      .where(eq(bookingConfirmationsTable.rentalId, rentalId));
    if (user.role === "admin") {
      res.json(rows.map(confirmationRowToApi));
    } else {
      res.json(rows.filter(r => r.userId === user.userId).map(confirmationRowToApi));
    }
  } catch (err) {
    req.log.error({ err }, "Failed to get confirmations");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/rentals/:id/confirmations/:userId", requireAuth, async (req, res) => {
  const rentalId = parseInt(req.params.id as string);
  const targetUserId = parseInt(req.params.userId as string);
  if (isNaN(rentalId) || isNaN(targetUserId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = (req as any).user;
  if (user.role !== "admin" && user.userId !== targetUserId) {
    res.status(403).json({ error: "You can only update your own confirmation" });
    return;
  }
  const { confirmed } = req.body;
  if (typeof confirmed !== "boolean") { res.status(400).json({ error: "'confirmed' boolean required" }); return; }
  try {
    const existing = await db.select().from(bookingConfirmationsTable)
      .where(and(eq(bookingConfirmationsTable.rentalId, rentalId), eq(bookingConfirmationsTable.userId, targetUserId)));
    let result;
    if (existing.length === 0) {
      const u = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
      if (u.length === 0) { res.status(404).json({ error: "User not found" }); return; }
      const inserted = await db.insert(bookingConfirmationsTable).values({
        rentalId, userId: targetUserId, userName: u[0].name, userEmail: u[0].email,
        confirmed, confirmedAt: confirmed ? new Date() : null,
      }).returning();
      result = inserted[0];
    } else {
      const updated = await db.update(bookingConfirmationsTable)
        .set({ confirmed, confirmedAt: confirmed ? new Date() : null })
        .where(and(eq(bookingConfirmationsTable.rentalId, rentalId), eq(bookingConfirmationsTable.userId, targetUserId)))
        .returning();
      result = updated[0];
    }
    res.json(confirmationRowToApi(result));

    // After updating, check if ALL users for this rental have confirmed — auto-confirm if so
    try {
      const allConfs = await db.select().from(bookingConfirmationsTable)
        .where(eq(bookingConfirmationsTable.rentalId, rentalId));
      if (allConfs.length > 0 && allConfs.every(r => r.confirmed)) {
        const rentalRows = await db.select().from(rentalsTable).where(eq(rentalsTable.id, rentalId));
        if (
          rentalRows.length > 0 &&
          rentalRows[0].status !== "confirmed" &&
          rentalRows[0].status !== "cancelled"
        ) {
          const updatedRentals = await db.update(rentalsTable)
            .set({ status: "confirmed" })
            .where(eq(rentalsTable.id, rentalId))
            .returning();
          if (updatedRentals.length > 0) {
            await sendStatusEmails(updatedRentals[0], "confirmed");
            syncConfirmedRentalToCalendar(updatedRentals[0]).catch(() => {});
          }
        }
      }
    } catch {}

  } catch (err) {
    req.log.error({ err }, "Failed to set confirmation");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
