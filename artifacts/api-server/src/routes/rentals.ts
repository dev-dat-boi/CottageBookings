import { Router } from "express";
import { db, rentalsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateRentalBody, UpdateRentalBody } from "@workspace/api-zod";
import { sendEmail, buildIcalDataUrl, buildRentalEmailHtml } from "../lib/email";
import { ensureDefaultSettings } from "./settings";

const router = Router();

function parseOwners(json: string): { name: string; email: string }[] {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
}

async function getOwnerEmails(): Promise<string[]> {
  const rows = await ensureDefaultSettings();
  const owners = parseOwners((rows[0] as any).ownersJson ?? "[]");
  return owners.map((o: any) => o.email).filter(Boolean);
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
    const inserted = await db.insert(rentalsTable).values({
      renterName: body.renterName,
      phone: body.phone,
      email: body.email,
      startDate: body.startDate,
      endDate: body.endDate,
      nights: body.nights,
      totalPrice: body.totalPrice,
      rateType: body.rateType,
      extraDetails: body.extraDetails ?? "",
      status: "submitted",
    }).returning();
    const rental = inserted[0];
    const apiRental = rowToApi(rental);

    // Email owners
    const ownerEmails = await getOwnerEmails();
    if (ownerEmails.length > 0) {
      const ical = buildIcalDataUrl(rental);
      const html = buildRentalEmailHtml(apiRental, ical, false);
      sendEmail({ to: ownerEmails, subject: `Rental - ${rental.renterName}`, html }).catch(() => {});
    }

    res.status(201).json(apiRental);
  } catch (err) {
    req.log.error({ err }, "Failed to create rental");
    res.status(500).json({ error: "Failed to create rental" });
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
  const { status, renterName, phone, email, extraDetails, sendOwnerEmail, sendRenterEmail } = parsed.data;
  try {
    const updates: Partial<typeof rentalsTable.$inferInsert> = {};
    if (status != null) updates.status = status;
    if (renterName != null) updates.renterName = renterName;
    if (phone != null) updates.phone = phone;
    if (email != null) updates.email = email;
    if (extraDetails != null) updates.extraDetails = extraDetails;

    if (Object.keys(updates).length === 0 && !sendOwnerEmail && !sendRenterEmail) {
      const rows = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
      if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
      res.json(rowToApi(rows[0]));
      return;
    }

    let updatedRows;
    if (Object.keys(updates).length > 0) {
      updatedRows = await db.update(rentalsTable).set(updates).where(eq(rentalsTable.id, id)).returning();
    } else {
      updatedRows = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
    }
    if (updatedRows.length === 0) { res.status(404).json({ error: "Not found" }); return; }

    const rental = updatedRows[0];
    const apiRental = rowToApi(rental);

    // Send emails if requested
    if (sendOwnerEmail || sendRenterEmail) {
      const ical = buildIcalDataUrl(rental);
      if (sendOwnerEmail) {
        const ownerEmails = await getOwnerEmails();
        if (ownerEmails.length > 0) {
          const html = buildRentalEmailHtml(apiRental, ical, false);
          sendEmail({ to: ownerEmails, subject: `Rental Confirmed - ${rental.renterName}`, html }).catch(() => {});
        }
      }
      if (sendRenterEmail && rental.email) {
        const html = buildRentalEmailHtml(apiRental, ical, true);
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
    await db.delete(rentalsTable).where(eq(rentalsTable.id, id));
    res.json({ deleted: 1 });
  } catch (err) {
    req.log.error({ err }, "Failed to delete rental");
    res.status(500).json({ error: "Failed to delete rental" });
  }
});

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
    rateType: row.rateType,
    extraDetails: row.extraDetails,
    status: row.status,
  };
}

export default router;
