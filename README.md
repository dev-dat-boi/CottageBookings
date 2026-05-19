# Cottage Pricing Manager

A full-featured rental pricing and booking management web app for a cottage property.

## Features

- Dynamic pricing by season, day of week, and holidays
- Booking request flow with renter confirmation link
- Owner approval workflow
- Customizable email templates (renter & owner notifications)
- Admin panel: users, settings, history, calendar
- JWT-based authentication with admin / viewer / mod roles

## Stack

- **Frontend**: React + Vite + Tailwind CSS (shadcn/ui)
- **Backend**: Express 5 + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Emails**: Nodemailer (SMTP)
- **Monorepo**: pnpm workspaces

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-provided by Replit) |
| `SESSION_SECRET` | JWT signing secret |
| `SMTP_HOST` | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port — 587 for TLS, 465 for SSL (default: 587) |
| `SMTP_USER` | SMTP username / sender email address |
| `SMTP_PASS` | SMTP password or app-specific password |
| `SMTP_FROM` | Override the "From" address shown to recipients (optional) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON content of a Google service account key file (for calendar auto-sync) |
| `GOOGLE_CALENDAR_ID` | Target Google Calendar ID (e.g. `abc@group.calendar.google.com`); can also be set in the app's Control Panel |

### Google Calendar Auto-Sync Setup

When a booking is confirmed it automatically appears in a Google Calendar. If these env vars are not set, the app works as before and the manual "Add to Google Calendar" button remains.

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Calendar API** for your project.
2. Create a Service Account under **IAM & Admin → Service Accounts** and download a JSON key.
3. Share your Google Calendar with the service account email (give it **Editor** access).
4. Set `GOOGLE_SERVICE_ACCOUNT_JSON` to the full contents of the downloaded JSON file.
5. Set `GOOGLE_CALENDAR_ID` to your calendar's ID (found in Calendar Settings → Integrate calendar), **or** enter it in the Control Panel → Google Calendar Sync section.

## Default Admin

Email: `deavon1@hotmail.com` · Password: `123`
Change the password immediately after first login.