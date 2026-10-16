# Leave Management Portal

A full-stack web application for applying for, approving and administering employee leave.

- **Employees** apply for leave and track balances and request history.
- **Managers** review (approve / reject) requests from the employees assigned to them, and can apply for their own leave.
- **Administrators** manage accounts, roles, reporting lines, leave types and yearly entitlements.

Email notifications (Gmail SMTP via Nodemailer) are sent when a request is submitted, approved or rejected.

## Technology stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 18, Vite, React Router, Axios, responsive CSS (no UI framework) |
| Backend  | Node.js (≥ 20), Express 5, REST, JWT (httpOnly cookie), bcrypt (`bcryptjs`), Zod validation, Helmet, rate limiting |
| Database | MongoDB with Mongoose |
| Email    | Nodemailer over SMTP (configured for Gmail) |
| Testing  | Vitest + Supertest against an isolated MongoDB test database |

## Project structure

```text
leave-management-portal/
├── client/                 React app (Vite)
│   └── src/
│       ├── api/            Axios instance + endpoint functions
│       ├── components/     Layout, DataTable, Modal, ConfirmDialog, UI primitives
│       ├── context/        AuthContext (session), ToastContext (notifications)
│       ├── hooks/          useApi (loading / error / reload)
│       ├── pages/          auth/, employee/, manager/, admin/
│       ├── routes/         AppRoutes, ProtectedRoute
│       └── utils/          date-only helpers, roles, error messages
├── server/
│   ├── src/
│   │   ├── config/         env, db, constants
│   │   ├── middleware/     authenticate / authorize, validate, error handler
│   │   ├── models/         User, LeaveType, LeaveBalance, LeaveRequest
│   │   ├── modules/        controllers: auth, leave, dashboard, admin
│   │   ├── routes/         all /api routes with role guards
│   │   ├── services/       business rules: leave, balance, user, email/
│   │   ├── validators/     Zod request schemas
│   │   ├── app.js          Express app (no DB connection; used by tests)
│   │   └── server.js       connects to MongoDB and starts the HTTP server
│   ├── scripts/            seed.js, test-email.js
│   └── tests/              Vitest + Supertest suites
├── docs/API.md             REST API reference
└── package.json            npm workspaces + root scripts
```

## Features

### Employee
- Profile (name, email, role, department, reporting manager).
- Leave balance cards per leave type: total entitled, approved days used, pending days reserved, available days.
- Apply-for-leave form (leave type, start date, end date, reason) with a live working-day preview.
- Leave history with status filter (Pending / Approved / Rejected), manager remarks and a details dialog.

### Manager
- Dashboard: pending count, team size, on leave today, approved / rejected this year.
- Pending requests from assigned employees: name, email, leave type, dates, days, reason, available balance.
- Approve / reject with confirmation dialog; remarks optional on approval and **required** on rejection.
- Team history (reviewer and review time) and team member list.
- "My Leave" page for the manager's own requests (reviewed by *their* manager).

### Administrator
- Overview: account counts, leave-type counts, request counts for the year, recent requests.
- Employees: list / search / filter, create employee, manager and administrator accounts, edit details,
  change roles, reset passwords, assign reporting managers, activate / deactivate.
- Leave types: create, edit name / description / default annual entitlement, activate / deactivate.
- Entitlements: choose employee and year; view entitled, used, pending and remaining days; set or update
  entitled and carry-forward days per leave type.
- "Approvals" page: an administrator who is someone's reporting manager reviews them here.

## Accounts and first-time sign-in

There is **no public signup**: nobody can create an account or choose a role for themselves. Every account is created by an administrator.

1. **Admin creates the account.** Go to Admin → **Employees** → **Add user** and enter the name, a unique email, a temporary password, the role
   (Employee, Manager or Administrator), the reporting manager and the department. Create as many managers as you need, then create employees
   and select their manager in **Reporting manager**.
2. **Admin shares the email and temporary password** with the person through a secure channel.
3. **First sign-in.** The person signs in with the temporary password and is taken straight to **Set your password**. Until they choose their own
   password (8+ characters, with a letter and a number), the server refuses every other request (`403 PASSWORD_CHANGE_REQUIRED`), so the redirect
   can't be bypassed.
4. **Afterwards** they sign in with their own password and land on their dashboard: Manager → Team Approvals, Employee → My Leave, Admin → Overview.
   Managers see and review only the employees assigned to them.
5. **Forgotten password.** An administrator edits the user and enters a new temporary password. The user is signed out everywhere and must choose a
   new password at next sign-in. Anyone can also use **Change password** in the top bar at any time.

Passwords are stored only as bcrypt hashes. Changing a password invalidates the account's other sessions.
The seeded demo accounts are created directly by the seed script, so they are not asked to change their password.

## Business rules (enforced on the server)

