# Leave Management Portal: REST API

Base URL: `http://localhost:5000/api` (in development the React app calls `/api` through the Vite proxy).

All request and response bodies are JSON. Dates for leave are calendar dates in `YYYY-MM-DD` format.
Timestamps (`createdAt`, `reviewedAt`, …) are ISO-8601 UTC strings. Every document exposes `id`, and password hashes are never returned.

## Authentication

`POST /auth/login` sets an **httpOnly, SameSite=Strict** cookie named `lmp_token` containing a JWT (default lifetime 8 hours).
Browsers send it automatically. API clients can instead send the `token` returned by login as a header:

```
Authorization: Bearer <token>
```

On every authenticated request the server reloads the user from the database. Deactivated or deleted users are rejected immediately.

### Roles

| Role | Value |
| ---- | ----- |
| Employee | `employee` |
| Manager | `manager` |
| Administrator | `admin` |

"Applicant" below means `employee` or `manager` (roles that hold leave balances).
"Reviewer" means `manager` or `admin`. Reviewers only ever see and act on users whose `manager` is themselves.

## Errors

Errors use a consistent shape:

```json
{ "error": { "message": "Validation failed.", "details": [{ "field": "endDate", "message": "End date is required." }] } }
```

`details` is present for validation errors (an array) and some business errors (an object).

| Status | Meaning |
| ------ | ------- |
| 400 | Validation failed, malformed id, invalid date, or a rule such as "start date in the past" |
| 401 | Not signed in, invalid/expired token, wrong credentials, account deactivated after login |
| 403 | Signed in but the role or assignment does not permit the action. Also returned for login to a deactivated account |
| 404 | Resource not found, or not visible to the caller |
| 409 | Conflict: duplicate email/code/entitlement, overlapping leave, already reviewed, manager still has reports |
| 422 | Business rule: insufficient balance, no reporting manager, entitlement below used+pending |
| 429 | Too many login attempts (per IP, 15-minute window) |
| 500 | Unexpected server error (details are logged server-side only) |

---

## Auth

### `POST /auth/login` (public)

```json
{ "email": "priya@leaveportal.local", "password": "Employee@123" }
```

`200`:

```json
{
  "user": {
    "id": "6650…", "name": "Priya Sharma", "email": "priya@leaveportal.local", "role": "employee",
    "department": "Engineering", "isActive": true,
    "manager": { "id": "6650…", "name": "Meera Iyer", "email": "manager@leaveportal.local" },
    "createdAt": "…", "updatedAt": "…"
  },
  "token": "eyJhbGciOi…"
}
```

Errors: `400` invalid body, `401` "Invalid email or password." (same message for unknown email), `403` account deactivated, `429` rate limit.

### `POST /auth/logout` (public)

Clears the session cookie. `200 { "message": "Signed out." }`

### `GET /auth/me` (any signed-in user)

`200 { "user": { …same shape as login… } }`. Returns `401` when not signed in.

`user.mustChangePassword` is `true` for accounts created or reset by an administrator.

### `POST /auth/change-password` (any signed-in user, including one with a temporary password)

```json
{ "currentPassword": "Temp1234", "newPassword": "MyOwnPass9" }
```

`newPassword` must follow the password policy (8–128 characters, with a letter and a digit) and must differ from the current one.
On success, the password is re-hashed, `mustChangePassword` becomes `false`, every **other** session is signed out
(tokens issued before the change are rejected), and this session gets a fresh cookie.

`200 { "user": { … "mustChangePassword": false }, "token": "…", "message": "Password updated." }`

Errors: `400` wrong current password / weak or unchanged new password / unknown fields, `401` not signed in.

### First-time sign-in (temporary passwords)

There is **no public signup**. Administrators create every account (`POST /admin/users`) with a temporary password.
While `mustChangePassword` is `true`, the user can only call `GET /auth/me`, `POST /auth/change-password` and `POST /auth/logout`.
Every other endpoint returns:

