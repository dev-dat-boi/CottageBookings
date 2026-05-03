import { Router } from "express";
import { randomUUID } from "crypto";
import { db, rentalsTable, settingsTable, ownerApprovalsTable, bookingConfirmationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateRentalBody, UpdateRentalBody } from "@workspace/api-zod";
import { sendEmail, buildIcalDataUrl, buildRentalEmailHtml } from "../lib/email";
import { ensureDefaultSettings } from "./settings";
import { extractToken, requireAuth } from "../lib/auth";

const router = Router();

function parseOwners(json: string): { name: string; email: string }[] {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
}

async function getOwners(): Promise<{ name: string; email: string }[]> {
  const rows = await ensureDefaultSettings();
  return parseOwners((rows[0] as any).ownersJson ?? "[]");
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
  const rental = rentals[0];

  const ownerEmails = approvals.map(a => a.ownerEmail).filter(Boolean);
  if (ownerEmails.length > 0) {
    const ical = buildIcalDataUrl({ ...rental, agreedPrice: rental.agreedPrice ?? null });
    const html = buildRentalEmailHtml({ ...rowToApi(rental), agreedPrice: rental.agreedPrice ?? null }, ical, false);
    sendEmail({ to: ownerEmails, subject: `Rental Approved - ${rental.renterName}`, html }).catch(() => {});
  }
  if (rental.email) {
    const ical = buildIcalDataUrl({ ...rental, agreedPrice: rental.agreedPrice ?? null });
    const html = buildRentalEmailHtml({ ...rowToApi(rental), agreedPrice: rental.agreedPrice ?? null }, ical, true);
    sendEmail({ to: [rental.email], subject: `Your Cottage Rental is Confirmed — ${rental.startDate} to ${rental.endDate}`, html }).catch(() => {});
  }
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

    let updatedRows;
    if (Object.keys(updates).length > 0) {
      updatedRows = await db.update(rentalsTable).set(updates).where(eq(rentalsTable.id, id)).returning();
    } else {
      updatedRows = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
    }
    if (updatedRows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    const rental = updatedRows[0];
    const apiRental = rowToApi(rental);

    if (sendOwnerEmail || sendRenterEmail) {
      const ical = buildIcalDataUrl(rental);
      if (sendOwnerEmail) {
        const owners = await getOwners();
        const ownerEmails = owners.map(o => o.email).filter(Boolean);
        if (ownerEmails.length > 0) {
          const html = buildRentalEmailHtml({ ...apiRental, agreedPrice: rental.agreedPrice ?? null }, ical, false);
          sendEmail({ to: ownerEmails, subject: `Rental Confirmed - ${rental.renterName}`, html }).catch(() => {});
        }
      }
      if (sendRenterEmail && rental.email) {
        const html = buildRentalEmailHtml({ ...apiRental, agreedPrice: rental.agreedPrice ?? null }, ical, true);
        sendEmail({ to: [rental.email], subject: `Your Cottage Rental is Confirmed — ${rental.startDate} to ${rental.endDate}`, html }).catch(() => {});
      }
    }
    res.json(apiRental);
  } catch (err) {
    req.log.error({ err }, "Failed to update rental");
    res.status(500).json({ error: "Failed to update rental" });
  }
});

router.delete("/rentals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(bookingConfirmationsTable).where(eq(bookingConfirmationsTable.rentalId, id));
    await db.delete(ownerApprovalsTable).where(eq(ownerApprovalsTable.rentalId, id));
    await db.delete(rentalsTable).where(eq(rentalsTable.id, id));
    res.json({ deleted: 1 });
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
            const r = updatedRentals[0];
            const ical = buildIcalDataUrl({ ...r, agreedPrice: r.agreedPrice ?? null });
            if (r.email) {
              const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
              const baseDomain = domains[0];
              const baseUrl = baseDomain ? `https://${baseDomain}` : `http://localhost:80`;
              const confirmUrl = `${baseUrl}/booking/${r.confirmationToken}`;
              const confirmSection = `<div style="margin:24px 0;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;text-align:center;"><p style="margin:0 0 16px;color:#374151;font-size:15px;"><strong>Action required:</strong> Please confirm your booking by clicking the button below.</p><a href="${confirmUrl}" style="display:inline-block;padding:12px 28px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">✓ Confirm My Booking</a><p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Or visit: <a href="${confirmUrl}" style="color:#16a34a;">${confirmUrl}</a></p></div>`;
              const baseHtml = buildRentalEmailHtml({ ...rowToApi(r), agreedPrice: r.agreedPrice ?? null }, ical, true);
              const htmlWithLink = baseHtml.replace('</body>', confirmSection + '</body>');
              sendEmail({
                to: [r.email],
                subject: `Your Cottage Rental is Confirmed — Please Confirm`,
                html: htmlWithLink,
              }).catch(() => {});
            }
            const owners = await getOwners();
            const ownerEmails = owners.map(o => o.email).filter(Boolean);
            if (ownerEmails.length > 0) {
              const html = buildRentalEmailHtml({ ...rowToApi(r), agreedPrice: r.agreedPrice ?? null }, ical, false);
              sendEmail({ to: ownerEmails, subject: `Rental Confirmed - ${r.renterName}`, html }).catch(() => {});
            }
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
