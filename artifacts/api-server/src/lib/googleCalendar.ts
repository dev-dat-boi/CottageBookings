import { logger } from "./logger";

interface CalendarEventInput {
  renterName: string;
  startDate: string;
  endDate: string;
  nights: number;
  totalPrice: number;
  agreedPrice?: number | null;
  phone?: string | null;
  email?: string | null;
  extraDetails?: string | null;
  bookingType?: string | null;
  status?: string | null;
}

interface CalendarEventBody {
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
}

type GoogleCalendarApi = {
  events: {
    insert(params: { calendarId: string; requestBody: CalendarEventBody }): Promise<{ data: { id: string } }>;
    update(params: { calendarId: string; eventId: string; requestBody: CalendarEventBody }): Promise<unknown>;
    delete(params: { calendarId: string; eventId: string }): Promise<unknown>;
  };
};

type GoogleAuthClient = {
  getAccessToken(): Promise<{ token: string | null }>;
};

function getAuthClient(): GoogleAuthClient | null {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require("googleapis") as typeof import("googleapis");
    const credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    }) as unknown as GoogleAuthClient;
  } catch (err) {
    logger.warn({ err }, "Google Calendar: failed to initialize auth client");
    return null;
  }
}

function getCalendarApi(auth: GoogleAuthClient): GoogleCalendarApi {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = require("googleapis") as typeof import("googleapis");
  return google.calendar({ version: "v3", auth: auth as Parameters<typeof google.calendar>[0]["auth"] }) as unknown as GoogleCalendarApi;
}

function resolveCalendarId(overrideCalendarId?: string | null): string | null {
  return overrideCalendarId || process.env.GOOGLE_CALENDAR_ID || null;
}

function statusLabel(status?: string | null): string {
  switch (status) {
    case "pending_approval": return "REQUEST";
    case "submitted":        return "AWAITING CONFIRMATION";
    case "confirmed":        return "CONFIRMED";
    case "cancelled":        return "CANCELLED";
    default:                 return (status ?? "").toUpperCase();
  }
}

function bookingTypeLabel(bookingType?: string | null): string {
  return bookingType === "personal" ? "Personal Use" : "Cottage Rental";
}

function buildEventBody(rental: CalendarEventInput): CalendarEventBody {
  const priceParts: string[] = [`Estimated: $${rental.totalPrice.toFixed(2)}`];
  if (rental.agreedPrice != null) priceParts.push(`Agreed: $${rental.agreedPrice.toFixed(2)}`);
  const descParts: string[] = [
    `Status: ${statusLabel(rental.status)}`,
    `${rental.nights} nights`,
    priceParts.join(" | "),
  ];
  if (rental.phone) descParts.push(`Phone: ${rental.phone}`);
  if (rental.email) descParts.push(`Email: ${rental.email}`);
  if (rental.extraDetails) descParts.push(rental.extraDetails);

  return {
    summary: `${bookingTypeLabel(rental.bookingType)} - ${rental.renterName} - ${statusLabel(rental.status)}`,
    description: descParts.join("\n"),
    start: { date: rental.startDate },
    end: { date: rental.endDate },
  };
}

export async function createCalendarEvent(
  rental: CalendarEventInput,
  overrideCalendarId?: string | null,
): Promise<string | null> {
  const auth = getAuthClient();
  if (!auth) return null;

  const calendarId = resolveCalendarId(overrideCalendarId);
  if (!calendarId) {
    logger.warn("Google Calendar: no calendar ID configured — skipping create");
    return null;
  }

  try {
    const calendar = getCalendarApi(auth);
    const resp = await calendar.events.insert({
      calendarId,
      requestBody: buildEventBody(rental),
    });
    const eventId = typeof resp.data.id === "string" && resp.data.id ? resp.data.id : null;
    if (!eventId) {
      logger.warn({ calendarId }, "Google Calendar: event created but ID was missing in response");
      return null;
    }
    logger.info({ eventId, calendarId }, "Google Calendar: event created");
    return eventId;
  } catch (err) {
    logger.error({ err }, "Google Calendar: failed to create event");
    return null;
  }
}

export async function updateCalendarEvent(
  eventId: string,
  rental: CalendarEventInput,
  overrideCalendarId?: string | null,
): Promise<void> {
  const auth = getAuthClient();
  if (!auth) return;

  const calendarId = resolveCalendarId(overrideCalendarId);
  if (!calendarId) {
    logger.warn("Google Calendar: no calendar ID configured — skipping update");
    return;
  }

  try {
    const calendar = getCalendarApi(auth);
    await calendar.events.update({
      calendarId,
      eventId,
      requestBody: buildEventBody(rental),
    });
    logger.info({ eventId, calendarId }, "Google Calendar: event updated");
  } catch (err) {
    logger.error({ err }, "Google Calendar: failed to update event");
  }
}

export async function deleteCalendarEvent(
  eventId: string,
  overrideCalendarId?: string | null,
): Promise<boolean> {
  const auth = getAuthClient();
  if (!auth) return false;

  const calendarId = resolveCalendarId(overrideCalendarId);
  if (!calendarId) {
    logger.warn("Google Calendar: no calendar ID configured — skipping delete");
    return false;
  }

  try {
    const calendar = getCalendarApi(auth);
    await calendar.events.delete({ calendarId, eventId });
    logger.info({ eventId, calendarId }, "Google Calendar: event deleted");
    return true;
  } catch (err) {
    logger.error({ err }, "Google Calendar: failed to delete event");
    return false;
  }
}