```json
{ "error": { "message": "You must set a new password before continuing.", "details": { "code": "PASSWORD_CHANGE_REQUIRED" } } }
```

with status `403`. An admin password reset (`PATCH /admin/users/:id` with `password`) puts the account back into this state and
signs the user out of existing sessions.

### `GET /health` (public)

`200 { "status": "ok" }`

---

## Dashboards

### `GET /dashboard/employee` (applicant)

```json
{
  "year": 2026,
  "profile": { "id": "…", "name": "Priya Sharma", "email": "…", "role": "employee", "department": "Engineering", "manager": { "name": "Meera Iyer", "email": "…" } },
  "balances": [ { "…": "see Leave balance object" } ],
  "totals": { "totalEntitled": 37, "usedDays": 2, "pendingDays": 3, "availableDays": 32 },
  "leaveTypes": [ { "id": "…", "name": "Casual Leave", "code": "CL", "description": "…" } ],
  "requestCounts": { "Pending": 1, "Approved": 1, "Rejected": 0 },
  "recentRequests": [ { "…": "Leave request objects (latest 5)" } ]
}
```

`leaveTypes` contains only active types (the ones that can be requested).

### `GET /dashboard/manager` (reviewer)

```json
{
  "year": 2026,
  "stats": { "teamSize": 2, "pendingCount": 2, "approvedThisYear": 1, "rejectedThisYear": 1, "onLeaveToday": 0 },
  "team": [ { "id": "…", "name": "Priya Sharma", "email": "…", "department": "…", "role": "employee", "isActive": true } ],
  "pendingRequests": [ { "…": "same as GET /leave-requests/pending" } ]
}
```

### `GET /dashboard/admin` (admin)

```json
{
  "year": 2026,
  "stats": {
    "employees": 2, "managers": 1, "admins": 1, "inactiveUsers": 0,
    "activeLeaveTypes": 3, "inactiveLeaveTypes": 0,
    "pendingRequests": 3, "approvedRequests": 1, "rejectedRequests": 1
  },
  "recentRequests": [ { "…": "latest 8 requests, all employees" } ]
}
```

---

## Leave balances and requests

### Leave balance object

```json
{
  "id": "…", "employee": "…", "year": 2026,
  "leaveType": { "id": "…", "name": "Casual Leave", "code": "CL", "isActive": true, "defaultAnnualEntitlement": 12 },
  "entitledDays": 12, "carryForwardDays": 0, "totalEntitled": 12,
  "usedDays": 2, "pendingDays": 1, "availableDays": 9
}
```

`availableDays = entitledDays + carryForwardDays − usedDays − pendingDays`.

### Leave request object

```json
{
  "id": "…",
  "employee": { "id": "…", "name": "Priya Sharma", "email": "…", "department": "…", "role": "employee", "isActive": true, "manager": "…" },
  "leaveType": { "id": "…", "name": "Earned Leave", "code": "EL", "isActive": true },
  "startDate": "2026-11-02", "endDate": "2026-11-04", "days": 3, "year": 2026,
  "reason": "Planned vacation with family.",
  "status": "Pending",
  "manager": { "id": "…", "name": "Meera Iyer", "email": "…" },
  "managerRemarks": "", "reviewedBy": null, "reviewedAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```

`status` is one of `Pending`, `Approved`, `Rejected`.

### `GET /leave-balances/me?year=2026` (applicant)

Returns the caller's balances for `year` (default: current year). Missing balances for active leave types are created from the
type's default annual entitlement. `200 { "year": 2026, "balances": [ … ] }`

### `POST /leave-requests` (applicant)

```json
{ "leaveTypeId": "6650…", "startDate": "2026-11-02", "endDate": "2026-11-04", "reason": "Planned vacation" }
```

Unknown fields (for example a client-supplied `days`) are rejected. `days` is always calculated by the server.