- **Dates** are calendar dates (`YYYY-MM-DD`) stored as UTC midnight, so no timezone shift can occur.
  Invalid dates, a start date after the end date, and start dates before today are rejected.
- **Working days** are counted by the server: Monday–Friday inclusive. Weekends are excluded.
  Public holidays are **not** excluded (no holiday calendar is implemented). A range with no working days is rejected.
- **Cross-year requests are rejected** with a message asking for one request per calendar year, so each
  request is charged to exactly one year's balance.
- **Overlaps**: a request overlapping the employee's own Pending or Approved request is rejected (409).
  Rejected requests do not block dates.
- **Balance**: `Available = (Entitled + Carry-forward) − Approved days used − Pending days reserved`.
  Submitting reserves days (pending); approval moves them from pending to used (no double deduction);
  rejection releases them. Reservation is an atomic conditional update, so concurrent submissions cannot overdraw.
  If no entitlement was set for a year, one is created from the leave type's default annual entitlement.
- **Review**: only the employee's assigned manager may review, never their own request, and only once
  (a second decision returns 409, even under concurrent clicks). The reviewer and timestamp are recorded.
- **Admin safeguards**: admins cannot change their own role or deactivate themselves; a manager with active
  reports cannot be demoted or deactivated until those reports are reassigned; circular reporting lines are rejected;
  entitlements cannot be reduced below days already used + reserved.
- Inactive users cannot sign in, and existing sessions stop working immediately. Inactive leave types cannot be
  requested. Historical requests are always kept.

## Prerequisites

- Node.js 20 or newer (tested with Node 24) and npm
- MongoDB 6+ running locally (tested with MongoDB 8.3 as a Windows service) or a MongoDB Atlas connection string

## Installation (Windows)

```powershell
cd leave-management-portal
npm install
Copy-Item server\.env.example server\.env   # only if server\.env does not exist yet
```

Edit `server\.env` and set at least `MONGODB_URI` and a long random `JWT_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Environment variables (`server/.env`)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NODE_ENV` | no | `development` (default) or `production` |
| `PORT` | no | API port, default `5000` |
| `MONGODB_URI` | **yes** | e.g. `mongodb://127.0.0.1:27017/leave_portal` |
| `MONGODB_URI_TEST` | for tests | Base URI for tests; each test file uses its own temporary database on this server |
| `JWT_SECRET` | **yes** | Token signing secret (≥ 32 chars in production) |
| `JWT_EXPIRES_IN` | no | Session length, default `8h` |
| `CLIENT_ORIGIN` | no | Frontend origin for CORS, default `http://localhost:5173` |
| `COOKIE_SECURE` | no | `true` when served over HTTPS |
| `LOGIN_RATE_LIMIT` | no | Login attempts per IP per 15 minutes, default `20` |
| `SMTP_HOST` | for email | `smtp.gmail.com`. Leave empty to disable email |
| `SMTP_PORT` | for email | `465` (SSL) or `587` (STARTTLS) |
| `SMTP_SECURE` | for email | `true` for port 465, `false` for 587 |
| `SMTP_USER` | for email | Gmail address used to sign in to SMTP |
| `SMTP_PASS` | for email | 16-character Gmail **App Password** (spaces are ignored) |
| `MAIL_FROM` | for email | Sender, e.g. `"Leave Management Portal <you@gmail.com>"` |
| `EMAIL_ENABLED` | no | Set `false` to turn notifications off without removing SMTP settings |
| `APP_URL` | no | Base URL used for links in emails (defaults to `CLIENT_ORIGIN`) |

The client needs no configuration. The Vite dev server proxies `/api` to `http://localhost:5000`
(override with `VITE_API_PROXY_TARGET` in `client/.env`, see `client/.env.example`).

`server/.env` is listed in `.gitignore` and must never be committed. Only `.env.example` files (placeholders only) are tracked.

## MongoDB setup

- **Local (Windows):** install MongoDB Community Server with "Run as a service". Check that it is running:
  `Get-Service MongoDB`. The default URI `mongodb://127.0.0.1:27017/leave_portal` then works as is.
- **Atlas:** create a cluster and database user, allow your IP, and set
  `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/leave_portal`.

Collections and indexes are created automatically.

## Seed demo data

```powershell
npm run seed
```

Creates one administrator, one manager, two employees assigned to the manager, Casual / Sick / Earned leave
types, balances for the current year and sample requests (Approved, Pending, Rejected). The script is
**idempotent**: records are matched by email / code / natural keys and only inserted when missing, so rerunning it
never creates duplicates or overwrites changes made in the app.

### Demo credentials

| Role | Email | Password |
| ---- | ----- | -------- |
| Administrator | `admin@leaveportal.local` | `Admin@123` |
| Manager | `manager@leaveportal.local` | `Manager@123` |
| Employee | `priya@leaveportal.local` | `Employee@123` |
| Employee | `rahul@leaveportal.local` | `Employee@123` |

