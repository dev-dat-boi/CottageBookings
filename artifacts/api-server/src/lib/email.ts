import nodemailer from "nodemailer";
import { logger } from "./logger";

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass) return null;
  return {
    transport: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }),
    from,
  };
}

export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  const config = createTransport();
  if (!config) {
    logger.warn("Email not configured — skipping (set SMTP_HOST, SMTP_USER, SMTP_PASS env vars)");
    return false;
  }
  try {
    await config.transport.sendMail({ from: config.from, to: opts.to.join(", "), subject: opts.subject, html: opts.html });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send email");
    return false;
  }
}

export function buildIcalContent(rental: {
  renterName: string; startDate: string; endDate: string; extraDetails?: string;
  totalPrice?: number; agreedPrice?: number | null;
}): string {
  const uid = `rental-${rental.renterName.replace(/\s+/g, "-")}-${rental.startDate}@cottage`;
  const dtStamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const dtStart = rental.startDate.replace(/-/g, "");
  const dtEnd = rental.endDate.replace(/-/g, "");

  const priceParts: string[] = [];
  if (rental.totalPrice != null) priceParts.push(`Estimated: $${rental.totalPrice.toFixed(2)}`);
  if (rental.agreedPrice != null) priceParts.push(`Agreed: $${rental.agreedPrice.toFixed(2)}`);
  const priceNote = priceParts.length > 0 ? priceParts.join(" | ") : "";

  const descParts: string[] = [];
  if (priceNote) descParts.push(priceNote);
  if (rental.extraDetails) descParts.push(rental.extraDetails);
  const description = descParts.join("\\n");

  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cottage Pricing//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`, `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`, `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:Rental - ${rental.renterName}`,
    description ? `DESCRIPTION:${description}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

export function buildIcalDataUrl(rental: {
  renterName: string; startDate: string; endDate: string; extraDetails?: string;
  totalPrice?: number; agreedPrice?: number | null;
}): string {
  return `data:text/calendar;base64,${Buffer.from(buildIcalContent(rental)).toString("base64")}`;
}

export function buildRentalEmailHtml(rental: {
  renterName: string; phone: string; email: string; startDate: string; endDate: string;
  nights: number; totalPrice: number; agreedPrice?: number | null; rateType: string; extraDetails?: string;
}, icalDataUrl: string, forRenter = false): string {
  const greeting = forRenter
    ? `<p style="color:#555;margin:0 0 20px">Hi <strong>${rental.renterName}</strong>, your cottage rental has been confirmed!</p>`
    : `<p style="color:#555;margin:0 0 20px">A new rental has been submitted.</p>`;

  const priceRows = forRenter
    ? (rental.agreedPrice != null
        ? `<tr style="background:#f0f7f4;"><td style="padding:10px 12px;font-weight:bold;color:#555;">Agreed Price</td><td style="padding:10px 12px;font-weight:bold;color:#2d6a4f;">$${rental.agreedPrice.toFixed(2)}</td></tr>`
        : `<tr style="background:#f0f7f4;"><td style="padding:10px 12px;font-weight:bold;color:#555;">Estimated Price</td><td style="padding:10px 12px;font-weight:bold;color:#2d6a4f;">$${rental.totalPrice.toFixed(2)}</td></tr>`)
    : `<tr style="background:#f0f7f4;"><td style="padding:10px 12px;font-weight:bold;color:#555;">Estimated Price</td><td style="padding:10px 12px;font-weight:bold;color:#2d6a4f;">$${rental.totalPrice.toFixed(2)}</td></tr>
      ${rental.agreedPrice != null ? `<tr><td style="padding:10px 12px;font-weight:bold;color:#555;">Agreed Price</td><td style="padding:10px 12px;font-weight:bold;color:${rental.agreedPrice < rental.totalPrice ? "#d97706" : "#16a34a"};">$${rental.agreedPrice.toFixed(2)} ${rental.agreedPrice < rental.totalPrice ? "↓" : "↑"}</td></tr>` : ""}`;

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
  <div style="background:#2d6a4f;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:22px;">Rental - ${rental.renterName}</h1>
  </div>
  <div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0;border-top:none;">
    ${greeting}
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${!forRenter ? `<tr style="background:#f0f7f4;"><td style="padding:10px 12px;font-weight:bold;color:#555;width:40%;">Renter</td><td style="padding:10px 12px;">${rental.renterName}</td></tr>
      <tr><td style="padding:10px 12px;font-weight:bold;color:#555;">Phone</td><td style="padding:10px 12px;">${rental.phone}</td></tr>
      <tr style="background:#f0f7f4;"><td style="padding:10px 12px;font-weight:bold;color:#555;">Email</td><td style="padding:10px 12px;">${rental.email}</td></tr>` : ""}
      <tr ${forRenter ? 'style="background:#f0f7f4;"' : ""}><td style="padding:10px 12px;font-weight:bold;color:#555;">Check-in</td><td style="padding:10px 12px;">${rental.startDate}</td></tr>
      <tr ${!forRenter ? 'style="background:#f0f7f4;"' : ""}><td style="padding:10px 12px;font-weight:bold;color:#555;">Check-out</td><td style="padding:10px 12px;">${rental.endDate}</td></tr>
      <tr ${forRenter ? 'style="background:#f0f7f4;"' : ""}><td style="padding:10px 12px;font-weight:bold;color:#555;">Nights</td><td style="padding:10px 12px;">${rental.nights}</td></tr>
      ${priceRows}
      ${!forRenter ? `<tr><td style="padding:10px 12px;font-weight:bold;color:#555;">Rate Type</td><td style="padding:10px 12px;">${rental.rateType === "family" ? "Family Rate" : "Standard Rate"}</td></tr>` : ""}
      ${rental.extraDetails ? `<tr style="background:#f0f7f4;"><td style="padding:10px 12px;font-weight:bold;color:#555;">Details</td><td style="padding:10px 12px;">${rental.extraDetails}</td></tr>` : ""}
    </table>
    <div style="text-align:center;margin-top:20px;">
      <a href="${icalDataUrl}" download="rental-${rental.renterName.replace(/\s+/g, "-")}.ics"
         style="background:#2d6a4f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
        📅 Add to Calendar (.ics)
      </a>
    </div>
    <p style="color:#aaa;font-size:12px;margin-top:24px;text-align:center;">Cottage Rental Management</p>
  </div>
</div>`;
}
