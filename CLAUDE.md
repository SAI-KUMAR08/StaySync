# Sri Rama Hostel — Project Documentation

> A full-stack, multi-tenant **Hostel Management System** built with React 19 + Vite 6 (frontend) and Node.js + Express (backend), backed by MongoDB/Mongoose.

---

## Table of Contents

1. [Tech Stack](#-tech-stack)
2. [Architecture Overview](#-architecture-overview)
3. [Role System & Permissions](#-role-system--permissions)
4. [Authentication & Security](#-authentication--security)
5. [All Features & Functionalities](#-all-features--functionalities)
6. [Data Model & Relationships](#-data-model--relationships)
7. [API Structure](#-api-structure)
8. [Frontend Pages & Routes](#-frontend-pages--routes)
9. [Business Logic Deep Dive](#-business-logic-deep-dive)
10. [Real-time Socket System](#-real-time-socket-system)
11. [Cron Jobs & Automation](#-cron-jobs--automation)
12. [Deployment](#-deployment)
13. [Build Process & Phases](#-build-process--phases)
14. [Development Setup](#-development-setup)

---

## 🚀 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 + Vite 6 | Fast SPA with lazy-loaded routes |
| **Styling** | Tailwind CSS v4 | Custom HSL design system, Outfit/Inter font pairing |
| **State** | React Context API | Global auth, socket, payment state |
| **Backend** | Node.js + Express 4 | REST API with structured route handlers |
| **Database** | MongoDB + Mongoose 8 | Flexible document model with relational patterns |
| **Validation** | Zod | Runtime request body/params/query schema validation |
| **Auth** | JWT (access + refresh tokens) | Stateless auth with rotation & reuse detection |
| **Real-time** | Socket.io 4 | Bidirectional WebSocket communication per hostel room |
| **Cron** | node-cron | Monthly rent generation, incomplete-profile checks, tenant cleanup |
| **Email** | Resend SDK | OTP emails; no fallback — OTP requests fail with a config error without `RESEND_API_KEY` |
| **Payments** | Payment tracking + admin-approved requests | Tenant submits a payment request; owner approves/rejects |
| **Security** | Helmet, CORS, rate limiting, mongo-sanitize | Production-grade middleware stack |
| **Deployment** | Vercel static SPA + Railway long-running | Client calls Railway `/api` via `VITE_API_URL`; Railway runs full Socket.IO + cron |

---

## 🏗 Architecture Overview

```
Client (Vite React SPA)
  │  Axios calls /api/*
  │  Socket.io client
  ▼
Vite Dev Proxy → Reverse Proxy (Railway/Nginx)
  │
  ▼
Express.js API Server
  │  Middleware: Helmet → CORS → Compression → Morgan → CookieParser → MongoSanitize → Routes
  │
  ├── Auth Routes       ──→ Auth Service ──→ JWT/Otp/RefreshToken models
  ├── Owner Routes      ──→ Owner Controller ──→ Analytics/Occupancy/Payment services
  ├── Tenant Routes     ──→ Tenant Controller ──→ Self-service queries
  │
  └── Socket.io ──→ Real-time events per hostel room
```

---

## 👤 Role System & Permissions

Two roles with granular permission-based access control:

### Owner
- **Full access** to every permission in the system
- Can create/manage hostels, floors, rooms, beds
- Financial data: full visibility (income, expenses, deposits)
- Can setup hostel structure from scratch
- Can view all sessions and revoke them

### Tenant
- Self-service only: view own dashboard, payments, complaints, notices
- Can file complaints and request bed shifts
- Can view meal timings
- Passwordless OTP login + optional password set

### Permissions Matrix

Permissions are defined as `<action>:<resource>` strings:

| Resource | Owner | Tenant |
|----------|-------|--------|
| Tenants (CRUD) | ✅ | ❌ |
| Payments (read) | ✅ | ✅ (own only) |
| Payments (write) | ✅ | ❌ |
| Expenses | ✅ | ❌ |
| Complaints | ✅ R/U | ✅ (own) R/C |
| Rooms/Beds (CRUD) | ✅ | ❌ |
| Hostel config | ✅ | ❌ |
| Notices | ✅ CRUD | ✅ R |
| Bed Shift Requests | ✅ R/U | ✅ R/C (own) |
| Dashboard | ✅ | ✅ (own) |
| Meal Timings | ✅ CRUD | ✅ R |

---

## 🔐 Authentication & Security

### Authentication Flows

#### Owner Login (3 methods)
1. **Email + Password** — Standard bcrypt login with account lockout (5 attempts → 15-min lock)
2. **Email OTP** — Send OTP to owner's email, 6-digit code, 10-min expiry, 15-sec cooldown
3. **Owner Registration with OTP** — Two-step: first create inactive profile via `sendOwnerOtp`, then verify and activate via `verifyOwnerOtpAndRegister`. Hostel created alongside in transaction.

#### Tenant Login (3 methods)
1. **Phone + OTP** — Send OTP to tenant's registered email, verify to login
2. **Phone + Password** — If password already set, direct login with bcrypt verification
3. **First-time password set** — Phone-based (no OTP), only works when `isPasswordSet === false`

#### Tenant Password Management
- `checkTenantStatus` — Check if tenant exists + has password set
- `setInitialPassword` — First-time setup (phone-only, no OTP)
- `setTenantPassword` — OTP-verified password set
- `forgotPassword` / `resetPassword` — OTP-to-email flow for forgotten passwords

### Token System
- **Access Token** — JWT, 15-minute expiry, stored in `localStorage` (refreshed transparently via `/auth/refresh`)
- **Refresh Token** — JWT, 30-day expiry, stored in `localStorage` + httpOnly cookie
- **Token Family Rotation** — Each refresh creates a new token in the same family; old tokens marked `isCurrent: false`
- **Reuse Detection** — If a rotated (non-current) token is used, ALL tokens in that family are deleted (indicates compromise)

### Security Middleware
- `helmet` — HTTP headers (CSP disabled, cross-origin resource policy)
- `cors` — Whitelist-based origin delegate with credentials
- `express-rate-limit` — Separate rate limiters for auth, OTP, registration, and mutations
- `express-mongo-sanitize` — Prevents NoSQL injection
- `account lockout` — `isLocked()` / `incrementLoginAttempts()` / `resetLoginAttempts()` on Owner and Tenant models
- `httpOnly cookies` — Refresh token in production uses `secure: true, sameSite: "None"`

---

## 📋 All Features & Functionalities

### 1. Owner/Admin Dashboard
**Pages:** `AdminDashboard.jsx`

- **Stat Cards**: Animated counter for Active Tenants, Monthly Income, Monthly Expenses, Raised Tokens, Deposits Held, Unpaid Bills
- **Trend Badges**: Compares current vs previous month with percentage change
- **Multi-Hostel Financial Overview**: Summary card showing total income, expenses, net position across all properties
- **Support Desk Panel**: Recent complaint tickets with filter (All open, Pending, In Progress, Resolved)
- **Hostel Notices Panel**: Recent notices with real-time socket updates; inline create/delete
- **Incomplete Profile Alerts**: Warning card listing tenants missing required fields (name, room, phone, emergency contact, Aadhaar, ID proof, registration form)
- **Real-time Updates**: Socket listeners refresh data on tenant assignment, payment, occupancy, expense, notice, complaint events
- **Tab Focus Re-fetch**: Re-fetches dashboard data when browser tab regains focus

### 2. Room & Inventory Management
**Pages:** `RoomManagement.jsx`

- **Hierarchical View**: Floors → Rooms → Beds rendered with expand/collapse
- **Hostel Setup Wizard**: Step-by-step bulk setup with floors and rooms (AC/Non-AC, sharing type, pricing)
- **CRUD Operations**: Create/edit/delete rooms; update bed labels and pricing
- **Floor Management**: Add floors with auto-numbering
- **Occupancy Visualization**: Visual indicators for available/occupied/maintenance beds
- **Search & Filter**: Filter rooms by floor, bed status, room type
- **Bed Status Updates**: Toggle between available/occupied/maintenance

### 3. Tenant Management
**Pages:** `TenantManagement.jsx`, `TenantProfile.jsx`

- **List View**: Sortable table with name, room/bed assignment, phone, rent, status
- **Search**: Full-text search by name and phone number
- **Status Filter**: Active, Inactive, Temporary tenants
- **Add Tenant**: Form with name, email, phone, emergency contact, floor/room/bed assignment, monthly rent, join date, security deposit
- **Edit Tenant**: Update personal info, rent, deposit status
- **Delete/Evict Tenant**: Soft-delete (isActive=false), 10-day scheduled hard deletion
- **Assign Bed**: Move tenant to different bed with history tracking
- **Convert Temporary → Permanent**: Auto-finds available bed matching preferred sharing type
- **Incomplete Profile Detection**: Flags tenants with missing fields
- **Tenant History**: Room assignment change log with dates

### 4. Complaints / Support Tickets
**Pages:** `Complaints.jsx`

- **Ticket Creation** (Tenant): Submit title, description, category, priority
- **Ticket Management** (Admin): View all tickets, filter by status, update priority/assignment
- **Status Workflow**: `pending` → `assigned` → `in_progress` → `resolved` → `closed`
- **Status History**: Each status change logged with timestamp, actor, and note
- **SLA Tracking**: `slaDueAt` computed from priority (emergency: 4h, high: 24h, medium: 48h, low: 72h)
- **Search**: By title, description, category, or tenant name
- **Real-time Updates**: Socket broadcast on complaint creation and updates

### 5. Billing & Payments
**Pages:** `Payments.jsx`, `TenantPayments.jsx`, `AdminPayments.jsx`

#### Admin Features
- **Payment List**: All payments with tenant info, amounts, statuses
- **Create Payment**: Manual payment record creation
- **Update Payment**: Mark as paid/unpaid/overdue, add fine
- **Payment Totals Dashboard**: Aggregated collection rate, paid/unpaid/overdue counts and amounts
- **Payment Requests**: Tenant-submitted payment requests that owner can approve/reject
- **Status Sync**: Background sync on dashboard load to refresh overdue/unpaid statuses
- **Payments**: Full payment tracking, totals, requests

#### Tenant Features
- **View Invoices**: List of all rent invoices with status
- **Payment Requests**: Submit a request to the hostel owner; the owner approves or rejects it to record the payment

#### Automatic Invoice Generation
- **Monthly cron (`0 0 2 * *`)**: Generates a rent invoice for every active tenant on the 2nd, due on the 7th (2nd + 5-day grace)
- **Security Deposit**: A deposit payment (`paymentType: "deposit"`) is created alongside the first month's rent when a tenant is registered
- **Duplicate Prevention**: Checks existing payments before creating new invoices

### 6. Expenses
**Pages:** `Expenses.jsx`

- **CRUD Operations**: Create, read, update, delete expenses per hostel
- **Expense Summary**: Monthly totals, category breakdown, year-to-date view
- **Owner-only**: Expense tracking for owner

### 7. Notices / Announcements
**Pages:** `Notifications.jsx`

- **Admin**: Create notices with type (General, Maintenance, Water, Emergency, Curfew, Fee Reminder) and priority (Low/Medium/High)
- **System Notices**: Auto-generated for incomplete tenant profiles
- **Real-time Broadcast**: Socket.io emits `notice_created` to hostel room
- **Delete**: Notices can be removed by admin
- **Read Tracking**: Tenants can mark notices as read (`POST /notices/:id/read`) — the UI renders unread dots/bold + an unread count and "Mark all read"; the list returns `isRead` per tenant (the raw `readBy` array is not exposed to tenants)
- **Types**: `general`, `maintenance`, `water_shutdown`, `emergency`, `curfew`, `fee_reminder`, `system_incomplete_profile`

### 8. Meal Timings
**Pages:** `MealTimings.jsx`

- **CRUD Operations**: Create/update/delete meal schedules
- **View for All Roles**: Both owner and tenant can view
- **Time-based**: Each meal entry has start time, end time, meal type

### 9. Bed Shift Requests
**Pages:** `TenantRoomShift.jsx` (`/tenant/room-shift` — sends the request, reuses `TenantBedShift.jsx`), reviewed via the unified `AdminRequests.jsx` (`/admin/requests` → Room Shift tab)

- **Tenant**: Submit request to move to a different room/bed with reason (room picker from `GET /tenant/rooms`; `requestedRoomId` required + scoped to the tenant's own hostel)
- **Status tracking**: Tenant sees own requests with pending/approved/rejected badges; live updates via `bed_shift_request_updated` socket event
- **Admin**: Approve or reject with notes (owner note shown to the tenant)
- **Auto-assignment**: On approval, system finds available bed in requested room and reassigns (transactional; tenant must be active)

### 10. Multi-Hostel Management
**Pages:** `HostelSwitcher.jsx`

- **Multiple Properties**: Owner can create and manage multiple hostels
- **Hostel Switcher**: Dropdown in navbar to switch active hostel context
- **Per-hostel Isolation**: All queries scoped by `ownerId` + `hostelId`
- **Cross-hostel Reports**: Multi-hostel financial overview on dashboard

### 11. Admin Bootstrapping
- On first admin login, the backend auto-creates the admin Owner and a default "My Hostel" via `ensureAdminOwner()` and `resolveOwnerHostel()`
- Registration APIs still support direct `register` or OTP-verified `sendOwnerOtp` → `verifyOwnerOtpAndRegister`; hostel creation runs in a database transaction alongside owner registration

### 12. Session Management
- **List Active Sessions**: View all devices logged into the account
- **Revoke Session**: Remotely log out a specific device by `familyId`
- **Device Tracking**: Each session records device info, IP, user-agent, last used timestamp

### 13. Activity Logging
- **Key Events**: tenant_created, tenant_removed, tenant_converted_to_permanent, room_created, rent_generated
- **Actor Tracking**: Who performed the action (user ID + role), or "system" for cron jobs
- **Entity Tracking**: What was affected (entity type + entity ID)

---

## 💾 Data Model & Relationships

```
Owner ──1:N── Hostel ──1:N── Floor ──1:N── Room ──1:N── Bed
  │               │                                        │
  │               └── Notice (broadcasts)                  │
  │                                                        │
  │                                                        │
                                                           │
Tenant ──N:1── Bed (occupies)                              │
  │               │                                        │
  ├── N:1 Room    └── RoomAssignmentHistory (check-ins,    │
  ├── N:1 Floor        bed shifts, check-outs)             │
  ├── 1:N Payment                                          │
  ├── 1:N Complaint                                        │
  └── 1:N BedShiftRequest                                  │
                                                            │
Expense ──N:1── Hostel (owner-only financial tracking)      │
                                                            │
MealTiming ──N:1── Hostel (meal schedules)                  │
                                                            │
RefreshToken ──N:1── (Owner or Tenant) (session mgmt)       │
                                                            │
OTP ──N:1── (Owner or Tenant) (one-time passwords)          │
```

### Key Schema Design Decisions

1. **Tenant uses subdocument for personal info** (`personalInfo.name`, `personalInfo.email`, `personalInfo.phone`, `personalInfo.password`) to namespace PII separately from management fields (monthlyRent, joinDate, etc.)
2. **Payment stores paymentMonth as string** (e.g., "July") alongside numeric `year` — enables readable queries and simple month filtering
3. **Transaction-heavy operations** use Mongoose sessions with `startTransaction()` / `commitTransaction()` / `abortTransaction()` for: createTenant, assignBed, removeTenant, setupHostel, convertToPermanent, registerOwner
4. **Soft deletes** via `isActive: false` on Owner, Hostel, Floor, Room, Tenant (10-day scheduled hard deletion for tenants)
5. **Indexes** on frequently queried fields (ownerId, hostelId, paymentStatus, tenantId, etc.)

---

## 🛣 API Structure

### Base URL: `/api`

### Auth Routes (`/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register owner + create hostel (transaction) |
| POST | `/owner/send-otp` | Step 1 of OTP registration |
| POST | `/owner/verify-otp` | Step 2: verify OTP & activate |
| POST | `/owner/login/send-otp` | OTP email for owner login |
| POST | `/owner/login/verify-otp` | Verify OTP & login owner |
| POST | `/login` | Email + password login |
| POST | `/send-otp` | Send OTP to tenant email |
| POST | `/verify-otp` | Verify OTP & login tenant |
| POST | `/tenant/send-otp` | Alias for send-otp |
| POST | `/tenant/verify-otp` | Alias for verify-otp |
| POST | `/tenant/check-status` | Check if tenant exists + has password |
| POST | `/tenant/login` | Phone + password login |
| POST | `/tenant/set-password` | OTP-verified password set |
| POST | `/tenant/set-initial-password` | First-time password (no OTP) |
| POST | `/tenant/forgot-password` | Send reset OTP to email |
| POST | `/tenant/reset-password` | OTP-verified password reset |
| POST | `/refresh` | Rotate refresh token |
| POST | `/logout` | Invalidate refresh token |
| GET | `/me` | Current user profile |
| POST | `/switch-hostel` | Switch active hostel context |
| PATCH | `/profile` | **Owner-only** update of name/email/phone. Tenants get 403 — profile changes must go through the admin-reviewed `POST /tenant/profile-request` workflow |
| PATCH | `/password` | Change password (requires current) |
| GET | `/sessions` | List active sessions |
| DELETE | `/sessions/:familyId` | Revoke a session |

### Owner Routes (`/owner`) — requires `authenticate` + `ownerScope`
- **Dashboard & overview**: `/dashboard`, `/hostels-summary`, `/financial-overview`, `/occupancy`, `/hostel`, `/structure`
- **Floors**: GET/POST `/floors`
- **Rooms**: GET/POST `/rooms`, PATCH/DELETE `/rooms/:id`
- **Beds**: GET `/beds`, PATCH `/beds/:id`
- **Tenants**: Full CRUD at `/tenants`, plus `/tenants/:id/assign-bed`, `/tenants/:id/convert-permanent`, `/tenants/:id/history`, `/tenants/:id/payments`, `/tenants/incomplete-profiles`
- **Complaints**: GET `/complaints`, PATCH `/complaints/:id`
- **Payments**: GET/POST `/payments`, PATCH `/payments/:id`, GET `/payments/totals`, GET/PATCH `/payment-requests/:id`
- **Notices**: CRUD `/notices`
- **Bed Shift Requests**: GET `/bed-shift-requests`, PATCH `/bed-shift-requests/:id`
- **Payments**: Payment tracking and requests
- **Expenses**: CRUD `/expenses`, GET `/expenses/summary`
- **Meal Timings**: CRUD `/meal-timings`
- **Hostel management**: GET/POST/PATCH `/hostels`, POST `/setup`

### Tenant Routes (`/tenant`) — requires `authenticate` + `authorize("tenant")` + `tenantScope`; mutations are rate-limited (`mutationLimiter`)
- GET `/dashboard` — Personal dashboard with stats
- GET `/room` — Room assignment + roommate info
- GET `/rooms` — Active rooms in the hostel (bed-shift room picker)
- GET `/payments` — List own invoices (statuses auto-synced); payment requests are reviewed by the owner
- GET/POST `/complaints` — View/file tickets
- GET `/notices`, POST `/notices/:id/read` — View notices + mark read (returns `isRead`; strips `readBy`)
- GET/POST `/bed-shift-requests` — Request bed change (`requestedRoomId` required + hostel-scoped)
- GET `/meal-timings` — View meal schedule (supports `dayOfWeek` → Every Day + that day)
- GET `/profile-completeness` — Own missing mandatory fields (tenant-fixable only)
- POST `/profile-request`, GET `/profile-requests` — Submit/track an admin-reviewed profile change
- POST `/vacate-request`, GET `/vacate-requests` — 15-day advance notice vacate requests

### Owner profile-review routes (added to `/owner`)
- GET `/profile-requests`, PATCH `/profile-requests/:id` — Review tenant profile changes (approve applies transactionally; reject leaves profile untouched)

---

## 🖥 Frontend Pages & Routes

| Route | Page Component | Role | Description |
|-------|---------------|------|-------------|
| `/login` | `Login.jsx` | Public | Tenant login (OTP / password / first-time password set) |
| `/admin-login` | `AdminLogin.jsx` | Public | Admin login (password / OTP) |
| `/admin/dashboard` | `AdminDashboard.jsx` | Owner | Live stats, support desk, notices |
| `/admin/inventory` | `RoomManagement.jsx` | Owner | Floor/room/bed management + setup wizard |
| `/admin/tenants` | `TenantManagement.jsx` | Owner | Tenant list, add/edit/evict |
| `/admin/tenants/:id` | `TenantProfile.jsx` | Owner | Detail view + history + payments |
| `/admin/complaints` | `Complaints.jsx` | Owner | Support ticket management |
| `/admin/payments` | `Payments.jsx` | Owner | Payment list, totals, requests |
| `/admin/expenses` | `Expenses.jsx` | Owner | Expense tracking |
| `/admin/meal-timings` | `MealTimings.jsx` | Owner | Schedule management |
| `/admin/notifications` | `Notifications.jsx` | Owner | Notice board management |
| `/admin/requests` | `AdminRequests.jsx` | Owner | Unified request review — filter: Room Shift / Vacate / Profile Edit (reuses `AdminBedShiftRequests.jsx` / `AdminVacateRequests.jsx` / `AdminProfileRequests.jsx`) |
| `/admin/vacate-requests` | → redirects to `/admin/requests?type=vacate` | Owner | Legacy deep link kept working |
| `/admin/bed-shift-requests` | → redirects to `/admin/requests?type=shift` | Owner | Legacy deep link kept working |
| `/admin/profile-requests` | → redirects to `/admin/requests?type=profile` | Owner | Legacy deep link kept working |
| `/tenant/dashboard` | `TenantDashboard.jsx` | Tenant | Personal stats, invoices, tickets, notices, mandatory-info banner, vacate + room-shift requests |
| `/tenant/complaints` | `Complaints.jsx` | Tenant | File/view tickets (status timeline + SLA + admin notes) |
| `/tenant/payments` | `Payments.jsx` | Tenant | View invoices, submit payment requests, track request status |
| `/tenant/meal-timings` | `MealTimings.jsx` | Tenant | View schedule (Today's Menu surface) |
| `/tenant/notifications` | `Notifications.jsx` | Tenant | View notices (read/unread) |
| `/tenant/profile` | `TenantProfileSettings.jsx` | Tenant | View profile, submit change requests, track status |
| `/tenant/room-shift` | `TenantRoomShift.jsx` | Tenant | Send + track room-shift (bed-shift) requests |

### Frontend Architecture
- **Lazy loading**: All page components use `React.lazy()` + `Suspense` with skeleton loader
- **Auth Context**: `AuthContext.jsx` provides all auth methods, user state, hostel list, loading states
- **Socket Context**: `SocketContext.jsx` manages Socket.io connection lifecycle
- **Payment Context**: `PaymentContext.jsx` provides payment totals with cache management
- **Axios Instance**: Centralized `api/axios` with interceptors for token refresh, auth headers, cache busting
- **Layout**: `DashboardLayout.jsx` with sidebar navigation, topbar, hostel switcher
- **Design System**: Shared `Button.jsx`, `Modal.jsx`, `EmptyState.jsx`, `ErrorBoundary.jsx`, `ErrorRetry.jsx` components

---

## 🧠 Business Logic Deep Dive

### Payment Status Derivation
```
Payment status derives from `dueDate` comparison with current date:
  - unpaid  → dueDate is today or in the future
  - overdue → dueDate is in the past AND payment not paid
  - paid    → payment has been completed

Auto-synced on:
  1. Dashboard load (background: `syncPaymentStatusesOnly`)
  2. Payments page load (`syncPaymentStatusesOnly`)
```

### Rent Invoice Generation
```
Single monthly cron (`0 0 3 * *`):
  - Creates a rent invoice for EVERY active tenant on the 2nd of the month
  - Due date: 7th of the month (2nd + 5-day grace)
  - Skips tenants who already have an invoice for the month/year
```

### Tenant Eviction Flow
```
1. Tenant submits a vacate request for a date ≥15 days out (`TENANT.VACATE_MIN_NOTICE_DAYS`) — rejected with an inline message otherwise; <15 days is not saved
2. Admin approves → stores `reviewDate` (approval timestamp) + `approvedVacateDate = requestedVacateDate`; tenant stays active in their room
3. Vacating is ONLY possible via an approved request whose approved date has arrived: the Vacate action is disabled otherwise, and `vacateService.assertCanVacate` rejects any early/no-request completion server-side (no bed release, no retention start, no queue trigger)
4. On/after the approved date the admin completes vacating:
   - Soft delete: `isActive = false`, `moveOutDate = now`
   - Free bed: `occupancyService.freeTenantBed()` - clears room/bed/floor refs
   - Rent proration: adjust current unpaid invoice to active days only
   - Approved vacate request marked `completed`
5. Schedule deletion: `scheduledDeletionDate = now + 15 days` (15-day data retention)
6. Hard delete (cron at 01:00): permanently removes tenant + all related records
```

### Bed Assignment Logic
```
1. Check if tenant already has a bed → free it first if different
2. Verify bed is available + not in maintenance
3. Atomically claim bed: findOneAndUpdate with filter `occupancyStatus: "available", tenantId: null`
4. Check room capacity hasn't been exceeded
5. Update tenant with room/bed/floor refs
6. Sync tenant rent to match bed pricing
7. Log to RoomAssignmentHistory (action: "check_in" or "bed_shift")
8. Recalculate room occupancy
```

### OTP System
```
- Generation: crypto.randomInt(100000, 999999) → 6-digit string
- Expiry: 10 minutes from creation
- Cooldown: 15 seconds between requests
- Storage: OTP collection with upsert per userId+mobile
- Verification: Checks latest unverified OTP by userId
- Delivery: OTPs are delivered exclusively through Resend (`sendOtpEmail` in `emailService.js`). There is no dev fallback — without `RESEND_API_KEY` the send fails with a clear config error in any environment; OTPs are never logged or echoed in API responses.
```

### Data Scoping & Isolation
```
All queries use `ownerFilter(req)` which returns:
  { ownerId, hostelId }

For owners:
  ownerId = req.user.id
For tenants:
  Scoped via tenantFilter with tenantId added
```

---

## 🔌 Real-time Socket System

### Socket.io Setup
```
Server creates Socket.io instance attached to HTTP server.
Client connects and emits "join_hostel" with hostelId.
Server places socket into room: `hostel_{hostelId}`.
```

### Events Emitted

| Event | Trigger | Payload |
|-------|---------|---------|
| `notice_created` | Notice created | Full notice object |
| `notice_deleted` | Notice removed | `{ _id }` |
| `tenant_assigned` | Tenant assigned to bed | Message + optional tenant/room data |
| `tenant_removed` | Tenant evicted | Message |
| `occupancy_update` | Floor/room/bed changed | Message |
| `payment_completed` | Payment created/updated | Message with payment ID, action, status |
| `expense_updated` | Expense created/updated | Full expense object |
| `complaint_created` | New complaint filed | Slim payload incl. `_id` + `id` |
| `complaint_updated` | Complaint status changed | Slim payload incl. `_id` |
| `vacate_request_created` / `vacate_request_updated` | Vacate request submitted / reviewed | Request `_id` + status + tenantId |
| `bed_shift_request_updated` | Bed-shift request reviewed | Request `_id` + status + tenantId |
| `profile_request_created` / `profile_request_updated` | Profile change submitted / reviewed | Request `_id` + status + tenantId |
| `meal_timing_updated` | Meal timing created/updated/deleted | `_id` + action |
| `payment_request_created` | Payment request submitted | Slim `{ _id, status }` (refetch trigger only — no financial metadata) |

### Client Socket Handlers
- **AdminDashboard**: Listens to `tenant_assigned`, `tenant_removed`, `payment_completed`, `occupancy_update`, `expense_updated`, `notice_created`, `complaint_created`, `complaint_updated`
- **TenantDashboard**: Listens to `payment_completed`, `complaint_updated`, `new_notification`
- **Other pages**: RoomManagement listens to `occupancy_update` for real-time refresh

---

## ⏰ Cron Jobs & Automation

All cron jobs run via `node-cron` and are initialized in `cronService.js`:

### 1. Monthly 2nd — Rent Generation (`0 0 2 * *`)
- Creates an unpaid rent invoice for EVERY active tenant
- Due date: 7th of the month (2nd + 5-day grace)
- Skips tenants who already have an invoice for the month/year

### 2. Daily 03:00 — Incomplete Profile Check (`0 3 * * *`)
- Scans all hostels for tenants with incomplete profiles
- Creates high-priority system notices flagged `system_incomplete_profile`
- Auto-resolves notices for tenants whose profiles are now complete

### 3. Daily 01:00 — Tenant Cleanup (`0 1 * * *`)
- Permanently deletes inactive tenants past their `scheduledDeletionDate` (15-day retention)
- Cascade-deletes: payments, payment requests, complaints, room assignment history, bed shift requests, vacate requests
- Removes tenant references from notice `readBy` arrays

### Keep-Warm (GitHub Actions)
- `.github/workflows/keep-warm.yml` runs every 5 minutes and pings the Railway health URL (`RAILWAY_HEALTH_URL` repo variable → `https://<your-service>.up.railway.app/api/health`) as an optional uptime monitor (Railway paid services run continuously — no spin-down)

---

## 🌐 Deployment

Production topology: **Vercel serves the static React SPA; Railway runs the long-running backend** (REST API + Socket.IO + cron jobs).

- **Vercel (static frontend)** — `vercel.json` builds `client/dist` and serves it as a static SPA (every path rewrites to `/index.html`). The client is built with `VITE_API_URL=https://<your-service>.up.railway.app`, so both axios (`/api`) and the Socket.IO client target Railway. The former serverless handler (`api/index.js`) and its `/api` rewrite were removed on 2026-08-03 — Vercel no longer runs the API.
- **Railway (long-running backend, required)** — create a Railway service from this repo with Root Directory `server`; `server/railway.toml` drives the build (`npm start`) and the `/api/health` healthcheck. Paid Railway plans run continuously (Socket.IO + node-cron stay alive). Requires the env vars in `docs/DEPLOYMENT.md` (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, ADMIN_*, distinct JWT/refresh secrets — startup fails otherwise).

---

## 🔧 Build Process & Phases

The project was built across several phases:

### Phase 1–3: Frontend Redesign (Design System)
- Custom HSL color palette with CSS variables
- Sidebar navigation with collapse
- Dashboard layout (`DashboardLayout.jsx`)
- Typography system: Outfit (display) + Inter (body) font pairing
- Component library: Button, Card, Badge, Modal, EmptyState, ErrorBoundary
- Dark/light-aware styling with `reduced-motion` support

### Phase 4: Apply Design System to All Pages
- Updated all 10+ page components to use the new design tokens
- Consistent spacing, animation, and interaction patterns
- Responsive grid layouts throughout

### Phase A: CSS & Accessibility Foundation
- CSS variable cleanup and consolidation
- PriorityBadge component for color-coded status indicators
- `prefers-reduced-motion` media query support
- Animation performance optimization

### Phase B: Shared Components
- `Modal.jsx` — Reusable modal with overlay, close button, size variants
- `EmptyState.jsx` — Consistent empty state with icon, title, description, optional action
- Error handling patterns established

### Phase C: Loading States
- Skeleton loaders replacing pulsing text for all data-fetching views
- Shimmer animation for card skeletons
- Granular loading states in AuthContext (per-method, not global)

### Phase D: Accessibility Pass
- ARIA labels on interactive elements
- Loading roles (`role="status"`, `aria-live="polite"`)
- Focus management in modals and forms
- Keyboard navigation support

### Production Hardening
- Database indexing for query performance
- Async dashboard sync to prevent blocking
- Auth persistence: localStorage → cross-tab support
- OTP cooldown: 60s → 15s for better UX
- Non-blocking email sending (fire-and-forget) for serverless compatibility
- Refresh token rotation with family-based reuse detection
- Payment status sync optimization (batch + concurrency control)

---

## 🛠 Development Setup

### Backend Setup
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secrets, etc.
npm run dev   # Starts with nodemon on port 5000
```

### Frontend Setup
```bash
cd client
npm install
cp .env.example .env.development
npm run dev   # Starts Vite on port 5173, proxies /api to 5000
```

### Key Environment Variables
```
# Server (.env)
PORT=5000
MONGO_URI=mongodb+srv://...
MONGO_DB_NAME=smart-hostel
JWT_SECRET=...
REFRESH_TOKEN_SECRET=...
CLIENT_URL=http://localhost:5173
RESEND_API_KEY=            # Required for any OTP delivery; without it OTP requests fail (no dev fallback, no logging)
RESEND_FROM_EMAIL=         # Required in production (sender address for Resend)

# Client (.env.development)
VITE_DEV_PROXY_TARGET=http://localhost:5000
```

### OTP Delivery Behavior
- OTPs are random 6-digit codes (crypto.randomInt) delivered **only through Resend** (`resend.emails.send`).
- Without `RESEND_API_KEY`, an OTP request fails with a clear config error — there is no console/log fallback in any environment (development included).
- OTPs are never logged to the server console and never returned in API responses in any environment.
- Production: `RESEND_API_KEY` + `RESEND_FROM_EMAIL` are required (startup fails otherwise).

---

## 📝 Production Audit Findings (to be fixed later)

> Generated 2026-07-31 by automated workflow audit. Fixes preserve existing functionality.
>
> ✅ **All findings below were resolved on 2026-07-31** — see "Recent Changes" for the implementation summary. Each fix preserves existing functionality, styling, and API contracts.

### 🔴 Critical

| # | Issue | File | Fix |
|---|-------|------|-----|
| C-1 | Socket.io has no auth — anyone can join any hostel room | `server/src/index.js:25-42` | Add JWT auth middleware to socket `io.use()` |
| C-2 | Access token expiry is 30d (should be 15m) | `server/src/utils/tokens.js:4` | Set `ACCESS_EXPIRY = "15m"` |
| C-4 | Hardcoded admin password in source, bypasses bcrypt | `server/src/services/authService.js:318` | Move to env vars (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) |
| C-5 | Client-side password check — credentials visible in JS bundle | `client/src/pages/AdminLogin.jsx:10-11` | Remove client-side check, delegate to backend `/auth/login` |
| C-6 | No cron mutex — overlapping executions possible | `server/src/services/cronService.js` | Add MongoDB atomic lock per cron handler |
| C-7 | Race condition in axios cache — stale data restored after mutation | `client/src/api/axios.js:56-61` | Re-check cache validity before writing background refresh result |
| C-9 | No phone index — tenant auth queries do full collection scans | `server/src/models/Tenant.js` | Add `tenantSchema.index({ "personalInfo.phone": 1 })` |

### 🟠 High

| # | Issue | File | Severity |
|---|-------|------|----------|
| H-1 | `*.vercel.app` wildcard CORS — any preview can read credentialed API | `server/src/utils/corsOrigins.js:51-67` | Security |
| H-2 | Auth tokens not validated for ownerId/hostelId scoping | `server/src/middleware/auth.js` | Security |
| H-3 | No request size limits — potential DoS via large payloads | `server/src/app.js:46` | Security |
| H-4 | X-Forwarded-For not validated — IP spoofable | `server/src/app.js:15` | Security |
| H-5 | No HTTP parameter pollution protection | `server/src/app.js` | Security |
| H-6 | TenantManagement.jsx ~900 lines — should be split | `client/src/pages/TenantManagement.jsx` | Maintainability |
| H-8 | Token refresh queue could grow unbounded under rapid 401s | `client/src/api/axios.js` | Performance |
| H-9 | No DB connection retry backoff | `server/src/config/db.js` | Resilience |

### 🟡 Medium

| # | Issue | File |
|---|-------|------|
| M-1 | Cron error logging uses console.error — no structured logging | `server/src/services/cronService.js` |
| M-2 | Many useCallback/useMemo missing deps in frontend | Multiple client files |
| M-3 | Socket.io disconnection doesn't clean up all listeners | `client/src/context/SocketContext.jsx` |
| M-4 | No helmet CSP policy set | `server/src/app.js` |
| M-5 | Payment aggregate pipelines lack index hints | `server/src/services/analyticsService.js` |
| M-6 | No automated tests exist in the project | Entire project |
| M-7 | OwnerController ~1400 lines — should be split | `server/src/controllers/ownerController.js` |
| M-8 | AuthService ~800 lines — should be split | `server/src/services/authService.js` |
| M-9 | No request validation error normalization across endpoints | `server/src/middleware/validate.js` |
| M-10 | No HTTP request logging sanitization | `server/src/app.js:43` |
| M-11 | React key props use array index in multiple map renders | Multiple client files |
| M-12 | No rate limiting on payment/expense mutation endpoints | `server/src/middleware/rateLimiter.js` |

### 🟢 Low

| # | Issue | File |
|---|-------|------|
| L-1 | Unused imports in several files | Multiple files |
| L-2 | Inline comment typos and stale comments | Multiple files |
| L-3 | Mixed coding style (spaces vs tabs) | Multiple files |
| L-4 | No .editorconfig for consistent formatting | Root |
| L-5 | Several long functions >200 lines | Controllers, services |
| L-6 | Magic numbers (15, 50, 60, 1000) without named constants | Multiple files |
| L-7 | Prettier/ESLint config not present | Root |
| L-8 | No commit hooks (husky/lint-staged) | Root |
| L-9 | API response times not logged | `server/src/app.js` |
| L-10 | No health check endpoint exposes DB status | `server/src/routes/index.js` |
| L-11 | Payment totals aggregation uses string month names — locale-dependent | `server/src/controllers/ownerController.js` |
| L-12 | Frontend has no error tracking integration | `client/src/App.jsx` |
| L-13 | Some API error messages leak internal details | Multiple controllers |
| L-14 | No request ID tracking across middleware | `server/src/app.js` |
| L-15 | Frontend has no bundle analysis config | `client/vite.config.js` |
| L-16 | Cron jobs run but have no monitoring/alerting | `server/src/services/cronService.js` |

---

## 📝 Recent Changes

> This section is updated every session. Newest entries at the top.

### 2026-08-08 — OTP email delivery migrated from SMTP (Nodemailer) to Resend (no dev fallback/logging)
> User-requested migration. OTP generation/expiry/verification/rate limiting/attempt limits are untouched (`services/auth/helpers.js`). OTP delivery is now Resend-only — there is no development fallback, console logging, or OTP echoing; the auth layer stays provider-agnostic.
- **`services/emailService.js` rewritten (no SMTP)**: `createEmailService({ resendKey, fromEmail, nodeEnv, ResendClient, log })` builds a provider-bound service; the app uses the default singleton bound to `env`. Resend SDK (`resend.emails.send`) is the only provider; without `RESEND_API_KEY` sending fails with a clear error in every environment (development included) — no OTP is logged or echoed anywhere. OTP email template/purpose strings unchanged. Resend failure → sanitized ops log (never the OTP) + curated `AppError` (502) — delivery is never claimed when it failed. (A dev `[DEV OTP]` logger existed in an earlier draft of this change and was removed per user request.)
- **`config/env.js`**: removed `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `SEND_REAL_EMAIL`; added `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (both optional so the server can boot without an email provider). The production fail-closed gate now requires **`RESEND_API_KEY` and `RESEND_FROM_EMAIL`** (was `SEND_REAL_EMAIL="true"`) — startup fails with a clear message; OTPs are never logged/echoed in production.
- **`services/auth/ownerAuth.js` / `tenantAuth.js`**: removed the dev-only OTP echo (was `!env.SEND_REAL_EMAIL`); OTP responses now always return just the message. tenantAuth's now-unused `env` import removed. No other auth logic touched — bcrypt login, account lockout, OTP cooldown/expiry/failedAttempts, session family rotation, and other response shapes are byte-for-byte intact.
- **Dependencies**: `nodemailer@9` removed, `resend@^6.18.1` added in **both** `server/package.json` and root `package.json` (repo-root Railway deploy) + lockfiles. `npm audit` server: 1 remaining high is pre-existing/unrelated (unrelated to email).
- **Tests**: new `server/tests/email-service.test.js` (9 tests): no-provider rejects in dev AND production (OTP never logged/rendered), Resend success payload + sender, Resend failure → generic error + no OTP in logs, dev `RESEND_FROM_EMAIL` fallback to `onboarding@resend.dev`, production-requires-from (Resend not called), plus 3 subprocess tests proving `env.js` boot fails closed (missing `RESEND_API_KEY` / missing `RESEND_FROM_EMAIL`) and succeeds with both. Every test asserts the OTP is never logged or rendered.
- **Config/docs**: `server/.env.example`, `docs/DEPLOYMENT.md`, `README.md`, and this CLAUDE.md updated (tech stack, OTP system, key env vars, OTP delivery behavior) to document Resend-only delivery with no dev fallback. No client changes (frontend never consumed the echoed dev OTP).
- **Manual steps (not code)**: add `RESEND_API_KEY` + `RESEND_FROM_EMAIL` to Railway Variables and remove the stale `SMTP_HOST/PORT/USER/PASS`/`EMAIL_FROM`/`SEND_REAL_EMAIL` vars; verify the sender domain in Resend; delete leftover `node_modules` temp dirs already removed. Local `server/.env` can stay as-is (SMTP vars ignored) or be trimmed.
- **`config/env.js`**: removed `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `SEND_REAL_EMAIL`; added `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (both optional in dev). The production fail-closed gate now requires **`RESEND_API_KEY` and `RESEND_FROM_EMAIL`** (was `SEND_REAL_EMAIL="true"`) — startup fails with a clear message; OTPs are never logged/echoed in production.
- **`services/auth/ownerAuth.js` / `tenantAuth.js`**: dev OTP echo switched from `!env.SEND_REAL_EMAIL` to `shouldEchoDevOtp()`; tenantAuth's now-unused `env` import removed. No other auth logic touched — bcrypt login, account lockout, OTP cooldown/expiry/failedAttempts, session family rotation, and the response shapes are byte-for-byte intact (only the echo condition changed).
- **Dependencies**: `nodemailer@9` removed, `resend@^6.18.1` added in **both** `server/package.json` and root `package.json` (repo-root Railway deploy) + lockfiles. `npm audit` server: 1 remaining high is pre-existing/unrelated (unrelated to email).
- **Tests**: new `server/tests/email-service.test.js` (11 tests): dev OTP logging (to/OTP/expiry, `[DEV OTP]` marker), echo gating (`shouldEchoDevOtp`), Resend success payload + sender, Resend failure → sanitized error + no OTP in logs + no fallback to dev logger, production-missing-key fails loudly without logging the OTP, dev `RESEND_FROM_EMAIL` fallback to `onboarding@resend.dev`, production-requires-from, plus 3 subprocess tests proving `env.js` boot fails closed (missing `RESEND_API_KEY` / missing `RESEND_FROM_EMAIL`) and succeeds with both.
- **Config/docs**: `server/.env.example`, `docs/DEPLOYMENT.md`, `README.md`, and this CLAUDE.md updated (tech stack, OTP system, key env vars, dev OTP behavior) to document Resend behavior: optional in dev (dev-log fallback), required in production. No client changes (frontend never consumed the echoed dev OTP).
- **Manual steps (not code)**: add `RESEND_API_KEY` + `RESEND_FROM_EMAIL` to Railway Variables and remove the stale `SMTP_HOST/PORT/USER/PASS`/`EMAIL_FROM`/`SEND_REAL_EMAIL` vars; verify the sender domain in Resend; delete `node_modules/package-lock` diffs are committed. Local `server/.env` can stay as-is (SMTP vars ignored) or be trimmed.

### 2026-08-04 — Railway deploy fix: root `railway.toml` makes repo-root services build (client build skipped)
> User's Railway service was rooted at the **repo root**, so Railpack ran the root `package.json` scripts: `npm run build` (= `cd client && npx vite build`) crashed with `Cannot find package 'vite'` (client deps aren't installed at the root). Root cause was a dashboard setting (Root Directory), not code; the server itself boots from the repo root because the root `package.json` already lists all server deps (Node parent-resolution from `/app/node_modules`).
- **`railway.toml` (repo root) added**: `[build] buildCommand = "npm install --prefix server"` replaces the root client-build step (frontend is served by Vercel, never built on Railway); `[deploy] startCommand = "npm run start --prefix server"`, `healthcheckPath = "/api/health"`, restart-on-failure. Now a service rooted at the repo root OR at `server/` (where `server/railway.toml` applies) both deploy correctly.
- **Root `package.json`**: `build` is now a no-op that always exits 0 (frontend is built by Vercel via `vercel.json`); local client builds moved to `npm run build:client`. Belt-and-suspenders — even if Railpack ignores `railway.toml` and runs the detected root `npm run build`, the build can't fail on the Vite client build.
- **Docs**: `docs/DEPLOYMENT.md` Railway section now documents both supported service roots and what a successful build log should show.
- **Runtime reminder (still pending on the dashboard)**: the deploy also needs `MONGO_URI` (current failure: `Invalid scheme, expected mongodb:// or mongodb+srv://` = empty/missing URI), plus `ADMIN_PASSWORD`, `CLIENT_URL`, SMTP_*. Set in Variables → redeploy.

### 2026-08-03 — Decommissioned Vercel serverless; backend now targets Railway (long-running)
> User-approved topology: **Vercel = static frontend, Railway = backend**. The API now runs on a persistent Railway service with real Socket.IO + node-cron jobs; the Vercel serverless handler is removed. Repo changes only — the Railway/Vercel dashboard steps are still pending (see "To finish" below).
- **`vercel.json`**: removed the `/api/(.*)` → `/api/index.js` rewrite — Vercel is now pure static SPA hosting (every path → `/index.html`).
- **`api/index.js` deleted**: the serverless handler (dummy Socket.IO stub + connection cache) is no longer used. Nothing references it except `vercel.json`/docs, both updated.
- **`server/railway.toml` added** (replaces the deleted `render.yaml`): Railpack builder, `startCommand = "npm start"`, `healthcheckPath = "/api/health"`, restart-on-failure.
- **Client**: production builds must set `VITE_API_URL=https://<your-service>.up.railway.app` (Vercel env var, build-time). `client/src/config/api.js` derives the axios base URL **and** the Socket.IO origin from this one variable. `client/.env.example` updated to flag it as REQUIRED.
- **`.github/workflows/keep-warm.yml`**: optional uptime monitor now pinging `RAILWAY_HEALTH_URL` (repo variable) instead of the Vercel serverless health endpoint.
- **Docs**: `CLAUDE.md` Deployment + Keep-Warm sections, `docs/DEPLOYMENT.md`, and `README.md` rewritten for the Railway topology (env var tables, smoke test, common errors).
- **To finish (dashboard, not code)**: (1) create a Railway service from this repo with Root Directory `server` (reject the auto-import staging a `client` service — the frontend stays on Vercel) and Generate Domain → `https://<your-service>.up.railway.app`; (2) set Railway Variables: `MONGO_URI`, distinct `JWT_SECRET`/`REFRESH_TOKEN_SECRET`, `SEND_REAL_EMAIL=true`, SMTP_*, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `CLIENT_URL=https://stay-sync-six.vercel.app`; (3) add `VITE_API_URL` to Vercel production env + redeploy; (4) set the `RAILWAY_HEALTH_URL` Actions variable (optional); (5) verify `/api/health` 200 and two-tab real-time updates. Same MongoDB — no data migration; only the Railway server runs cron (`api/index.js` never called `initCronJobs`).

### 2026-08-02 — DB cleared intentionally (prior session) — empty state is expected; MongoDB recovered; rent-repair moot; server back up
> **Remember this (user-confirmed)**: the tenant/bed data was **deliberately cleared by the user in a previous session**. This was not recorded in CLAUDE.md at the time, so this entry is the correction. The empty state is NOT data loss.
- **State check (2026-08-02)**: `smart-hostel` currently holds **2 hostels, 0 tenants (active or inactive), 0 beds** — expected. No tenant data exists to repair or preserve.
- **MongoDB Atlas recovered**: the `ReplicaSetNoPrimary` outage (blocking everything on 2026-08-01) has cleared — replica set `atlas-pn3pi7-shard-0` is healthy and reachable.
- **Rent repair script (`server/scripts/sync-tenant-rents.js`) is MOOT for now**: idempotent, ran clean, and found nothing to sync because there are no tenants. Keep the script; re-run it after real tenant data exists (it backs up first and only touches mismatches).
- **Live server recovered**: `GET https://stay-sync-six.vercel.app/api/health` → **HTTP 200, `db: "connected"`** (cold-start after the outage). The 2026-08-01 "server crashed; pending restart on recovery" item is resolved — no manual restart needed on Vercel serverless.
- **Testing note**: since the DB is empty, the 45/45 DB-free tests + live verification against throwaway data remain the way to validate; any future "active tenant" flows need test tenants created first.

### 2026-08-01 — Production engineering audit + behavior-preserving optimizations (8-dimension fan-out)
> 8 parallel read-only audit subagents (security ×2, performance ×2, code quality ×2, DB indexes, deploy/reliability). All changes below are behavior-preserving unless noted. ⚠️ Live runtime verification deferred — MongoDB Atlas was in a `ReplicaSetNoPrimary` outage (server crashed; pending rent-repair + restart on recovery).

**Bug fixes (user-approved — deliberate behavior changes)**
- Tenant `PATCH /auth/password` now works: was always 400 because `changePassword` selected `+password` while Tenant stores it at `personalInfo.password` (select:false). Now selects the right path, sets the right field, and the session-revocation-on-change executes.
- `updatePayment`: `totalAmount` now recomputes on **amount** OR fine changes (was stale on amount-only PATCHes).
- Admin vacate list no longer shows a raw Mongo ObjectId as the room — `tenantId.roomId` is populated and rendered.
- `HostelRulesModal` keyboard lockout fixed: the scroll region is focusable (`tabIndex`) + `role="dialog"`/`aria-modal`, so keyboard users can reach Continue.

**Security**
- OTP `failedAttempts` reset to 0 on every issuance (5 sites) — a fresh code always gets its full 5-guess budget.
- Private notification content now delivered **only to the owning tenant's socket** (was broadcast to the whole hostel room, leaking payment amounts / replies / vacate reasons).
- Refresh tokens stored **hashed** (SHA-256) at rest with on-the-fly migration of legacy rows; lookups by hash.
- `/auth/refresh` + `/auth/logout` reject requests carrying a non-allowlisted `Origin` (closes the sameSite=None CSRF window).
- `document.body.innerHTML` fatal-error sink → `textContent`; error-tracking payloads redact tokens/phones + cap stack length.
- Dead Razorpay origins removed from the helmet CSP; stale `MOCK_PAYMENTS`/`RAZORPAY_*` env examples removed.
- **Dependencies**: `npm audit fix` → server 0 vulnerabilities (express, ws, mongoose, morgan, etc.), client 2 remaining (react-router RSC-mode CSRF — not applicable to this Vite SPA, needs major 8.x, flagged not forced).
- Startup warns (log-only) in production when `ADMIN_PASSWORD` is still the default; `render.yaml`/`DEPLOYMENT.md` mark `REFRESH_TOKEN_SECRET`, `SEND_REAL_EMAIL`, SMTP_*, ADMIN_* as REQUIRED.

**Performance**
- Tenant `GET /tenant/payments` syncs only the tenant's own invoices (was a full-hostel scan + bulkWrite per request, amplified by the 60s auto-refresh).
- `getFinancialOverview` month probes run in parallel (up to 14 serial round-trips → 1).
- Room rent cascade + cron per-tenant loops now use `Promise.all`/bulkWrite patterns.
- `getPaymentTotals` hint on a new `{ownerId, hostelId, paymentType, paymentStatus}` index; `getIncompleteProfiles` projects only the completeness-check fields.
- AdminDashboard no longer fetches complaints twice on mount/switch.

**Database — 6 additive indexes** (no schema change; built on next boot): Bed `{ownerId,hostelId,occupancyStatus,tenantId,holdUntil}`, Payment `{ownerId,hostelId,dueDate:-1}` + `{ownerId,hostelId,paymentType,paymentStatus}`, BedShiftRequest & ProfileUpdateRequest `{ownerId,hostelId,tenantId,createdAt:-1}`, Tenant `{ownerId,hostelId,isActive,createdAt:-1}`.

**Reliability / code quality**
- `/api/health` returns **503** when MongoDB is disconnected (Render health-check restarts a DB-dead service; body unchanged).
- Tenant-cleanup cascade now also purges `Notification`/`ProfileUpdateRequest`/`TemporaryAllotmentRequest`.
- XFF sanitization runs **before** morgan so access logs record the validated IP.

**Flagged, not changed** (need product/owner decision): default-admin fail-closed gate, SEND_REAL_EMAIL gate on Vercel, refresh-family wipe on two-tab refresh race, pagination for unbounded admin lists, `updateProfile` dead branches, dead exports, silent `.catch(()=>{})` logging sweep, SPA CSP meta tag, in-memory rate limiters on Vercel.

**Verified**: server lint clean, 45/45 tests, import smoke checks, client lint + build pass.

### 2026-08-01 — Multi-Hostel Financial Overview box: report the most recent month with activity
> User reported the admin "Multi-Hostel Financial Overview" box as not working. Root cause: both `financial-overview` and `hostels-summary` filtered strictly to the **current calendar month** (income keyed by English month-name + year, expenses by this month's date range). At the start of a month — and before tenants actually pay that month's rent — the box showed ₹0 / ₹0 / ₹0 even when real financials existed (on 2026-08-01, July's ₹X was invisible), which read as broken.

- **`getFinancialOverview`** now walks back from the current month (up to 6 months) and reports the **most recent month with any income or expense activity**, returning `month` + `year` alongside the totals. A brand-new property with zero activity still returns the current month at ₹0 (with the existing empty hint).
- **Client** (`AdminDashboard.jsx`) shows the effective month in the box header ("… · July 2026" instead of "… this month"), so the numbers are never a confusing ₹0 at month start.
- No API shape change — the new `month`/`year` fields are additive.

**Verified**: server lint clean, 45/45 tests, client lint + build pass. (Live DB check deferred — MongoDB Atlas was in a `ReplicaSetNoPrimary` outage at time of writing; the same outage also blocks the pending rent-sync repair below.)

### 2026-08-01 — Room rent is now authoritative + rent-change notification + morning overdue reminder
> Bug reported by user: updating a room's rent in inventory did not reflect in already-assigned tenants. Root-caused with live data (Room 201 priced ₹7,000, tenant still at ₹5,000): **tenant rent followed the BED price, not the room** — `assignTenantToBed` set `monthlyRent = bed.pricing || room.pricing`, and `updateRoom`'s cascade deliberately skipped tenants on beds whose price differed from the old room price. User-approved fixes:

- **Room rent is the single source of truth**: `updateRoom` price change now syncs **every** occupied tenant in the room to the new room rent (custom-bed exception removed), and beds that inherited the old room rate (pricing 0 or = old room price) are refreshed to the new room price. `assignTenantToBed` (both call sites) now prefers the room price: `room.pricing || room.monthlyRent || bed.pricing || …`.
- **Tenant notified on rent change**: `syncTenantRentForPricingChange` now also creates a durable inbox `Notification` (type `rent`, "Your rent has been updated") for the affected tenant, in addition to the existing hostel-wide `rent_changed` notice.
- **Morning overdue reminder**: new daily **07:00** cron `rent-overdue-reminder` — for every active tenant with a rent invoice past its due date (unpaid/overdue/partial), creates an unread `rent_due` Notification ("Rent overdue — ₹X (Month Year)"). Upsert-while-unread so a tenant sees a fresh reminder each morning until settled; reminders auto-clear (marked read) once no overdue rent remains.
- **Data repair (user-approved, pending DB availability)**: `server/scripts/sync-tenant-rents.js` backs up every active tenant whose `monthlyRent` differs from their room's price, sets it to the room price, and creates a `rent` notification per tenant. ⚠️ **Blocked by a MongoDB Atlas `ReplicaSetNoPrimary` outage at time of writing** — the running server crashed on the same error. The script is ready; it runs once the cluster recovers (idempotent, backs up first).

**Verified**: server lint clean, 45/45 DB-free tests pass, client unaffected.

### 2026-08-01 — Post-completion hardening: durable notification inbox, photo/PDF uploads, payment-amount validation, owner meal/tenant-uniqueness fixes
> Follow-up to the tenant-portal completion, based on remaining audit items. User decisions honored: **no-OTP first-password flow kept as-is** (documented risk below) and **payment-request amount validated against the rent invoice**.

**Durable notification inbox (user-approved feature)**
- New `Notification` model (ownerId, hostelId, tenantId, type, title, message, read) + `services/notificationService.js` (`createTenantNotification`, `notifyAllTenants`). Notifications persist so a tenant with the page closed still sees them on login.
- Written on: complaint **status change** and **admin reply note** (ticket owner), profile **approve/reject**, vacate **approve/reject**, bed-shift **approve/reject**, payment-request **approve/reject**, every **new notice** (all active tenants), and the daily incomplete-profile cron (per-tenant "Complete your profile", upsert-while-unread, auto-cleared once complete).
- New tenant routes: `GET /tenant/inbox` (notifications + `unreadCount`), `POST /tenant/inbox/:id/read`, `POST /tenant/inbox/read-all`. The dashboard **Activity widget now shows the inbox** (unread dot + "Mark all read", click to mark read). New `new_notification` socket event (targeted payload carries `tenantId`; `broadcast: true` for notices) — this resolves the previously dead `new_notification` listener by implementing the event server-side. The notices board on the Notifications page is unchanged.

**Photo/PDF document uploads (user-approved: "need upload for photos/PDFs")**
- Scoped a larger JSON body parser to `/api/owner/tenants` (`express.json({ limit: "10mb" })`) so base64 photo/PDF data URLs reach the handler; the default 1 MB cap stays everywhere else (DoS guard preserved).
- New `docField` validator (validators/resources.js) applied to `idProof` (create/update/assign-bed) and `offlineBookingForm` (update): accepts a base64 data URL of **JPG/PNG/WebP/PDF** or an http(s) URL, bounded to ~6 MB — real photos/PDFs no longer 413 out, and non-image/PDF payloads are rejected with an inline field error.

**Payment-request amount vs invoice (user-approved)**
- `createPaymentRequest` now finds the tenant's outstanding rent invoice for the period (unpaid/overdue/partial) and requires the requested amount to match its `totalAmount`; mismatches (or a month with no invoice) are rejected with a clear message. Pure `checkPaymentRequestAmount()` helper in paymentService.js (unit-tested) — prevents under/over-booking and the far-future-arbitrary-month abuse.

**No-decision audit leftovers**
- **Owner `listMealTimings`**: invalid `dayOfWeek` now 400 (was silently `NaN` → empty list).
- **`updateTenant` (admin edit)**: duplicate phone/email now returns a clean 409 field error instead of an unhandled E11000 500.
- **Dead code**: removed the unused `getActiveVacateRequest` export from `vacateService.js`.
- **Socket privacy**: `payment_request_created` no longer broadcasts `tenantId` + `amount` to the whole hostel (clients only use it as a refetch trigger; matches the slimmed complaint/payment_completed events).

**Accepted risk (user decision, no change)**: the first-time password set (`POST /auth/tenant/set-initial-password`) remains **phone + password with no OTP**, so anyone who knows a tenant's mobile number can claim an account that has never set a password. The security audit flags this as an account-takeover window; it is documented as a deliberate choice. Revisit if the product can absorb an OTP-to-email step for first-login.

**Verified**: server lint clean, **44/44 server tests**, client lint clean, client build passes.

### 2026-08-01 — Tenant auto-refresh, rent-sync+notice, deposit ₹1,000, Multi-Hostel box fix (fan-out)
> Four parallel workstreams (subagents + coordinator). Full verification: server lint clean, 43/43 tests, client lint clean, client build passes.

- **Tenant auto-refresh (no manual reload)**: on Vercel the Socket.io stub drops events, so tenant pages went stale. New reusable `client/src/hooks/useAutoRefresh.js` — refetches on tab-visibility + polls every 60s while visible (with an in-flight guard, cleanup on unmount, `_skipCache` so fresh data actually re-renders). Applied to `TenantDashboard`, `TenantBedShift`, `TenantVacateRequest`, `TenantProfileSettings`, `TenantPayments`, `Notifications` (background refreshes skip the loading skeleton via an opts flag). Socket listeners kept intact — socket still gives instant updates where it works.
- **Rent change in inventory → tenant rent + system notice**: new `server/src/services/rentChangeService.js` (`syncTenantRentForPricingChange` + pure `buildRentChangeNotice`). New `rent_changed` Notice type (additive enum value). In `structureController.updateBed` (pricing path) the occupying tenant's `monthlyRent` is synced to the new bed price + a notice ("Dear {name}, your monthly rent… updated from ₹X to ₹Y", names the tenant + room/bed) + `tenant_updated`/`notice_created` socket events — only when the rent actually changes (no spam). `updateRoom` cascades to room tenants: a bed whose price equals the OLD room price (inherited) gets the new room price; beds with a custom price are untouched (coordinator fix to the initial implementation). Status/label/capacity paths untouched.
- **Security deposit ₹10,000 → ₹1,000**: `TENANT.SECURITY_DEPOSIT_AMOUNT = 1000`; UI + server comments updated (`TenantProfile.jsx`, `TenantOnboardModal.jsx`). Affects new tenants; existing stored deposits unchanged.
- **Multi-Hostel Financial Overview box**: root-caused dead state — `/owner/financial-overview` was fetched but stored in `[, setFinancialOverview]` (never read); the box actually rendered from `hostels-summary` and was gated on `hostelSummaries.length > 0`, so it could be silently absent. Wired the always-fetched `financial-overview` data into the box (loaded with the main dashboard loader), the box always renders once the dashboard loads, has a real loading skeleton + ₹0/empty hints, a graceful fallback summing per-hostel `hostels-summary` totals, and resets on hostel switch.

### 2026-08-01 — Request delete + admin Undo toast (with auto-cleanup) + bed-hold window
> User-approved design: tenants delete their own **pending** requests; admin approves/rejects via a bottom-right **Undo** toast; processed requests auto-delete 2s after the toast closes.

- **Tenant DELETE endpoints (own request, `status === "pending"` only)**: `DELETE /tenant/bed-shift-requests/:id`, `/tenant/vacate-requests/:id`, `/tenant/profile-requests/:id` (`tenantController.js`). Pending-only guards the partial-unique pending index; emitting the existing `*_request_updated` socket events keeps admin lists live. Delete buttons added on the tenant room-shift page, vacate widget, and profile page.
- **Owner UNDO endpoints** (`PATCH /owner/…/:id/undo`): revert a processed request to `pending`.
  - Reject (all 3) & vacate-approve: safe — just clears review/approval fields.
  - Profile-approve: restores the tenant's applied fields from `currentSnapshot` (transactional).
  - Bed-shift-approve: **best-effort move-back** to `request.currentBedId` (the bed is held, so usually still free); if it's taken, the tenant stays in the new room, the request returns to `pending`, and the response flags `movedBack:false`.
  - All undo paths reject if the tenant already has another pending request (guards the partial-unique index).
- **Owner DELETE cleanup endpoints** (`DELETE /owner/…/:id`): called by the client 2s after the undo toast expires. **Approved vacate requests cannot be deleted** — the vacating-completion flow (`vacateService.assertCanVacate`) requires the record; they persist until the tenant's 15-day hard-delete cascade.
- **Bed hold window**: new `Bed.holdUntil` (Date) + `BED_SHIFT.HOLD_RELEASE_MS` (45s = 8s undo toast + 2s auto-delete + 30s requested). Bed-shift **approval** sets `holdUntil` on the tenant's old bed inside the approval transaction. New `occupancyService.availableBedFilter()` (`$or: [holdUntil: null, holdUntil: { $lte: now }]`) is applied to every auto-claim site: `selectRandomAvailableBedForType`, both `assignTenantToBed` claim queries, `tempAllotmentService.getAvailableTypes`, bed-shift approval's `availableBed` find, and convert-to-permanent's bed find. So the old bed can't be re-allotted until the undo window + 30s passes.
- **Frontend**: `utils/undoToast.jsx` (`showUndoToast` — toast + Undo button + 2s-later expire callback) wired into `AdminBedShiftRequests`, `AdminVacateRequests` (expire skips delete for approved), `AdminProfileRequests`. Delete buttons added to `TenantBedShift`, `TenantVacateRequest`, `TenantProfileSettings`.
- **Tests**: 2 new in `tests/requests.test.js` (hold filter semantics, hold duration ≥40s). 41/41 pass; server + client lint clean; client build passes.

### 2026-08-01 — Unified Requests page (admin) + dedicated tenant room-shift page
- **Admin**: the three separate review pages (`/admin/vacate-requests`, `/admin/bed-shift-requests`, `/admin/profile-requests`) are consolidated into one **`/admin/requests`** page (`pages/AdminRequests.jsx`) with a type filter pill bar (**Room Shift | Vacate | Profile Edit**) that switches which section renders. The section components (`components/AdminBedShiftRequests.jsx`, `AdminVacateRequests.jsx`, `AdminProfileRequests.jsx`) are reused unchanged — cards, per-status filter, approve/reject with note all intact. Sidebar "Management" group now shows a single **Requests** item (was Vacate / Bed Shift / Profile Req.). Old routes redirect to `/admin/requests?type=…` (deep links / bookmarks keep working); the old page-wrapper files were deleted.
- **Tenant**: new **`/tenant/room-shift`** page (`pages/TenantRoomShift.jsx`) for sending room-shift (bed-shift) requests — moves the form + status list out of the dashboard widget onto a dedicated tenant page (reuses `components/TenantBedShift.jsx`). Added to the tenant sidebar (Support group, "Room Shift"); the dashboard widget is replaced with a link card to the page.
- **Verified**: client lint clean, `npm run build` passes (new `AdminRequests` lazy chunk generated).

### 2026-08-01 — Bug fix: bed-status change no longer prorates an active tenant's rent
- **Root cause**: `updateBedStatus` (`occupancyService.js`) freed an occupied bed via `freeTenantBed(tenant, session)` with the default `prorate: true`. Marking a bed `available`/`maintenance` for an ACTIVE tenant therefore cut their latest unpaid invoice to `monthlyRent × activeDays/periodDays` — e.g. 5000 × 1/31 = ₹161. All other bed-freeing paths (shifts, room-type allocation, convert-to-permanent) already pass `prorate: false`.
- **Fix**: `updateBedStatus` now calls `freeTenantBed(tenant, session, { prorate: false })` — a bed-status change is a shift, not a checkout, so billing is untouched. Only genuine vacates (`removeTenant`/`updateTenant({isActive:false})`) still prorate.
- **Data repair (user-approved, read-only diagnosis + transactional restore)**: 5 July invoices were prorated to ₹161 on 2026-07-31. 2 were genuinely vacated same-day (kept at ₹161). The 3 **active** tenants' invoices were restored to their original first-month amounts: yaswanth & chakradhar reddy → ₹5,000, Sai Kumar → ₹7,000 (₹5,000 rent + ₹2,000 deposit recorded in his invoice note). Backup: `server/scripts/backup-prorated-invoices.json`; fix script `server/scripts/fix-prorated-invoices.js`.
- **Verified**: 39/39 server tests, lint clean. Diagnostic note: a tenant's `monthlyRent` was never wrong — the ₹161 was always the prorated invoice amount.

### 2026-08-01 — Monthly rent generation moved from 3rd → 2nd (due date 8th → 7th)
- **Cron schedule**: `cronService.js` monthly-fee-generation job changed from `0 0 3 * *` → `0 0 2 * *` (2nd of each month at 00:00). The 5-day grace is preserved: `dueDate` now uses day 7 (2nd + 5-day grace = 7th) instead of day 8.
- **First-month invoice aligned**: the first-month rent invoice created at tenant registration (`tenantsController.js`) previously used due day 8; moved to day 7 so all invoices share the same due-day convention.
- **Duplicate prevention unchanged**: still skips tenants who already have an invoice for the month/year.
- **Docs**: CLAUDE.md cron/billing sections + README.md updated; `server/tests/validators.test.js` sample `dueDate` untouched (unrelated).

### 2026-08-01 — Tenant portal completion: 8-domain audit + profile change-request workflow, bed-shift UI, mandatory-docs alert, notices read/unread, complaint timeline, security hardening
> Based on a parallel 8-subagent audit of the tenant portal. **Backend authorization was already solid (no IDOR); the gaps were missing/incomplete UI and one workflow.** Full completion was user-approved; the no-OTP first-password flow was explicitly kept as-is (risk documented).

**Verified bugs fixed**
- **Payment request POST 404 (critical)**: client posted to `/tenant/payment-requests` (plural) but the server registers only `/tenant/payment-request` (singular). `TenantPayments.jsx` now posts to the singular path — the tenant payment-request flow works again. Tenant payment-request status is now surfaced in the UI (was an unused `GET /tenant/payment-requests`).
- **Complaint real-time payload**: `complaint_created` now emits `_id` (plus `id` alias) so the owner's live card gets a valid key + working status button; client dedups prepends by `_id`. `complaint_updated` tenant toast is now gated on ownership (membership in the loaded list) — no more "another tenant's ticket changed" toasts.
- **Notices**: `listNotices` honors `limit` (default 100), strips the full `readBy` array (tenant-ID enumeration) and returns `isRead` for the requesting tenant only; `markNoticeRead` now applies the same visibility filter as the list (no marking system_/expired notices read). Dashboard `recentNotices` aligned to the same filters.
- **Payments**: tenant `listPayments` runs `syncPaymentStatusesOnly` (fresh overdue/unpaid flags); `totalDue` now includes partial payments (consistent with dashboard); tenant UI renders a **Partially Paid** section, `paymentType` (rent/deposit/fee), `paidDate`, `paymentMethod`, and `receiptNumber` in paid history; dashboard invoices show `totalAmount` (rent + fine).
- **Meal timings**: `startTime`/`endTime` validated (HH:MM or HH:MM AM/PM), `items` bounded (40 × 40 chars); owner `dayOfWeek` no longer silently NaNs; tenant endpoint now supports `dayOfWeek` (parity with owner); client adds a **Today's Menu** card + day highlight for tenants and a tab-focus refetch fallback (live updates work on Vercel where the socket stub drops events); seed script now seeds **Evening Snacks** (4 meals × 7 days).
- **Bed-shift**: `requestedRoomId` is now **required** and validated to belong to the tenant's own hostel (was optional → structurally un-approvable requests); `requestBedShift`/`createVacateRequest` add `isActive` guards (parity with complaints/payment-request).
- **Complaint `imageUrl`** must be a valid URL; **payment-request `amount`** bounded (1–₹5,00,000) + proof must be a URL.

**New workflows**
- **Profile change-request workflow (biggest)**: new `ProfileUpdateRequest` model (tenantId, requestedChanges, currentSnapshot, status pending/approved/rejected, reviewedBy/reviewDate/reviewNotes, partial-unique pending index). Tenant routes `POST /tenant/profile-request` + `GET /tenant/profile-requests`; owner routes `GET /owner/profile-requests` + `PATCH /owner/profile-requests/:id`. **Approval is the only write path** — it applies changes transactionally with phone/email uniqueness + 10-digit phone + contact-mismatch checks; rejection leaves the profile untouched. `PATCH /auth/profile` is now **owner-only** (tenants get 403 → must use the request workflow). New tenant page `/tenant/profile` (`TenantProfileSettings.jsx` — edit → submit → status list) and owner page `/admin/profile-requests` (`AdminProfileRequests.jsx` — current-vs-requested diff + approve/reject with notes). Socket events `profile_request_created`/`profile_request_updated`.
- **Bed-shift UI (was API-only)**: new `TenantBedShift.jsx` on the tenant dashboard (room picker from new `GET /tenant/rooms` + reason + own-status list) and `/admin/bed-shift-requests` review page (`AdminBedShiftRequests.jsx`, approve/reject with notes). `updateBedShiftRequest` emits `bed_shift_request_updated` (was silent) and re-checks the tenant is active; admin list populates `requestedRoomId`.
- **Mandatory-docs alert**: new shared `utils/profileCompleteness.js` (single source of truth for the mandatory field set — now includes **Address**; `canSelfServe` distinguishes tenant-fixable vs owner-managed). Owner detection (cron + `/owner/tenants/incomplete-profiles`) refactored onto it. New `GET /tenant/profile-completeness` feeds a **red "Action required" banner** on the tenant dashboard listing missing items + a link to `/tenant/profile`; the "Verified" badge is now derived from real completeness instead of hardcoded. `tenantUpdateSchema` now accepts `address` + enforces the 12-digit `aadhaarNumber` regex.
- **Notices read/unread (was dead plumbing)**: tenant `Notifications.jsx` marks notices read on view (`POST /tenant/notices/:id/read`), renders unread dots/bold, shows an unread count + "Mark all read".
- **Complaint visibility**: ticket cards now expand to a **status timeline + SLA** (with breached state) + resolved time; admin can add a **reply note without a status change** (persisted as a history entry) and can set **`needs_info`** ("more information requested") — both visible to the ticket owner only.

**Security hardening**
- Router-level `authorize("owner")` added to `ownerRoutes` (defense-in-depth so a future route that forgets `requirePermission` can't let a tenant token through).
- `mutationLimiter` applied to all tenant mutation endpoints (complaints, bed-shift, payment-request, vacate-request, notice-read, profile-request).
- `PaymentRequest` gets a partial-unique **pending** index per (tenant, month, year) — race guard for concurrent duplicate submissions.
- New `daysBetweenStartOfDay()` helper in `utils/date.js` (the vacate 15-day boundary math, extracted for unit testing).

**Verified**: 39/39 server tests (12 new in `tests/tenant-portal.test.js` — vacate boundary, completeness, profile-request/bed-shift/meal/payment/complaint/tenant validators, partial-unique indexes), server + client lint clean, client build passes.

### 2026-07-31 — Tenant login: doesPassCreated flag, no-OTP first-password set, inline validations
- **`doesPassCreated` flag**: `Tenant.isPasswordSet` renamed to `doesPassCreated` (boolean, default `false`). Idempotent `$rename` migration added to `runSchemaMigration` (db.js) preserving existing values. All references in `tenantAuth.js` updated (`checkTenantStatus` still returns `hasPassword` key sourced from `doesPassCreated` for client compat).
- **First-time password creation without OTP** (user-confirmed): `setInitialTenantPassword({ phone, password })` no longer verifies an OTP; `tenantSetInitialPasswordSchema` drops the `otp` field; `AuthContext.setInitialPassword(phone, password)`. Password is bcrypt-hashed (pre-save hook), `doesPassCreated` flips to `true`, never exposed in responses. (`/tenant/set-password` OTP route and forgot/reset flows untouched.)
- **Login page** (`Login.jsx`): unknown mobile → "Tenant with this mobile number does not exist." below the button. `doesPassCreated=false` → Create New Password + Confirm Password, **both with show/hide eye toggles**, inline strength (min 8 + upper + lower + number, matching `strongPassword`) and match errors below each field. `doesPassCreated=true` → single Password field with eye toggle. No OTP field, no browser alerts.
- **Duplicate mobile inline error**: `createTenant` now checks phone uniqueness FIRST (before the email check, so a generated placeholder email can't mask it) and throws `409` with `fieldErrors.phone` = "A tenant with this mobile number already exists."; `TenantManagement.handleSubmit` maps it into `phoneError`, rendered inline under the Mobile field in `TenantOnboardModal`. Emergency-contact ≠ mobile already enforced (schema refine + modal) with inline `emergencyContact` error.
- **Pre-existing bug noted (not fixed — out of scope)**: `issueTokens` signs refresh tokens with second-granularity `iat`, so two token issuances for the same user within the same second collide on the unique `token` index → 409 "A record with this token already exists". Not triggered by this flow in normal use (set-password auto-logs-in); surfaced only by back-to-back test logins.
- **Verified live** (throwaway tenants, cleaned up — 0 residue): default `doesPassCreated=false`; check-status exists/hasPassword routing; first-password create without OTP → `doesPassCreated=true` + bcrypt hash; returning-password login 200; wrong password 401; duplicate mobile 409 with inline phone field error; emergency=phone rejected inline. 27/27 server tests, both linters clean, client build passes.

### 2026-07-31 — Tenant login: set-password flow fixed (inputs hidden + broken submit)
- **Root cause**: the tenant set-password flow was refactored into a two-step screen — a "Send OTP" step with **no input fields**, then a second screen with OTP/password inputs gated behind `otpSent`. Users landing on the set-password screen saw no inputs. Additionally `Login.jsx` destructured `setUser` (which `AuthContext` does not expose) and called the backend directly, so the final submit threw "setUser is not a function"; and `AuthContext.setInitialPassword` sent only `{ phone, password }` while the backend requires a verified `otp`.
- **Fixes**: `Login.jsx` now renders a single set-password screen with the Verification Code / New Password / Confirm Password inputs always visible, a Send/Resend OTP button beside the code field, and correct copy ("OTP is sent to the email on your profile"). The submit handler uses the context's `setInitialPassword(fullPhone(), otp, newPassword)` instead of the missing `setUser`. `AuthContext.setInitialPassword` signature is now `(phone, otp, password)` and posts all three (no other callers). Removed the now-unused `api` import from `Login.jsx`.
- **Verified live** (throwaway tenant, cleaned up): `set-initial-password {phone, otp, password}` → 200 + tokens, `isPasswordSet` persisted, and `tenant/login` with the new password → 200. Client lint + build clean.

### 2026-07-31 — Real-time UI updates + corrected vacate workflow (15-day notice → date-gated completion)
- **Real-time updates**: the axios GET cache is now invalidated on ANY mutation (previously only the mutated resource's parent path, so `PATCH /owner/beds/:id` left `/owner/structure` and `/owner/dashboard` cached stale). Cross-cutting views (dashboard stats, occupancy, structure, payment totals) aggregate many resources, so clearing the whole cache on any mutation makes the next GET for affected data hit the server — no full-page reloads, no polling.
- **Missing socket events added** so open views update instantly across tabs/roles (Render deployment): bed-status changes and room/floor create/update/delete → `occupancy_update`; meal timings create/update/delete → `meal_timing_updated`; tenant vacate submit → `vacate_request_created`; admin vacate review → `vacate_request_updated`; tenant payment-request submit → `payment_request_created`; notice delete → `notice_deleted`; tenant profile update → `tenant_updated`; waiting-queue auto-shifts → `tenant_assigned` + `occupancy_update` (via `io` passed into `processWaitingQueue`).
- **Client listeners wired**: MealTimings, TenantVacateRequest, AdminVacateRequests (new requests + reviews), AdminPayments (new payment requests), Notifications (notice deleted), TenantManagement, TenantProfile (scoped to the viewed tenant), TenantDashboard (own `tenant_assigned`).
- **Vacate request = 15-day advance notice** (was 7): `TENANT.VACATE_MIN_NOTICE_DAYS = 15` in `utils/constants.js`; `createVacateRequest` enforces start-of-day ≥15 days; the tenant form now min-dates 15 days out with an inline validation message on submit (and surfaces the backend message inline when it matches).
- **Approval no longer auto-deactivates** (was: `scheduledDeactivationDate = approval + 15d` + a `vacate-deactivation` cron). The cron is removed. Approving stores `reviewDate` (approval timestamp) and `approvedVacateDate = requestedVacateDate` on the VacateRequest; the tenant stays active in their room.
- **Date-gated vacating (approval required)**: `removeTenant` and `updateTenant({isActive:false})` call `vacateService.assertCanVacate`, which is now the ONLY way a tenant can be vacated — it requires an approved vacate request for that tenant whose approved vacating date has arrived, and re-verifies the submission→date gap is ≥15 full days (defense-in-depth). A tenant with no request, a pending/rejected request, or an approved request with a future date is rejected with a clear 400 BEFORE any side effect (bed not released, retention not started, queue not triggered). `removeTenant` also rejects already-vacated tenants. This holds even when the API is called directly.
- **Vacate action auto-eligibility**: `listTenants`/`getTenant` serialize `vacateRequest {status, requestedVacateDate, approvedVacateDate}` per tenant (via `toObject()`, since mongoose toJSON drops custom props). `client/src/utils/vacate.js` `getVacateState()` returns eligible ONLY for an approved request whose date has arrived — the Vacate button is disabled for everyone else, with a tooltip explaining why (approved-not-arrived shows an amber "Vacate {date}" badge). Computed on render, so it unlocks automatically when the date arrives.
- **Workflow bookkeeping**: completing a vacating marks the approved request `completed` (new enum value, shown as sky-blue in the vacate pages); `undoVacate` reopens it to `approved`.
- New files: `server/src/services/vacateService.js`, `client/src/utils/vacate.js`. Test updated: `TENANT.VACATE_MIN_NOTICE_DAYS === 15` (retention constant unchanged); 27 server tests pass; server+client lint and client build clean.

### 2026-07-31 — Room-type allotment, temp-allotment queue/auto-shift, 15-day retention, vacate modal + toast + Undo
- **Room-type allotment**: the admin selects only a room type (`sharingType`); `assignTenantToBed` auto-assigns a random available room+bed of that type (atomic claim via `$sample` + `findOneAndUpdate`, inside the caller's transaction). `tenantCreateSchema`/`assignBedSchema` now require/accept `sharingType`. First-month bill uses the assigned rent.
- **Available room types only**: onboarding step 2 filters to types with ≥1 available position; the server revalidates at submit (`No beds available for this room type` → inline error).
- **Temporary-allotment waiting queue**: new `TemporaryAllotmentRequest` model (tenantId, requestedSharingType, status, requestedAt, completedAt, temp-room/bed snapshot) with a partial unique index preventing duplicate active requests. `createTenant`/`assignBed` enqueue when `isTemporary && preferredSharing`. FIFO ordering = requestedAt asc, then `_id`.
- **Automatic shift**: `tempAllotmentService.processWaitingQueue` (self-transactional, WriteConflict-retry) serves the earliest waiting request per room type whenever a bed/room is released — triggered after vacate/deactivate, shifts (assignBed, bed-shift approval, convert-to-permanent), bed status→available, and room create/update; the vacate-deactivation cron also runs it.
- **15-day retention**: `TENANT.SCHEDULED_DELETION_MS` now 15 days — vacated tenants are hard-deleted only 15 full days after the actual vacating timestamp (idempotent daily cron, never touches active tenants).
- **Vacating confirmation modal**: new `ConfirmModal` (centered, blurred overlay, focus, Escape, Cancel/Confirm) replaces `window.confirm` in the tenant table; content explains 15-day retention.
- **Bottom-right toast + Undo**: after vacating, a bottom-right toast shows "Tenant vacated successfully." with an Undo button; Undo calls the new `POST /owner/tenants/:id/undo-vacate` (transactional restore of active status, cancellation of deletion timestamps, and the previous room/bed when still available — otherwise the tenant is marked `needsReassignment`).

### 2026-07-31 — Vacate requests: 15-day deactivation after approval
> ⚠️ **SUPERSEDED the same day** — replaced by the "Real-time UI updates + corrected vacate workflow" entry above. Approval no longer schedules `scheduledDeactivationDate`, the `vacate-deactivation` cron is removed, and the admin completes vacating manually on/after the approved date. `TENANT.VACATE_DEACTIVATION_DAYS_MS` was removed (replaced by `TENANT.VACATE_MIN_NOTICE_DAYS`). Kept here only as history; the historical behavior described below no longer applies.

### 2026-07-31 — Targeted fixes: fixed deposit, payment grace, temporary marking, auto bed-assign, room availability, contact validation
- **Fixed Security Deposit ₹10,000**: `TENANT.SECURITY_DEPOSIT_AMOUNT = 10000` in `utils/constants.js`; `createTenant` applies + persists it on the tenant doc (with `isSecurityDepositPaid`/`securityDepositDate`), `updateTenant` forces it; `securityDepositAmount` removed from create/update schemas (custom values rejected); amount inputs removed from `TenantOnboardModal` + `TenantProfile` (fixed ₹10,000 display; only the paid-status toggle remains).
- **Payment status 5-day grace**: `derivePaymentStatus` only marks `overdue` when the due date has passed AND ≥5 full days since `createdAt` (`PAYMENT.OVERDUE_GRACE_MS`) — a new payment is never overdue at creation.
- **Temporary allotment**: `createTenant` now persists `isTemporary`/`preferredSharing` (previously dropped → temp tenants stored as permanent); `isTemporary` added to the structure projection; beds in `RoomManagement` show a "T" badge for temp occupants.
- **Manual bed selection removed**: onboarding/reassign now pick a room and the server auto-assigns an available bed — `assignTenantToBed` gained a `roomId` path that atomically claims an available (non-occupied, non-maintenance) bed; `createTenant`/`assignBed` pass `roomId`; `assignBedSchema` accepts `roomId` (bedId still allowed for backward compat); modal step 4 is now a room-confirmation screen.
- **Only available room types shown**: onboarding step 2 filters sharing capacities to those with ≥1 available room; server re-validates capacity/bed availability at assignment and returns the specific message inline (preserved via `assignBed` catch).
- **Contact-number validation**: Mobile and Emergency Contact must differ — enforced in `TenantOnboardModal.validateForm` (error under the Emergency Contact field) and in `tenantCreateSchema`/`tenantUpdateSchema` `.refine()` (message surfaced via normalized fieldErrors).

### 2026-07-31 — Second audit pass: production hardening (7 parallel agents, behavior-preserving)
- **Security (server)**: CORS preview allowlist now requires a real Vercel deployment-hash suffix (blocks squatted subdomains); tenant first-password set now requires a verified OTP (was phone-only takeover); `SEND_REAL_EMAIL` fails closed in production (must be `"true"`); XFF sanitized to the rightmost hop; OTP verify has a 5-attempt per-code limit (`failedAttempts`); account lockout is IP-bounded (in-memory map, single IP can't lock a user); JWT/refresh secrets required in production (placeholder rejected); refresh cookie aligned to 30d; `markNoticeRead` validates the id; tenant payment-request routes wired (`POST /payment-request`, `GET /payment-requests`); password change revokes all sessions; socket complaint emits slimmed (no tenant PII); jwt verify pins HS256; sockets re-verify token on `join_hostel`.
- **Data integrity (server)**: payment-request approval now marks the existing invoice paid instead of colliding with the unique invoice index; manual payment creation 409s on an existing period invoice; `updateTenant({isActive:false})` frees the bed + schedules hard-delete; `derivePaymentStatus` preserves `partial`; bed shifts no longer prorate rent (only move-out); bed-shift/vacate approvals are transactional with pending guards; `setupHostel` validated + refuses while tenants assigned; `DELETE /owner/floors/:id` added; cron consolidated notice stays fresh; first tenant history entry is `check_in`; cron lock releases only its own `expiresAt`; maintenance beds excluded from availability.
- **Database**: idempotent dedup migrations before the unique Payment invoice index and the Tenant phone unique index build; missing indexes added (`Tenant.email` global, `Tenant {isActive,scheduledDeletionDate}`, `Notice.readBy`, cross-hostel Payment/Expense aggregates); redundant indexes removed across models; stale `manager` enums dropped; tenant migration uses per-field `$set`.
- **Client**: axios GET cache invalidated on any token change (login/logout/switch — fixes cross-account leak); 401 handling only skips refresh on credential-returning auth routes (`/auth/me` still refreshes); cache-served responses no longer re-stamp freshness (SWR works); `refreshTotals` bypasses cache; `fetchUser` retries transient failures; cross-tab logout sync; AuthContext memoized; fixed temp-tenant/reassign form submit, tenant password-login error display, fine double-count display, "Unpaid (this month)" filter, delete-floor now deletes the floor, out-of-order fetch guards, socket-notice clobber, unencoded search params, `HostelRulesModal` tall-viewport lock, a11y switches; removed dead `OwnerOnboarding.jsx`/`loginVerifiedOwner`, dead payment/financialOverview state, dead props.
- **Perf/build**: socket.io-client lazy-loaded (out of the entry chunk — entry ~389KB → ~257KB raw); vendor chunk splitting (react/router/axios); Google Fonts loaded async; dead `error-catcher.js` removed; analyzer output gitignored.
- **Tooling/docs**: root `start` script fixed (`--prefix server`); prettier added at root; CI workflow added; `server/tests` staged; faker dep removed; empty `config/payments.js` removed; MOCK_OTP/`123456`/Razorpay claims removed from docs; stale billing/late-fee/manager/keep-warm text corrected; `npm run lint` and `npm test` clean.

### 2026-07-31 — Full audit resolution (all C/H/M/L findings in this doc implemented)
- **C-1 Socket auth**: `server/src/index.js` adds `io.use()` JWT verification; sockets can only join `hostel_{id}` rooms they own. Client `SocketContext.jsx` sends the access token via `auth` callback (re-read per reconnect).
- **C-2 Access token 15m**: `utils/tokens.js` `ACCESS_EXPIRY = "15m"` (refresh stays 30d); seamless refresh via existing axios interceptor.
- **C-4 Admin creds → env**: `ADMIN_EMAIL`/`ADMIN_PASSWORD` added to `config/env.js` (with defaults preserving existing deployments) + `.env.example`. `authService` admin branch now runs through bcrypt + lockout (was a plaintext bypass).
- **C-5 Client-side admin check removed**: `AdminLogin.jsx` no longer embeds credentials; email field is now editable.
- **C-6 Cron mutex**: new `CronLock` model + `withCronLock()` (`services/cronLock.js`) guards every cron job.
- **C-7 Axios cache race**: cache `epoch` counter; GET responses are only written back if no mutation happened mid-flight.
- **C-9 Phone index** on `Tenant` schema (`"personalInfo.phone": 1`).
- **H-1 CORS**: `*.vercel.app` wildcard narrowed to the app's own Vercel project previews.
- **H-2 Token scoping**: `authenticate` rejects tokens missing userId/ownerId or with unknown roles.
- **H-3 Body size limits** (1mb) on `express.json`/`urlencoded`.
- **H-4 X-Forwarded-For** validated (only well-formed IPs kept).
- **H-5 HPP protection** — duplicate query params collapsed (last value wins).
- **H-6 TenantManagement split** into `components/tenants/{TenantTable,TemporaryAllotments,TenantOnboardModal}.jsx`.
- **H-8 Refresh queue bounded** (`MAX_QUEUE_SIZE = 50`).
- **H-9 DB reconnect backoff** (exponential + jitter).
- **M-1+L-16 Cron logging**: structured JSON logs + bounded run history + optional `CRON_ALERT_WEBHOOK`.
- **M-2 Hooks**: fixed safe `exhaustive-deps` cases; AuthContext `useMemo` → plain object (behaviorally identical).
- **M-3 Socket listener cleanup**: provider tracks and removes all its listeners; `connect_error` handled.
- **M-4 Helmet CSP** policy set (inert for the JSON API, safe if client is ever co-served).
- **M-5 Index hints** on payment aggregates.
- **M-6 Tests**: `server/tests/*` using Node's built-in test runner (23 tests, `npm test`).
- **M-7 OwnerController split** into `controllers/owner/*` (facade re-exports).
- **M-8 AuthService split** into `services/auth/*` (facade re-exports).
- **M-9 Validation errors normalized**: `validate.js` emits flat `fieldErrors` (field→messages) — fixes inline tenant field errors.
- **M-10+M-9? Log sanitization**: morgan format redacts sensitive query params + logs request ID + response time.
- **M-11 React keys**: data-driven maps now use stable keys.
- **M-12 Finance mutation rate limiting** (`financeLimiter`).
- **L-1** unused imports/vars removed across client + server (lint-clean).
- **L-2** stale `lateFee*` validator fields removed.
- **L-3** indent normalized to spaces (already consistent).
- **L-4** `.editorconfig` added.
- **L-5** no functions >200 lines remain (verified by scan).
- **L-6** `utils/constants.js` for lockout/OTP/token/retention magic numbers.
- **L-7** ESLint + Prettier configs for client & server; `npm run lint`/`format`.
- **L-8** husky + lint-staged (pre-commit runs `prettier --write` on staged files; eslint available via `npm run lint`).
- **L-9** response-time logging (morgan `:response-time`).
- **L-10** `/api/health` now reports DB state + uptime.
- **L-11** month names centralized in `utils/date.js` (`getEnglishMonthName`), used by cron + controllers.
- **L-12** frontend error tracking (`utils/errorTracking.js` + ErrorBoundary + global listeners; optional `VITE_ERROR_TRACKING_URL`).
- **L-13** unhandled 500s return generic "Internal Server Error" in production (AppError messages preserved).
- **L-14** request ID middleware (`X-Request-Id` header, logged with errors).
- **L-15** bundle analysis via `rollup-plugin-visualizer` (`npm run analyze`).
- **Bug fix (discovered)**: `ThemeAwareToaster` in `App.jsx` was never rendered, so every `toast.*` call was invisible — now mounted.

### 2026-07-31 — Onboarding fields: Aadhaar, Address, Emergency Contact + global inline error handling
- **Added 3 mandatory fields** to tenant onboarding: Aadhaar Number (12 digits), Address (required), Emergency Contact (10 digits)
- **Frontend validation**: `validateForm()` checks Aadhaar `/^\d{12}$/`, Emergency Contact `/^\d{10}$/`, Address non-empty before submit. Errors shown inline below each field via `FieldError` component.
- **Backend validation**: `tenantCreateSchema` updated with regex patterns for aadhaarNumber and emergencyContact, required for address
- **Tenant model**: Added `address` field, made `email` optional (default `""`) to fix "email required" validation error
- **Global error positioning**: Login.jsx, AdminLogin.jsx — all error messages now appear below the submit button (not above). Backend field validation errors are parsed from Zod `fieldErrors` and mapped to inline fields.
- **Fixed tenant creation bug**: Tenant model had `email: { required: true }` but form treats email as optional. Made email optional with auto-generated placeholder when empty.

### 2026-07-30 — Major refactor: 13 production changes implemented
- **Renamed Resident → Tenant** globally: `ResidentProfile.jsx` → `TenantProfile.jsx`, all UI labels, component names, file references, server messages, and CLAUDE.md updated. Route paths and DB model names preserved.
- **Token expiry 30d** (later reverted): ACCESS_EXPIRY and REFRESH_EXPIRY in `tokens.js` were briefly set to 30d/30d, then restored to **15m access / 30d refresh** by the C-2 audit fix on 2026-07-31.
- **Removed Manager role**: Manager permissions, `ownerScope` middleware, Owner model enum, manager routes/controllers, frontend nav groups, role checks in `App.jsx`/`DashboardLayout.jsx`/`Payments.jsx`/`MealTimings.jsx`/`RoomManagement.jsx` removed. `createManagerSchema` validator removed. Only `owner` + `tenant` roles remain.
- **Admin onboarding replaced**: `/onboarding` route removed, `OwnerOnboarding.jsx` lazy import removed. Created separate `/admin-login` page with Password/OTP toggle. Hardcoded credentials `lsk.edu13@gmail.com` / `Srirama@1234`. Split-screen layout restored. Backend auto-creates admin Owner + default "My Hostel" on first login via `ensureAdminOwner()` and `resolveOwnerHostel()`.
- **Hostel stats cleanup**: Removed occupancy stats (beds, tenants, percentage) from HostelSwitcher dropdown. Retained hostel name, address/city, active indicator.
- **Billing system removed (partial)**: Removed daily midnight billing cron, monthly 1st-of-month billing cron, late fee calculation engine. Kept payment tracking, payment requests, `syncPaymentStatusesOnly`, `createPayment`, `updatePayment` admin functions, and all payment list/totals APIs.
- **Late fee engine cleaned**: Removed `lateFeeGracePeriodDays` and `lateFeeDailyRate` from Hostel model. Removed late fee calculation from cron. Removed `getBillingPeriodsFromJoin`, `ensureTenantRentInvoices`, `syncHostelPaymentStatuses`, `ensureHostelRentInvoices` from paymentService.
- **Monthly fee generation (3rd)**: New cron at `0 0 3 * *` generates monthly rent on 3rd with due date on 8th (3rd + 5-day grace).
- **Missing docs consolidated alert**: Incomplete profile cron now creates ONE consolidated notice per hostel listing all affected tenants instead of individual notices.
- **Data retention confirmed**: Existing `0 1 * * *` cron already cascade-deletes inactive tenants past 10-day `scheduledDeletionDate`. Added `VacateRequest` to cleanup cascade.
- **Food Timings & Menu**: Seeded 21 entries (3 meals × 7 days) exactly matching `Food Timings.docx` and `Menu - SRI RAMA LUXURY MENS PG HOSTEL.docx`. Timings: Breakfast 07:30-09:30, Lunch 12:30-14:30, Dinner 19:30-21:30. Edit button confirmed working in `MealTimings.jsx` — owner hover reveals Edit/Delete, modal with pre-filled fields, saves to DB via `PATCH /owner/meal-timings/:id`.
- **Hostel Rules Popup**: Created `HostelRulesModal.jsx` — mandatory scroll-to-bottom modal shown on tenant login (tracked via `sessionStorage`). Shows 6 hostel rules. Continue button disabled until fully scrolled.
- **Vacate Workflow**: Created `VacateRequest` model, validator schemas, tenant routes (`POST /tenant/vacate-request`, `GET /tenant/vacate-requests`), owner routes (`GET /owner/vacate-requests`, `PATCH /owner/vacate-requests/:id`), controller functions (7-day minimum enforcement, admin approve → triggers tenant eviction flow). Frontend: `TenantVacateRequest.jsx` component in tenant dashboard, `AdminVacateRequests.jsx` page with admin nav link.
- **Login pages split**: Tenant login at `/login`, Admin login at `/admin-login`. Both use original 55/45 split-screen layout with radial gradient background. Admin login offers Password or OTP methods. Tenant login has phone→OTP/password/set-password flow. Admin link removed from tenant page.

### 2026-07-30 — Memory system setup & CLAUDE.md workflow rule
- **Fire-and-forget OTP email** (`77eade3`): Changed `sendOtpEmail` to non-blocking call for serverless compatibility on Render
- **OTP cooldown reduced** (`719bcd9`): 60s → 15s wait between OTP requests
- **Auth persistence fix** (`3a0eb37`): Send `refreshToken` from localStorage on refresh, store new `refreshToken` on token rotation
- **OTP dev mode fix** (`47851c3`): Restore OTP display in dev mode response, log email errors instead of crashing
- **Email revert** (`57edfd9`): Reverted fire-and-forget for `sendOtpEmail` — serverless kills the process before the email sends, needs await
- **Auth cross-tab persistence** (`bc02b46`): Moved from `sessionStorage` → `localStorage` so auth survives tab close
- **Dashboard performance** (`5e73bde`): Added database indexes, made dashboard sync async to avoid blocking
- **Financial system fixes** (`5c1b243`): Payment sync optimization, batch processing, concurrency control