These are development-only credentials. Demo accounts use the reserved `.local` domain, so no real email is sent to them
(see "Email notifications" below).

## Running the application

Development (API with auto-restart + Vite dev server, from the project root):

```powershell
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:5000/api> (health check: <http://localhost:5000/api/health>)

Or run them separately in two terminals: `npm run dev -w server` and `npm run dev -w client`.

Production build:

```powershell
npm run build                       # builds client\dist
$env:NODE_ENV="production"; npm start   # serves the API and the built client on http://localhost:5000
```

(Production requires `JWT_SECRET` of 32+ characters. Use `COOKIE_SECURE=true` behind HTTPS.)

## Email notifications (Gmail SMTP)

| Event | Recipients | Content |
| ----- | ---------- | ------- |
| Request submitted | Employee (confirmation) and assigned manager (action required) | Leave type, dates, working days, reason |
| Request approved | Employee | Decision, reviewer, optional remarks, balance note |
| Request rejected | Employee | Decision, reviewer, **manager's rejection remarks**, balance note |

How it behaves:
- Emails are sent only **after** the database write succeeds, in the background, so the API response is not delayed.
- An SMTP failure is logged (error code and message only) and **never** rolls back a saved request or review.
- Each email has an HTML version and a plain-text fallback. User-entered text is HTML-escaped.
- Recipients on reserved non-routable domains (`.local`, `.test`, `.example`, `.invalid`, `.localhost`), such as the demo accounts,
  are skipped to avoid bounce-backs. To receive real emails, give the users real addresses (Admin → Employees → Edit).
- Credentials are read only from environment variables, are never sent to the frontend or returned by the API,
  and are never logged (log lines show masked addresses such as `p***@gmail.com`).
- Email is disabled automatically during automated tests (a mocked transport is used instead).

### Creating a Gmail App Password

Gmail does not accept your normal password over SMTP. You need an App Password:

1. Sign in to the Google account that will send the emails.
2. Turn on **2-Step Verification**: <https://myaccount.google.com/security>.
3. Open <https://myaccount.google.com/apppasswords>, enter a name (for example "Leave Portal") and click **Create**.
4. Copy the 16-character password into `SMTP_PASS` in `server/.env` (spaces are optional).
5. Restart the backend.

If the App Passwords page is missing, 2-Step Verification is off, or the account is managed by an organisation that blocks it.
If a password is ever exposed, revoke it on the same page and create a new one.

Example `server/.env` section:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-16-char-app-password
MAIL_FROM="Leave Management Portal <your-account@gmail.com>"
```

### Testing email delivery

```powershell
# 1. Check connection and login only. Nothing is sent.
npm run email:verify -w server

# 2. Send one test email to a recipient you choose.
npm run email:test -w server -- --to someone@example.com
```

What the results mean:
1. **SMTP verification OK**: Gmail accepted the connection and the App Password. No email was sent.
2. **Message accepted (messageId / accepted list)**: Gmail accepted the message for delivery. This is *submission*, not delivery.
3. **Delivery** is only confirmed when the message appears in the recipient's inbox (check spam too).
   Undeliverable messages bounce back to the sender's Gmail inbox.

When the backend starts, it logs `[email] Notifications enabled via smtp.gmail.com:465` or `disabled`. Each notification is logged as
`submitted`, `skipped` or `failed`.

Gmail limits: about 500 recipients per day for personal accounts. Messages are sent from the `SMTP_USER` account.

## Tests

```powershell
npm test
```

Runs the backend suites (Vitest + Supertest) against MongoDB at `MONGODB_URI_TEST` (default
`mongodb://127.0.0.1:27017/leave_portal_test`). Each test file creates its own uniquely named database and drops it afterwards.
Your development data is never touched. Covered: login success / failure, auth protection, role restrictions, record ownership,
leave creation, invalid / past / cross-year dates, weekend counting, overlaps, insufficient balance, reservation → usage → release,
concurrency, manager assignment permissions, mandatory rejection remarks, repeat-decision prevention, admin management of users,
leave types and entitlements, and email notifications (mocked transport, SMTP failure handling, HTML escaping, no credential exposure).

## Known limitations

- Public holidays are not excluded from working-day counts. No holiday calendar is implemented.
- Requests cannot span two calendar years. Submit one request per year.
- Only full days are requested (no half-day requests), although entitlements may be set in half days.
- Employees cannot cancel or edit a submitted request. Their manager must reject it.
- No transactions are used (standalone MongoDB does not support them). The request and balance updates are atomic per document.
  If the process crashed between the two, `recalculateBalance` in `services/balance.service.js` (also used by the seed) can rebuild counters.
- Email is sent directly in the background, with no queue or retry. A failed email is logged but not resent.
- No password-reset-by-email, invitation links or self-service profile editing. Administrators issue temporary passwords and reset them.
