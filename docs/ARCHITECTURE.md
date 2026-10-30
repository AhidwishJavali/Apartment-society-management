# Architecture, checklist and limitations

## Request flow

```
Browser UI -> Next.js Route Handler -> Zod validation -> Prisma / MySQL
                                                     \-> Mongoose / MongoDB
```

Databases are only ever touched server-side. Every handler is wrapped by `route(roles, handler)` in `src/lib/api.ts`, which authenticates the session cookie (re-reading the account from MySQL, so deactivation applies immediately), checks the role, rejects cross-origin mutations and returns the shared envelope:

```jsonc
{ "data": ..., "meta": { "page": 1, "pageSize": 10, "total": 42, "totalPages": 5 } }   // success
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { "fieldErrors": {} } } } // failure
```

Status codes: 200/201 success, 207 partial success (see below), 400 validation, 401 not signed in, 403 forbidden, 404 not found, 409 conflict (duplicates, double allocation, still-referenced records), 429 too many sign-in attempts, 503 MongoDB unavailable for a Mongo-only write.

## Data model

### MySQL (Prisma)

The seven agreed core tables keep their names and meanings (`@@map` preserves `Apartment`, `Resident`, `Staff`, `ParkingSpace`, `Vehicle`, `MaintenancePayment`, `Complaint`). Changes made on top of the lab baseline (`db/lab_baseline.sql`), all in `prisma/migrations/20261030000000_init`:

| Change | Reason |
| --- | --- |
| New `UserAccount` table (username, email, bcrypt hash, role, optional unique `resident_id` / `staff_id`) | Real authentication and role/ownership checks |
| `created_at` / `updated_at` on every table; `is_active` on Resident, Staff, Vehicle | Timestamps and safe deactivation that preserves history |
| Auto-increment primary keys | CRUD from the UI |
| Unique `(block, flat_no)` on Apartment | No duplicate flats |
| Unique `(apartment_id, payment_month)` on MaintenancePayment | Reject duplicate monthly bills |
| `payment_month` stored as `YYYY-MM` (was `October 2026`) | Sortable and filterable; formatted in the UI |
| `ParkingSpace.apartment_id` nullable | An AVAILABLE slot belongs to no flat |
| Unique `Vehicle.parking_id` | A slot can hold only one vehicle, enforced by the database |
| Indexes on foreign keys and filtered columns (`status`, `role`) | Query performance |
| Seed: unassigned complaints are OPEN (baseline assigned staff to OPEN rows); two extra free parking slots; five extra September bills | Consistent with the lifecycle rules; demonstrates allocation and history |

`DECIMAL(10,2)` is used for all money. Multi-row operations (parking allocate/release, resident/staff deactivation, vehicle registration with a slot) run in Prisma transactions.

### MongoDB (Mongoose)

MongoDB holds event-like documents only and references relational rows by integer ID. Nothing from Apartment/Resident/Staff/Payment is copied.

| Collection | Notes |
| --- | --- |
| `visitors` | index `apartmentId + entryTime`; exit updates the same document (`status` INSIDE to EXITED) |
| `notices` | notices and announcements in one collection via `documentType`; index `publishedAt`; lifecycle DRAFT, PUBLISHED, ARCHIVED, optional `expiresAt` |
| `complaint_activity` | append-only (API only inserts); index `complaintId + createdAt` |
| `feedback` | resident submissions; admin review status and note |

Timestamps are stored in UTC and displayed in the viewer's local time.

## Key rules

