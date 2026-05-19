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

## Default Admin

Email: `deavon1@hotmail.com` · Password: `123`
Change the password immediately after first login.