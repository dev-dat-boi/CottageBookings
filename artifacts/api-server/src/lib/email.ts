import nodemailer from "nodemailer";
import { Resend } from "resend";
import { logger } from "./logger";

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  templateType?: string;
  rentalId?: number | null;
  isTest?: boolean;
  icsAttachment?: string;
}

function getResend(): { client: Resend; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!apiKey || !from) return null;
  return { client: new Resend(apiKey), from };
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

async function writeEmailLog(opts: {
  recipients: string;
  templateType: string;
  rentalId?: number | null;
  subject: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const { db, emailLogTable } = await import("@workspace/db");
    await db.insert(emailLogTable).values({
      recipients: opts.recipients,
      templateType: opts.templateType,
      rentalId: opts.rentalId ?? null,
      subject: opts.subject,
      success: opts.success,
      errorMessage: opts.errorMessage ?? null,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write email log entry");
  }
}

export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  const templateType = opts.templateType ?? "";
  const recipients = opts.to.join(", ");

  if (!opts.isTest) {
    try {
      const { db, settingsTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
      const emailsEnabled = rows.length > 0 ? ((rows[0] as any).emailsEnabled ?? true) : true;
      if (!emailsEnabled) {
        logger.warn("Emails disabled via kill switch — skipping");
        await writeEmailLog({ recipients, templateType, rentalId: opts.rentalId, subject: opts.subject, success: false, errorMessage: "Emails disabled (kill switch is off)" });
        return false;
      }
    } catch { /* if settings check fails, proceed with sending */ }
  }

  const resend = getResend();
  if (resend) {
    try {
      const sendOpts: Parameters<typeof resend.client.emails.send>[0] = {
        from: resend.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      };
      if (opts.icsAttachment) {
        sendOpts.attachments = [{
          filename: "booking.ics",
          content: Buffer.from(opts.icsAttachment),
          contentType: "text/calendar; charset=utf-8",
        }];
      }
      const { error } = await resend.client.emails.send(sendOpts);
      if (error) throw new Error(error.message);
      await writeEmailLog({ recipients, templateType, rentalId: opts.rentalId, subject: opts.subject, success: true });
      return true;
    } catch (err) {
      logger.error({ err }, "Failed to send email via Resend");
      const message = err instanceof Error ? err.message : String(err);
      await writeEmailLog({ recipients, templateType, rentalId: opts.rentalId, subject: opts.subject, success: false, errorMessage: message });
      return false;
    }
  }

  const config = createTransport();
  if (!config) {
    logger.warn("Email not configured — skipping (set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS env vars)");
    await writeEmailLog({ recipients, templateType, rentalId: opts.rentalId, subject: opts.subject, success: false, errorMessage: "Email not configured (no RESEND_API_KEY or SMTP credentials)" });
    return false;
  }
  try {
    const mailOpts: Parameters<typeof config.transport.sendMail>[0] = {
      from: config.from,
      to: recipients,
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.icsAttachment) {
      mailOpts.attachments = [{
        filename: "booking.ics",
        content: opts.icsAttachment,
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
      }];
    }
    await config.transport.sendMail(mailOpts);
    await writeEmailLog({ recipients, templateType, rentalId: opts.rentalId, subject: opts.subject, success: true });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send email via SMTP");
    const message = err instanceof Error ? err.message : String(err);
    await writeEmailLog({ recipients, templateType, rentalId: opts.rentalId, subject: opts.subject, success: false, errorMessage: message });
    return false;
  }
}

const COTTAGE_ADDRESS = "40 Chemin Duncan Est, Barkmere, QC J0T 2V0, Canada";
const COTTAGE_EMAIL = "Bookings@40duncan.com";

function foldIcalLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let pos = 75;
  while (pos < line.length) {
    parts.push(" " + line.slice(pos, pos + 74));
    pos += 74;
  }
  return parts.join("\r\n");
}

export function buildIcalContent(rental: {
  renterName: string; phone?: string | null; email?: string | null;
  startDate: string; endDate: string; nights?: number | null;
  totalPrice?: number | null; agreedPrice?: number | null;
  rateType?: string | null; extraDetails?: string | null;
}): string {
  const uid = `rental-${rental.renterName.replace(/\s+/g, "-")}-${rental.startDate}@40duncan`;
  const dtStamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

  const [sy, sm, sd] = rental.startDate.split("-");
  const [ey, em, ed] = rental.endDate.split("-");
  const dtStart = `${sy}${sm}${sd}T130000`;
  const dtEnd = `${ey}${em}${ed}T110000`;

  const descLines: string[] = [];
  descLines.push(`Cottage Rental — ${rental.renterName}`);
  descLines.push(`Check-in: ${rental.startDate} at 13:00`);
  descLines.push(`Check-out: ${rental.endDate} at 11:00`);
  if (rental.nights != null) descLines.push(`Nights: ${rental.nights}`);
  if (rental.agreedPrice != null) descLines.push(`Agreed Price: $${Number(rental.agreedPrice).toFixed(2)}`);
  else if (rental.totalPrice != null) descLines.push(`Estimated Total: $${Number(rental.totalPrice).toFixed(2)}`);
  if (rental.extraDetails) descLines.push(`Notes: ${rental.extraDetails}`);
  descLines.push(`Address: ${COTTAGE_ADDRESS}`);
  descLines.push(`Contact: ${COTTAGE_EMAIL}`);

  const description = descLines.join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//40 Duncan Cottage//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Cottage Rental — ${rental.renterName}`,
    `LOCATION:${COTTAGE_ADDRESS}`,
    `DESCRIPTION:${description}`,
    `ORGANIZER;CN=40 Duncan:mailto:${COTTAGE_EMAIL}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcalLine).join("\r\n");
}

export function substituteEmailVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (_, key) => vars[key] ?? `[${key}]`);
}

export function buildEmailFromTemplate(
  templateSubject: string,
  templateBody: string,
  vars: Record<string, string>,
): { subject: string; html: string } {
  const subject = substituteEmailVars(templateSubject, vars);
  const body = substituteEmailVars(templateBody, vars);
  const confirmUrl = vars['ConfirmLink'];

  const htmlLines = body.split('\n').map(line => {
    if (!line.trim()) return '<br>';
    if (confirmUrl && line.trim() === confirmUrl) {
      return `<div style="text-align:center;margin:20px 0"><a href="${confirmUrl}" style="display:inline-block;padding:12px 28px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">✓ Confirm My Booking</a><p style="margin:10px 0 0;font-size:12px;color:#6b7280">Or copy link: <a href="${confirmUrl}" style="color:#16a34a">${confirmUrl}</a></p></div>`;
    }
    return `<p style="color:#444;margin:0 0 10px;font-size:14px;line-height:1.65">${line}</p>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;margin:0;padding:24px 16px">
<div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#2d6a4f;padding:20px 28px">
    <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:600">🌲 Cottage Rental</h1>
    <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px">Booking Management</p>
  </div>
  <div style="padding:28px">
    ${htmlLines}
  </div>
  <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
    <p style="color:#9ca3af;font-size:12px;margin:0">Cottage Rental Management System</p>
  </div>
</div></body></html>`;

  return { subject, html };
}
