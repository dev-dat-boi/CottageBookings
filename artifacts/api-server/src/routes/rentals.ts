import { Router } from "express";
import { randomUUID } from "crypto";
import { db, rentalsTable, settingsTable, ownerApprovalsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateRentalBody, UpdateRentalBody } from "@workspace/api-zod";
import { sendEmail, buildIcalDataUrl, buildRentalEmailHtml } from "../lib/email";
import { ensureDefaultSettings } from "./settings";
import { extractToken } from "../lib/auth";

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
  };
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
  const { status, renterName, phone, email, extraDetails, agreedPrice, sendOwnerEmail, sendRenterEmail } = parsed.data;
  try {
    const updates: Partial<typeof rentalsTable.$inferInsert> = {};
    if (status != null) updates.status = status;
    if (renterName != null) updates.renterName = renterName;
    if (phone != null) updates.phone = phone;
    if (email != null) updates.email = email;
    if (extraDetails != null) updates.extraDetails = extraDetails;
    if (agreedPrice !== undefined) updates.agreedPrice = agreedPrice ?? undefined;

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

export default router;