`201 { "request": { …Leave request object, status "Pending"… } }`. The days are reserved against the balance.
On success, a confirmation email goes to the employee and a notification to the assigned manager (in the background, see Email notifications).

| Status | When |
| ------ | ---- |
| 400 | Invalid / impossible date, start after end, start before today, span crosses two calendar years, no working days in range, reason missing or not 3–500 chars, inactive leave type |
| 404 | Leave type does not exist |
| 409 | Overlaps one of the caller's Pending or Approved requests (`details.conflictingRequestId`) |
| 422 | Insufficient balance (`details: { requestedDays, availableDays }`), no reporting manager, or manager inactive |

### `GET /leave-requests/mine?status=Pending&year=2026` (applicant)

Caller's own requests, newest first. Both query parameters are optional. `200 { "requests": [ … ] }`

### `GET /leave-requests/:id` (any signed-in user)

Visible to the request owner, the owner's current manager, and administrators. Otherwise `404` (existence is not revealed).
Malformed id → `400`. `200 { "request": { … } }`

### `GET /leave-requests/pending` (reviewer)

Pending requests from employees whose manager is the caller, ordered by start date. Each item adds the employee's balance for that leave type and year:

```json
{ "requests": [ { "…": "Leave request object", "balance": { "totalEntitled": 12, "usedDays": 0, "pendingDays": 1, "availableDays": 11 } } ] }
```

`pendingDays` includes the request itself.

### `GET /leave-requests/team?status=Approved&year=2026` (reviewer)

All requests from the caller's assigned employees, newest first. `200 { "requests": [ … ] }`

### `PATCH /leave-requests/:id/review` (reviewer)

```json
{ "status": "Rejected", "remarks": "Release week, please choose other dates." }
```

- `status`: `Approved` or `Rejected`.
- `remarks`: optional for approval, **required** (non-blank) for rejection, max 500 characters.

`200 { "request": { …status updated, managerRemarks, reviewedBy, reviewedAt… } }`

Approval moves the days from `pendingDays` to `usedDays`. Rejection releases them from `pendingDays`.
On success, the employee is emailed the decision (rejections include the remarks).

| Status | When |
| ------ | ---- |
| 400 | Invalid status, missing rejection remarks, malformed id |
| 403 | Caller is not the employee's assigned manager, or is reviewing their own request |
| 404 | Request not found |
| 409 | Request already approved or rejected (also for a concurrent second decision) |

---

## Administration (admin only)

All endpoints below return `403` for non-admins.

### User object

```json
{
  "id": "…", "name": "Priya Sharma", "email": "priya@leaveportal.local", "role": "employee",
  "department": "Engineering", "isActive": true,
  "manager": { "id": "…", "name": "Meera Iyer", "email": "…", "role": "manager", "isActive": true },
  "createdAt": "…", "updatedAt": "…"
}
```

### `GET /admin/users?role=manager&active=true&search=priya`

All filters optional. `search` matches name, email or department (case-insensitive). `200 { "users": [ … ] }`

### `POST /admin/users`

```json
{
  "name": "Kiran Das", "email": "kiran@company.com", "password": "Welcome123",
  "role": "employee", "managerId": "6650…", "department": "Support", "isActive": true
}
```

`password`: 8–128 chars with at least one letter and one digit (stored as a bcrypt hash). It is a **temporary** password:
the new account has `mustChangePassword: true` and must set its own password at first sign-in. `role` may be `employee`, `manager` or `admin`.
Create as many manager accounts as needed. Each needs a unique email.
`managerId` (optional, nullable) must be an active `manager` or `admin`.
`201 { "user": { … } }`. Errors: `400` validation / invalid manager, `409` duplicate email.

### `GET /admin/users/:id`

`200 { "user": { … } }`, `404` if not found.

### `PATCH /admin/users/:id`

Any subset of `name`, `email`, `password` (temporary reset: user is signed out and must choose a new password at next sign-in;
not allowed on your own account, use `/auth/change-password`), `role`, `managerId` (`null` to clear), `department`, `isActive`.