- **Complaint lifecycle:** resident creates (OPEN) - admin assigns (IN_PROGRESS) - assigned staff resolves (RESOLVED). Admins may also reopen. Direct OPEN to RESOLVED is rejected; status changes need an assigned staff member; updates are guarded against concurrent changes. Allowed transitions live in `src/lib/rules.ts`.
- **Cross-database consistency:** a complaint is written to MySQL first, then an activity document is appended to MongoDB. If the Mongo write fails the API answers **207** with a `PARTIAL_FAILURE` error and the UI shows a warning - it never reports full success. There is no distributed transaction, so the MySQL change stays committed.
- **Payments:** PAID requires a payment date, PENDING must not have one; duplicate apartment/month bills return 409; totals come from MySQL `groupBy`.
- **Parking:** allocation checks vehicle/slot type, active vehicle, slot availability (conditional update) and uses the unique `Vehicle.parking_id`, so racing requests cannot double-allocate. Release detaches the vehicle in the same transaction.
- **Deletion:** apartments/residents/staff with dependent history cannot be deleted (409); residents, staff and vehicles are deactivated instead, which also locks the linked account.
- **Notices:** residents/staff only get PUBLISHED, unexpired notices addressed to ALL or their own audience (OWNERS / TENANTS / MAINTENANCE / SECURITY).

## Feature checklist

| Module | Status |
| --- | --- |
| Login, logout, session, role-aware redirect | Implemented |
| Dashboard with live, role-specific counts | Implemented |
| Apartments (search, CRUD, linked residents, payment summary) | Implemented |
| Residents (search/filter, CRUD, owner/tenant, deactivate) | Implemented |
| Staff (list, CRUD, deactivate) | Implemented |
| Payments (monthly bills, paid/pending filters, mark paid, totals) | Implemented |
| Parking (slots, filters, allocate, release) | Implemented |
| Vehicles (register, update, deactivate/reactivate, slot association) | Implemented |
| Complaints (submit, filter, assign, status, notes, activity timeline) | Implemented |
| Visitors (entry, exit, search by flat/date/name) | Implemented |
| Notices (create, publish, edit, archive, audience, expiry) | Implemented |
| Feedback (resident submit, admin review) | Implemented |
| Account management (create, activate/deactivate, reset password) | Implemented |
| Idempotent seeds + guarded reset for both databases | Implemented |
| Loading, empty, error and success states; confirm before destructive actions; pagination | Implemented |

## Verification status

Run on the development machine **without MySQL or MongoDB available**:

| Check | Result |
| --- | --- |
| `npm run lint` | passes |
| `npm run typecheck` | passes |
| `npm run build` | passes |
| `npm test` | 21 unit tests pass (transitions, audiences, payment rules, schemas, session tokens, env validation) |

**Not yet run against live databases:** the migration, seed, and every API workflow (payments, parking, complaints, visitors, notices, feedback, permissions) were written but not exercised end-to-end. Run `npm run db:setup` and walk through the acceptance list below on a machine with MySQL and MongoDB, and fix anything that turns up.

### Acceptance walkthrough

1. Fresh clone: install, configure env, `npm run db:setup`, `npm run dev`.
2. Every core MySQL table has at least 10 rows; re-running `npm run db:seed` adds nothing.
3. As admin, create a bill for an apartment/month that already has one: expect a 409.
4. Allocate a BIKE to a CAR slot and an already-allocated slot: both rejected.
5. As resident file a complaint; as admin assign it; as maintenance resolve it; as resident see the timeline.
6. As security register a visit, then record the exit; a second exit is rejected.
7. As resident try `GET /api/payments?apartmentId=5` (another flat): you still only get your own flat's data. As security call `/api/payments`: 403.

## Known limitations

- Academic demo: no payment gateway, no email/SMS, no chat or push notifications, no biometric or hardware integration, no AI features.
- Sessions are stateless JWT cookies: logout clears the cookie but cannot revoke a stolen token before it expires (8 hours). Deactivating an account does block it immediately because the account is re-checked on every request.
- Login throttling is in-memory per server process.
- Select boxes load up to 200 options (apartments, residents, staff); larger societies would need searchable pickers.
- Cross-database writes are not atomic (see Key rules).
- "Visitors today" uses the server's local midnight.
- Not claimed to meet any production security or compliance standard.
