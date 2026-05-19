# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Application: Cottage Pricing Manager

### Feature Overview

A full rental pricing + booking management web app for a cottage.

### Auth System

- JWT-based authentication (bcryptjs + jsonwebtoken)
- Roles: `admin`, `viewer`
- Admin seeded: `deavon1@hotmail.com` / `123`
- Token stored in `localStorage`
- **Not logged in** → Home + Bookings tabs only (read-only)
- **Logged in (viewer)** → All tabs visible, Control Panel read-only
- **Admin** → All tabs, full edit access

### Database Tables

- `settings` — pricing config (base/family rate, seasons, day multipliers, holidays, owners)
- `day_overrides` — per-date calendar overrides
- `change_history` — audit log of all pricing/calendar changes (now shows diffs only)
- `rentals` — rental bookings (status, agreedPrice, bookingType)
- `owner_approvals` — per-owner approval records for each rental
- `users` — app users (email, passwordHash, role)
- `cottage_info` — title, description, photos (base64 stored as JSON)

### Rental Status Flow

`pending_approval` → (all owners approve) → `submitted` → (admin confirms) → `confirmed`

### API Routes

- `POST /api/auth/login` — returns JWT + user
- `GET /api/auth/me` — current user from token
- `GET/POST /api/users` — user management (admin only)
- `PATCH/DELETE /api/users/:id` — update/delete user
- `GET/PUT /api/cottage-info` — home page content
- `GET/POST /api/rentals` — list + create rentals
- `PATCH/DELETE /api/rentals/:id` — update/delete rental
- `GET /api/rentals/:id/approvals` — approval records
- `PATCH /api/rentals/:id/approvals/:ownerEmail` — approve/revoke
- `GET/PUT /api/settings` — pricing config
- `GET /api/calendar` — calendar data
- `POST /api/bookings/calculate` — price calculation
- `GET/DELETE /api/history` — change history

### Frontend Components

- `HomeTab` — cottage description + photo gallery (editable by admin)
- `BookingsTab` — date picker (booked dates blocked), rate calculation, standard + personal use booking
- `ControlPanelTab` — pricing settings (read-only for non-admins)
- `CalendarTab` — monthly calendar with rate breakdown + day overrides
- `RentalsTab` — rental list, detail dialog, agreed price (orange/green), Google Calendar link, owner approval panel
- `HistoryTab` — change log with diff-style descriptions
- `LoginDialog` — email/password sign-in
- `UserManagementDialog` — admin user CRUD

### Contexts

- `AuthContext` — JWT auth state, login/logout, isAdmin flag
- `AdminLockContext` — legacy (kept for compatibility, no longer controls access)

### Email / SMTP Setup

Automatic booking emails are sent via Nodemailer. Configure these environment variables (e.g. in Railway dashboard under Variables):

| Variable    | Required | Description                                      |
|-------------|----------|--------------------------------------------------|
| `SMTP_HOST` | Yes      | SMTP server hostname (e.g. `smtp.gmail.com`)     |
| `SMTP_PORT` | No       | SMTP port — defaults to `587` (TLS/STARTTLS)     |
| `SMTP_USER` | Yes      | SMTP username / email address                    |
| `SMTP_PASS` | Yes      | SMTP password or app-specific password           |
| `SMTP_FROM` | No       | Sender address — defaults to `SMTP_USER`         |

If SMTP vars are not set, email sending is skipped silently (a warning is logged).

#### Email triggers

| Event                                | Recipients         | Template              |
|--------------------------------------|--------------------|-----------------------|
| New booking created (owners exist)   | All owners         | `owner_new_booking`   |
| New booking created (no owners)      | Guest              | `renter_submitted`    |
| All owners approve → `submitted`     | Guest              | `renter_submitted`    |
| Admin sets status → `confirmed`      | Guest + all owners | `renter_confirmed` / `owner_confirmed` |

Templates are editable by admins via the Email Templates section of the Control Panel.

### Google Calendar Auto-Sync

Confirmed bookings are automatically pushed to a Google Calendar. Configure these environment variables:

| Variable                     | Required | Description                                                             |
|------------------------------|----------|-------------------------------------------------------------------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON`| Yes      | Full JSON content of a Google service account key file                  |
| `GOOGLE_CALENDAR_ID`         | Yes*     | Target calendar ID (e.g. `abc@group.calendar.google.com`)               |

*`GOOGLE_CALENDAR_ID` can alternatively be set via the "Google Calendar Sync" section in the Control Panel (Settings tab), which takes precedence over the env var.

If neither `GOOGLE_SERVICE_ACCOUNT_JSON` nor a calendar ID is configured, the auto-sync is silently skipped. The manual "Add to Google Calendar" button in the Rentals tab remains available as a fallback.

#### Setup steps

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the **Google Calendar API** for the project.
3. Under **IAM & Admin → Service Accounts**, create a new service account.
4. Create a JSON key for the service account and download it.
5. In Google Calendar settings, share your calendar with the service account's email as an **Editor**.
6. Set `GOOGLE_SERVICE_ACCOUNT_JSON` to the full contents of the downloaded JSON key file.
7. Set `GOOGLE_CALENDAR_ID` to your calendar's ID (found under Calendar Settings → Integrate calendar).

#### Calendar event lifecycle

| Event                              | Calendar action            |
|------------------------------------|----------------------------|
| Rental status → `confirmed`        | Create or update event     |
| Confirmed rental details changed   | Update existing event      |
| Status changed away from confirmed | Delete event + clear ID    |
| Rental deleted                     | Delete event + clear ID    |