`200 { "user": { … } }`

| Status | When |
| ------ | ---- |
| 400 | Validation, self-assignment as manager, invalid manager, circular reporting line |
| 403 | Admin changing their own role or deactivating themselves |
| 404 | User not found |
| 409 | Duplicate email, or demoting/deactivating a manager who still has active reports |

### Leave type object

```json
{ "id": "…", "name": "Casual Leave", "code": "CL", "description": "…", "defaultAnnualEntitlement": 12, "isActive": true, "createdAt": "…", "updatedAt": "…" }
```

### `GET /admin/leave-types`

All leave types (active and inactive), sorted by name. `200 { "leaveTypes": [ … ] }`

### `POST /admin/leave-types`

```json
{ "name": "Compensatory Off", "code": "CO", "description": "Time off in lieu", "defaultAnnualEntitlement": 4, "isActive": true }
```

`code`: 2–10 letters/digits/underscores, stored upper-case, unique. `defaultAnnualEntitlement`: 0–365 in whole or half days.
`201 { "leaveType": { … } }`. Errors: `400` validation, `409` duplicate code.

### `PATCH /admin/leave-types/:id`

Any subset of `name`, `description`, `defaultAnnualEntitlement`, `isActive`. The code cannot be changed (`400`).
Deactivating a type prevents new requests. Existing requests and balances are kept. `200 { "leaveType": { … } }`

### `GET /admin/leave-balances?employeeId=…&leaveTypeId=…&year=2026`

All filters optional. Returns saved balances with `employee` (`id`, `name`, `email`, `role`, `isActive`) and `leaveType` populated,
plus `totalEntitled` and `availableDays`. This endpoint does not create rows. `200 { "balances": [ … ] }`

### `POST /admin/leave-balances`

```json
{ "employeeId": "6650…", "leaveTypeId": "6650…", "year": 2026, "entitledDays": 15, "carryForwardDays": 2 }
```

The employee must have the `employee` or `manager` role. `year` 2000–2100. Days 0–365 in whole or half days. `carryForwardDays` defaults to 0.
`201 { "balance": { … } }`. Errors: `400` validation / admin employee, `404` employee or leave type missing,
`409` entitlement already exists for that employee, type and year (`details.id` is the existing balance; use PATCH).

### `PATCH /admin/leave-balances/:id`

```json
{ "entitledDays": 20, "carryForwardDays": 0 }
```

Either field may be omitted. `200 { "balance": { … } }`.
`422` if `entitledDays + carryForwardDays` would be less than `usedDays + pendingDays`. `404` if not found.

---

## Email notifications

These are not endpoints. They are side effects of the endpoints above, sent through Nodemailer using the SMTP settings in `server/.env`.

| Trigger | Recipients |
| ------- | ---------- |
| `POST /leave-requests` → 201 | Employee (confirmation) and assigned manager (action required) |
| `PATCH /leave-requests/:id/review` → 200, `Approved` | Employee |
| `PATCH /leave-requests/:id/review` → 200, `Rejected` | Employee, including the manager's remarks |

- Sent only after the database write succeeds, asynchronously. API responses do not wait for SMTP.
- SMTP errors are logged and never change the API response or roll back data.
- Addresses on `.local`, `.test`, `.example`, `.invalid` and `.localhost` domains are skipped.
- SMTP settings are never included in any API response.

## Business rules summary

- Working days = Monday–Friday inclusive. Weekends are excluded, public holidays are not.
- Start date must be today or later. Requests may not span two calendar years.
- No overlap with the same employee's Pending/Approved requests. Rejected requests do not block dates.
- Pending requests reserve days. Approval converts the reservation to usage. Rejection releases it. Balances never go negative.
- Only the assigned manager reviews, never their own request, once only. Reviewer and timestamp are stored.
- Employees cannot change roles or entitlements (all admin routes are server-side role-checked).
