# Apartment Society Management System

A full-stack web application for running an apartment society: flats and residents, monthly maintenance payments, parking and vehicles, staff, complaints, visitors, notices and feedback.

| Layer | Technology |
| --- | --- |
| Frontend + API | Next.js 15 (App Router), TypeScript, Tailwind CSS, Route Handlers |
| Relational data | MySQL 8 via Prisma ORM |
| Document data | MongoDB via Mongoose |
| Validation | Zod (request bodies, query strings, environment variables) |
| Auth | Username/email + password, bcrypt hashes, signed httpOnly session cookie, role **and** record-ownership checks on every API route |

> Academic demonstration project. It is not a production security, accounting or compliance platform.

## Contents

1. [Project status and what is left](#1-project-status-and-what-is-left)
2. [Quick start](#2-quick-start)
3. [Demo accounts and roles](#3-demo-accounts-and-roles)
4. [MySQL: schema, SQL and queries](#4-mysql-schema-sql-and-queries)
5. [MongoDB: collections, documents and queries](#5-mongodb-collections-documents-and-queries)
6. [How the two databases work together](#6-how-the-two-databases-work-together)
7. [API reference](#7-api-reference)
8. [Scripts and repository layout](#8-scripts-and-repository-layout)
9. [Known limitations](#9-known-limitations)

---

## 1. Project status and what is left

### Mapping to the "Task remaining for next phase" list

The original proposal ([docs/Project_Proposal_and_Further_Plan.docx](docs/Project_Proposal_and_Further_Plan.docx)) ended with a list of remaining work. This is where each item stands:

| Planned item | Status |
| --- | --- |
| MongoDB collections for visitors, notices, feedback and activity logs | Built (Mongoose models, indexes, seed data) |
| Develop the Next.js frontend | Built (one page per module, responsive, loading/empty/error states) |
| Connect the frontend to MySQL and MongoDB | Built (all data goes through server-side API routes) |
| CRUD for apartments, residents, payments, parking, vehicles, staff, complaints | Built |
| Complaint assignment and status tracking | Built (with MongoDB activity timeline) |
| Maintenance-payment tracking | Built (paid/pending, totals, mark paid, duplicate-bill guard) |
| Parking and vehicle management | Built (allocate/release, type compatibility, no double allocation) |
| Search / filter | Built (search box, filters and pagination on every list) |
| Test database operations and relationships | **Partly done**: unit tests pass; live-database testing is still to do (see below) |
| Integrate all modules into the final system | Built; needs the end-to-end run below |

### Verification so far

| Check | Result |
| --- | --- |
| `npm run lint` | passes |
| `npm run typecheck` | passes |
| `npm run build` | passes |
| `npm test` | 21 unit tests pass (status transitions, audience rules, payment rules, validation schemas, session tokens, env validation) |

### What is left

These are the honest gaps. The first one matters most.

1. **Run everything against live MySQL and MongoDB.** The code was written and compiled on a machine with neither database installed, so the migration, the seed script and every API workflow have **never been executed end to end**. Follow [Quick start](#2-quick-start), then the [acceptance walkthrough](#acceptance-walkthrough), and fix whatever turns up.
2. **Compare the schema with the team's ER diagram.** The implementation guide says to stop and report any conflict with the ER diagram. That diagram was not in the repository, so the schema was built from the lab script (`db/lab_baseline.sql`) and the guide. Every deliberate change is listed in [Changes from the lab baseline](#changes-from-the-lab-baseline).
3. **Automated integration tests.** There are no tests that hit a real database. Worth adding: duplicate monthly bill (409), parking double allocation under concurrency, complaint lifecycle, permission denials per role.
4. **Small UI gaps.**
   - The visitor entry form does not offer the optional "host resident" field the API already supports.
   - Dropdowns load at most 200 options; a very large society would need searchable pickers.
   - No charts (they were optional in the guide).
5. **Optional hardening.** Session revocation on logout, persistent (Redis/DB) login throttling, CI workflow running `npm run check`.

---

## 2. Quick start

### Prerequisites

- Node.js 20.12 or newer (22 recommended) and npm
- MySQL 8.x
- MongoDB 6 or newer

No local databases? `docker compose up -d` starts both with credentials matching `.env.example`.

### Setup

```bash
git clone https://github.com/AhidwishJavali/Apartment-society-management.git
cd Apartment-society-management
npm install
```

**1. Create the MySQL database and user** (skip when using Docker):

```sql
CREATE DATABASE apartment_society CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'society_user'@'localhost' IDENTIFIED BY 'change_me';
GRANT ALL PRIVILEGES ON apartment_society.* TO 'society_user'@'localhost';
```

**2. Configure environment variables.** Copy `.env.example` to **both** `.env.local` (Next.js and the seed scripts) and `.env` (the Prisma CLI):

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | e.g. `mysql://society_user:change_me@localhost:3306/apartment_society` |
| `MONGODB_URI` | e.g. `mongodb://localhost:27017/apartment_society` |
| `SESSION_SECRET` | Random string, at least 32 characters (`openssl rand -base64 48`) |

`.env`, `.env.local` and `.demo-credentials.local` are git-ignored. Never commit real secrets.

**3. Migrate, create Mongo indexes and seed:**

```bash
npm run db:setup
```

That runs three steps which you can also run separately:

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Applies the versioned MySQL migration(s) in `prisma/migrations` |
| `npm run db:indexes` | Creates MongoDB collections and indexes |
| `npm run db:seed` | Inserts demo data. Safe to re-run: it never creates duplicates |

**4. Note the demo passwords.** The seed generates a random password per demo account, prints it once and writes it to `.demo-credentials.local`.

**5. Run the app:**

```bash
npm run dev          # http://localhost:3000
```

Production build: `npm run build && npm start`.

### Resetting demo data

```bash
npm run db:reset
```

> **Warning: this deletes ALL data in every table and collection used by this app (MySQL and MongoDB), then re-seeds and generates new demo passwords.** You must type `reset` to confirm (`npm run db:reset -- --yes` skips the prompt).

### Acceptance walkthrough

1. Fresh clone: install, set env, `npm run db:setup`, `npm run dev`.
2. Every core table has at least 10 rows ([counts](#seed-data)); running `npm run db:seed` again adds nothing.
3. As **admin**, create a bill for an apartment and month that already has one: expect a 409 "already exists" error.
4. Try to allocate a bike to a car slot, and an already-allocated slot: both are rejected.
5. As **resident** file a complaint; as **admin** assign it; as **maintenance** resolve it; as **resident** open the complaint and check the timeline.
6. As **security** register a visitor, record the exit, then try to record it again: the second attempt is rejected.
7. As **security** open `/api/payments` in the browser: 403. As **resident** you only ever see your own flat's payments, whatever filters you try.

---

## 3. Demo accounts and roles

| Username | Role | Linked record | Lands on |
| --- | --- | --- | --- |
| `admin` | Administrator | standalone | Dashboard |
| `resident` | Resident | Arjun Rao, flat A-101 | Dashboard |
| `maintenance` | Maintenance staff | Suresh Kumar (Electrician) | Complaints |
| `security` | Security | Mahesh Rao (Security Guard) | Visitors |

Passwords come from the seed output / `.demo-credentials.local`. Admins can create accounts and reset passwords on the **Accounts** page.

| Role | What they can do |
| --- | --- |
| Administrator | Everything: apartments, residents, staff, payments, parking, vehicles, complaints (assign, change status), visitors, notices, feedback review, accounts |
| Resident | Own profile and flat; own flat's payment history and pending balance; own flat's parking and vehicles; create and track own complaints; read notices for their audience; submit feedback |
| Maintenance | See complaints assigned to them; mark In progress work Resolved; add work notes; read notices |
| Security | Register visitor entry and exit; search visitor history; read notices. **No payment access** |

Hiding a button is never the authorization. Every API route checks the session, the role and, where relevant, record ownership on the server.

---

## 4. MySQL: schema, SQL and queries

### Entity relationships

```
Apartment 1 ──< Resident 1 ──< Vehicle >── 0..1 ParkingSpace >──0..1 Apartment
    │                │
    │                └──< Complaint >── 0..1 Staff
    └──< MaintenancePayment             (unique per apartment + month)

UserAccount ── 0..1 Resident   (role RESIDENT)
UserAccount ── 0..1 Staff      (role MAINTENANCE / SECURITY)
UserAccount ── standalone      (role ADMIN)
```

| Table | Purpose |
| --- | --- |
| `Apartment` | One row per flat; parent of Resident, ParkingSpace, MaintenancePayment |
| `Resident` | Resident profile, OWNER or TENANT, belongs to one apartment |
| `Staff` | Staff profile, role, contact, salary |
| `ParkingSpace` | A parking slot; optionally allocated to an apartment |
| `Vehicle` | Belongs to a resident; may hold one parking slot |
| `MaintenancePayment` | One monthly bill per apartment; PAID or PENDING |
| `Complaint` | Raised by a resident; optionally assigned to staff; OPEN / IN_PROGRESS / RESOLVED |
| `UserAccount` | Sign-in account (new): links to a resident or staff row; admins are standalone |

### Changes from the lab baseline

The original lab script is kept in [db/lab_baseline.sql](db/lab_baseline.sql). The seven core tables keep their names and meanings. Everything below was added or adapted deliberately:

| Change | Why |
| --- | --- |
| New `UserAccount` table | Real authentication and role/ownership checks |
| `created_at` / `updated_at` on every table; `is_active` on Resident, Staff, Vehicle | Timestamps, and deactivation instead of deleting history |
| Auto-increment primary keys | CRUD from the UI |
| Unique `(block, flat_no)` on Apartment | No duplicate flats |
| Unique `(apartment_id, payment_month)` on MaintenancePayment | Reject duplicate monthly bills |
| `payment_month` stored as `YYYY-MM` (baseline: `October 2026`) | Sortable and filterable; the UI formats it for display |
| `ParkingSpace.apartment_id` nullable | A free slot belongs to no flat |
| Unique `Vehicle.parking_id` | The database itself prevents two vehicles on one slot |
| Indexes on foreign keys and filtered columns | Query performance |
| `Resident`/`Staff` phone and email stay unique but nullable | Optional contact details |
| Seed data: unassigned complaints are OPEN; two extra free slots; five extra September bills | Baseline had OPEN complaints already assigned to staff, which the lifecycle forbids |

### The actual DDL

This is the exact SQL applied by `npm run db:migrate` (file: [prisma/migrations/20261030000000_init/migration.sql](prisma/migrations/20261030000000_init/migration.sql)). Money uses `DECIMAL`, never `FLOAT`.

```sql
CREATE TABLE `Apartment` (
    `apartment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `block` VARCHAR(10) NOT NULL,
    `floor_no` INTEGER NOT NULL,
    `flat_no` VARCHAR(10) NOT NULL,
    `bhk` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Apartment_block_flat_no_key`(`block`, `flat_no`),
    PRIMARY KEY (`apartment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Resident` (
    `resident_id` INTEGER NOT NULL AUTO_INCREMENT,
    `apartment_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(15) NULL,
    `email` VARCHAR(100) NULL,
    `resident_type` ENUM('OWNER', 'TENANT') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Resident_phone_key`(`phone`),
    UNIQUE INDEX `Resident_email_key`(`email`),
    INDEX `Resident_apartment_id_idx`(`apartment_id`),
    PRIMARY KEY (`resident_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Staff` (
    `staff_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `phone` VARCHAR(15) NULL,
    `salary` DECIMAL(10, 2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Staff_phone_key`(`phone`),
    INDEX `Staff_role_idx`(`role`),
    PRIMARY KEY (`staff_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ParkingSpace` (
    `parking_id` INTEGER NOT NULL AUTO_INCREMENT,
    `apartment_id` INTEGER NULL,
    `slot_number` VARCHAR(10) NOT NULL,
    `vehicle_type` ENUM('CAR', 'BIKE') NOT NULL,
    `status` ENUM('ALLOCATED', 'AVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ParkingSpace_slot_number_key`(`slot_number`),
    INDEX `ParkingSpace_apartment_id_idx`(`apartment_id`),
    INDEX `ParkingSpace_status_idx`(`status`),
    PRIMARY KEY (`parking_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Vehicle` (
    `vehicle_id` INTEGER NOT NULL AUTO_INCREMENT,
    `resident_id` INTEGER NOT NULL,
    `parking_id` INTEGER NULL,
    `vehicle_number` VARCHAR(20) NOT NULL,
    `vehicle_type` ENUM('CAR', 'BIKE') NOT NULL,
    `brand` VARCHAR(50) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vehicle_parking_id_key`(`parking_id`),
    UNIQUE INDEX `Vehicle_vehicle_number_key`(`vehicle_number`),
    INDEX `Vehicle_resident_id_idx`(`resident_id`),
    PRIMARY KEY (`vehicle_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MaintenancePayment` (
    `payment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `apartment_id` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `payment_month` VARCHAR(20) NOT NULL,
    `payment_date` DATE NULL,
    `status` ENUM('PAID', 'PENDING') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `MaintenancePayment_status_idx`(`status`),
    UNIQUE INDEX `MaintenancePayment_apartment_id_payment_month_key`(`apartment_id`, `payment_month`),
    PRIMARY KEY (`payment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Complaint` (
    `complaint_id` INTEGER NOT NULL AUTO_INCREMENT,
    `resident_id` INTEGER NOT NULL,
    `staff_id` INTEGER NULL,
    `category` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    `complaint_date` DATE NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Complaint_resident_id_idx`(`resident_id`),
    INDEX `Complaint_staff_id_idx`(`staff_id`),
    INDEX `Complaint_status_idx`(`status`),
    PRIMARY KEY (`complaint_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserAccount` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(100) NOT NULL,          -- bcrypt hash only, never the password
    `role` ENUM('ADMIN', 'RESIDENT', 'MAINTENANCE', 'SECURITY') NOT NULL,
    `resident_id` INTEGER NULL,
    `staff_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserAccount_username_key`(`username`),
    UNIQUE INDEX `UserAccount_email_key`(`email`),
    UNIQUE INDEX `UserAccount_resident_id_key`(`resident_id`),
    UNIQUE INDEX `UserAccount_staff_id_key`(`staff_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Resident` ADD CONSTRAINT `Resident_apartment_id_fkey` FOREIGN KEY (`apartment_id`) REFERENCES `Apartment`(`apartment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ParkingSpace` ADD CONSTRAINT `ParkingSpace_apartment_id_fkey` FOREIGN KEY (`apartment_id`) REFERENCES `Apartment`(`apartment_id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_resident_id_fkey` FOREIGN KEY (`resident_id`) REFERENCES `Resident`(`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_parking_id_fkey` FOREIGN KEY (`parking_id`) REFERENCES `ParkingSpace`(`parking_id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MaintenancePayment` ADD CONSTRAINT `MaintenancePayment_apartment_id_fkey` FOREIGN KEY (`apartment_id`) REFERENCES `Apartment`(`apartment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_resident_id_fkey` FOREIGN KEY (`resident_id`) REFERENCES `Resident`(`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `Staff`(`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `UserAccount` ADD CONSTRAINT `UserAccount_resident_id_fkey` FOREIGN KEY (`resident_id`) REFERENCES `Resident`(`resident_id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `UserAccount` ADD CONSTRAINT `UserAccount_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `Staff`(`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

The `prisma/schema.prisma` file is the source of truth; edit it and run `npm run db:migrate:dev` to create a new migration.

### Rules enforced in MySQL vs. in code

| Rule | Where |
| --- | --- |
| One flat per `(block, flat_no)`; one bill per `(apartment, month)`; unique phone, email, slot number, vehicle number | Unique indexes |
| A slot holds at most one vehicle | Unique `Vehicle.parking_id` |
| Apartment/resident/payment history cannot be orphaned | Foreign keys with `ON DELETE RESTRICT` |
| Vehicle type must match slot type; slot must be `AVAILABLE` to allocate | API (transaction + conditional update) |
| `PAID` needs a payment date, `PENDING` must not have one | API validation |
| Complaint status transitions (`OPEN` → `IN_PROGRESS` → `RESOLVED`, reopen by admin) | API (`src/lib/rules.ts`) |
| Residents with history are deactivated, not deleted | API (409 on delete) |

### Seed data

`npm run db:seed` loads fictional data, adapted from the lab script (same ten flats, residents, staff, vehicles and complaints):

| Table | Rows |
| --- | --- |
| Apartment | 10 |
| Resident | 10 |
| Staff | 10 |
| ParkingSpace | 12 (10 allocated, 2 free) |
| Vehicle | 10 |
| MaintenancePayment | 15 (10 for 2026-10, 5 for 2026-09) |
| Complaint | 10 (3 OPEN, 3 IN_PROGRESS, 4 RESOLVED) |
| UserAccount | 4 |

### Handy SQL

Verification queries (from the original lab script, still valid):

```sql
SHOW TABLES;

SELECT 'Apartment' AS table_name, COUNT(*) AS record_count FROM Apartment
UNION ALL SELECT 'Resident', COUNT(*) FROM Resident
UNION ALL SELECT 'Staff', COUNT(*) FROM Staff
UNION ALL SELECT 'ParkingSpace', COUNT(*) FROM ParkingSpace
UNION ALL SELECT 'Vehicle', COUNT(*) FROM Vehicle
UNION ALL SELECT 'MaintenancePayment', COUNT(*) FROM MaintenancePayment
UNION ALL SELECT 'Complaint', COUNT(*) FROM Complaint
UNION ALL SELECT 'UserAccount', COUNT(*) FROM UserAccount;
```

Useful reporting queries:

```sql
-- Pending maintenance with the flat and the resident to chase
SELECT a.block, a.flat_no, p.payment_month, p.amount, r.name AS resident, r.phone
FROM MaintenancePayment p
JOIN Apartment a ON a.apartment_id = p.apartment_id
LEFT JOIN Resident r ON r.apartment_id = a.apartment_id AND r.is_active = TRUE
WHERE p.status = 'PENDING'
ORDER BY a.block, a.flat_no;

-- Collected vs pending per month
SELECT payment_month,
       SUM(CASE WHEN status = 'PAID'    THEN amount ELSE 0 END) AS collected,
       SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) AS pending
FROM MaintenancePayment
GROUP BY payment_month
ORDER BY payment_month DESC;

-- Open / in-progress complaints with who is handling them
SELECT c.complaint_id, c.category, c.description, c.status, r.name AS raised_by, s.name AS assigned_to
FROM Complaint c
JOIN Resident r ON r.resident_id = c.resident_id
LEFT JOIN Staff s ON s.staff_id = c.staff_id
WHERE c.status <> 'RESOLVED'
ORDER BY c.complaint_date;

-- Workload per staff member
SELECT s.name, s.role, COUNT(c.complaint_id) AS active_complaints
FROM Staff s
LEFT JOIN Complaint c ON c.staff_id = s.staff_id AND c.status = 'IN_PROGRESS'
GROUP BY s.staff_id, s.name, s.role
ORDER BY active_complaints DESC;

-- Free parking slots by type
SELECT vehicle_type, COUNT(*) AS free_slots
FROM ParkingSpace
WHERE status = 'AVAILABLE'
GROUP BY vehicle_type;

-- Vehicles with their owners and slots
SELECT v.vehicle_number, v.vehicle_type, r.name AS owner, a.block, a.flat_no, ps.slot_number
FROM Vehicle v
JOIN Resident r ON r.resident_id = v.resident_id
JOIN Apartment a ON a.apartment_id = r.apartment_id
LEFT JOIN ParkingSpace ps ON ps.parking_id = v.parking_id
WHERE v.is_active = TRUE;

-- Consistency check: allocated slots with no vehicle (should return 0 rows)
SELECT ps.* FROM ParkingSpace ps
LEFT JOIN Vehicle v ON v.parking_id = ps.parking_id
WHERE ps.status = 'ALLOCATED' AND v.vehicle_id IS NULL;
```

---

## 5. MongoDB: collections, documents and queries

MongoDB stores flexible, event-like documents. It is **not** a copy of the MySQL data: documents reference relational rows only by their integer IDs (`apartmentId`, `residentId`, `complaintId`, `userId`), and nothing from Apartment, Resident, Staff or Payment is duplicated. All timestamps are stored in UTC and shown in local time by the UI.

Models: [src/models/index.ts](src/models/index.ts). Indexes are created by `npm run db:indexes`.

| Collection | Purpose | Indexes |
| --- | --- | --- |
| `visitors` | Visitor entry/exit log | `{ apartmentId: 1, entryTime: -1 }`, `{ status: 1, entryTime: -1 }` |
| `notices` | Notices **and** announcements (`documentType`) | `{ publishedAt: -1 }`, `{ status: 1, audience: 1 }` |
| `complaint_activity` | Append-only complaint timeline | `{ complaintId: 1, createdAt: 1 }` |
| `feedback` | Resident feedback and admin review | `{ residentId: 1, submittedAt: -1 }`, `{ status: 1, submittedAt: -1 }` |

### `visitors`

| Field | Type | Notes |
| --- | --- | --- |
| `visitorName` | string | required |
| `phone` | string | optional |
| `purpose` | string | required |
| `apartmentId` | number | MySQL `Apartment.apartment_id` |
| `hostResidentId` | number | optional; must live in that apartment |
| `vehicleNumber` | string | optional, normalized |
| `entryTime` | date | set by the server |
| `exitTime` | date | set when the exit is recorded |
| `recordedByUserId` | number | MySQL `UserAccount.user_id` of the logged-in security/admin account, taken from the session |
| `status` | `INSIDE` \| `EXITED` | exit flips this on the same document |

```json
{
  "visitorName": "Anil Verma",
  "phone": "9845000000",
  "purpose": "Family visit",
  "apartmentId": 1,
  "hostResidentId": 1,
  "vehicleNumber": "KA51ZZ1000",
  "entryTime": "2026-10-20T10:00:00Z",
  "exitTime": "2026-10-20T12:00:00Z",
  "recordedByUserId": 4,
  "status": "EXITED"
}
```

### `notices`

| Field | Type | Notes |
| --- | --- | --- |
| `documentType` | `NOTICE` \| `ANNOUNCEMENT` | announcements share this collection |
| `title`, `body`, `category` | string | |
| `priority` | `LOW` \| `NORMAL` \| `HIGH` | |
| `audience` | `ALL` \| `OWNERS` \| `TENANTS` \| `MAINTENANCE` \| `SECURITY` | who can read it |
| `status` | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` | non-admins only see PUBLISHED |
| `publishedAt`, `expiresAt` | date | expired notices are hidden from non-admins |
| `createdByUserId` | number | admin account id |
| `createdAt`, `updatedAt` | date | added by Mongoose |

```json
{
  "documentType": "NOTICE",
  "title": "Water tank cleaning",
  "body": "Water supply will be off 10am-2pm on Sunday for tank cleaning.",
  "category": "Maintenance",
  "priority": "HIGH",
  "audience": "ALL",
  "status": "PUBLISHED",
  "publishedAt": "2026-10-05T09:00:00Z",
  "createdByUserId": 1
}
```

### `complaint_activity` (append-only)

The API only ever inserts into this collection; it never updates or deletes.

| Field | Type | Notes |
| --- | --- | --- |
| `complaintId` | number | MySQL `Complaint.complaint_id` |
| `actorUserId`, `actorRole`, `actorName` | number / string | who did it |
| `action` | `CREATED` \| `ASSIGNED` \| `STATUS_CHANGED` \| `NOTE` | |
| `oldStatus`, `newStatus` | string | for status-related events |
| `note` | string | description, assignment note or work note |
| `createdAt` | date | UTC |

```json
{
  "complaintId": 2,
  "actorUserId": 1,
  "actorRole": "ADMIN",
  "action": "ASSIGNED",
  "oldStatus": "OPEN",
  "newStatus": "IN_PROGRESS",
  "note": "Assigned to Ramesh Babu (Plumber)",
  "createdAt": "2026-10-02T09:30:00Z"
}
```

### `feedback`

| Field | Type | Notes |
| --- | --- | --- |
| `residentId`, `apartmentId` | number | taken from the session, never from the request |
| `category`, `message` | string | |
| `rating` | number 1 to 5 | |
| `submittedAt` | date | |
| `status` | `NEW` \| `REVIEWED` \| `RESOLVED` | updated by admin |
| `adminNote` | string | optional internal note |

```json
{
  "residentId": 7,
  "apartmentId": 7,
  "category": "Amenities",
  "rating": 3,
  "message": "Clubhouse timings could be extended.",
  "submittedAt": "2026-10-16T15:00:00Z",
  "status": "NEW"
}
```

### Seed data

| Collection | Documents |
| --- | --- |
| `complaint_activity` | 21 (a CREATED event for each of the 10 complaints, ASSIGNED for the 7 assigned ones, STATUS_CHANGED for the 4 resolved ones) |
| `visitors` | 10 (8 exited, 2 still inside) |
| `notices` | 10 (8 published across audiences, 1 archived, 1 draft; one published notice is already expired to demonstrate filtering) |
| `feedback` | 10 |

The seed only fills a collection when it is empty, so re-running it never duplicates documents.

### Handy `mongosh` queries

```javascript
use apartment_society

// Collections and indexes
show collections
db.visitors.getIndexes()
db.complaint_activity.getIndexes()

// Document counts
db.visitors.countDocuments()
db.notices.countDocuments()
db.complaint_activity.countDocuments()
db.feedback.countDocuments()

// Who is inside the premises right now
db.visitors.find({ status: "INSIDE" }).sort({ entryTime: -1 })

// Visitor history for flat 1 in a date range
db.visitors.find({
  apartmentId: 1,
  entryTime: { $gte: ISODate("2026-10-01"), $lt: ISODate("2026-11-01") }
}).sort({ entryTime: -1 })

// Visitors per day
db.visitors.aggregate([
  { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryTime" } }, count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])

// Full timeline of complaint 2, oldest first
db.complaint_activity.find({ complaintId: 2 }).sort({ createdAt: 1 })

// Notices a tenant should currently see
db.notices.find({
  status: "PUBLISHED",
  audience: { $in: ["ALL", "TENANTS"] },
  $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }]
}).sort({ publishedAt: -1 })

// Average rating by category and unreviewed feedback
db.feedback.aggregate([{ $group: { _id: "$category", avgRating: { $avg: "$rating" }, n: { $sum: 1 } } }])
db.feedback.find({ status: "NEW" })
```

---

## 6. How the two databases work together

- **Request flow:** Browser → Next.js Route Handler → Zod validation → Prisma/MySQL and/or Mongoose/MongoDB. The browser never talks to a database.
- **Ownership of data:** MySQL holds the records of truth (flats, people, money, complaints). MongoDB holds events and documents that point at them by ID.
- **Complaints:** the complaint row is written in MySQL first; then an activity document is appended in MongoDB.
- **Partial failure:** if the MySQL write succeeds but the MongoDB write fails, the API answers **HTTP 207** with a `PARTIAL_FAILURE` error and the UI shows a warning. It never claims both succeeded. There is no distributed transaction, so the MySQL change stays committed and the timeline may miss that event. Work notes live only in MongoDB, so a failed note write is a plain 503 error.
- **Visitor, notice and feedback names:** Mongo documents store IDs only, so the API looks up flat labels and resident names in MySQL when listing.

---

## 7. API reference

All responses use one envelope: `{ "data": ..., "meta": { page, pageSize, total, totalPages } }` on success and `{ "error": { "code", "message", "details" } }` on failure. Lists accept `page`, `pageSize` (max 200) and `q`.

Status codes: 200/201 success, 207 partial success, 400 validation, 401 not signed in, 403 forbidden, 404 not found, 409 conflict, 429 too many sign-in attempts, 500/503 server or database problem.

| Resource | Endpoints | Who |
| --- | --- | --- |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` | public / any signed-in |
| Apartments | `GET /api/apartments`, `POST`, `GET/PATCH/DELETE /api/apartments/:id` | admin (residents: own flat read; security: list read) |
| Residents | `GET /api/residents`, `POST`, `GET/PATCH/DELETE /api/residents/:id` | admin (residents: own profile read) |
| Staff | `GET /api/staff`, `POST`, `GET/PATCH/DELETE /api/staff/:id` | admin |
| Payments | `GET /api/payments`, `POST`, `GET/PATCH /api/payments/:id`, `GET /api/payments/summary` | admin (residents: own flat read) |
| Parking | `GET /api/parking`, `POST`, `GET/PATCH/DELETE /api/parking/:id` (PATCH actions: `allocate`, `release`, `update`) | admin (residents: own flat read) |
| Vehicles | `GET /api/vehicles`, `POST`, `GET/PATCH/DELETE /api/vehicles/:id` (DELETE deactivates) | admin (residents: own flat read) |
| Complaints | `GET /api/complaints`, `POST`, `GET/PATCH /api/complaints/:id` (PATCH actions: `assign`, `status`), `POST /api/complaints/:id/activity` | scoped by role and ownership |
| Visitors | `GET /api/visitors`, `POST`, `PATCH /api/visitors/:id` (`{ "action": "exit" }`) | security, admin |
| Notices | `GET /api/notices`, `POST`, `PATCH /api/notices/:id` (actions `publish`, `archive`) | admin write; everyone reads what is meant for them |
| Feedback | `GET /api/feedback`, `POST`, `PATCH /api/feedback/:id` | residents submit and see their own; admin reviews |
| Accounts | `GET /api/accounts`, `POST`, `PATCH /api/accounts/:id` | admin |
| Dashboard | `GET /api/dashboard` | any signed-in role (numbers differ by role) |

---

## 8. Scripts and repository layout

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Run the Next.js app |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run check` | lint + typecheck + tests + production build |
| `npm run db:setup` | migrate + Mongo indexes + seed |
| `npm run db:migrate` | Apply MySQL migrations |
| `npm run db:migrate:dev` | Create a new migration after editing the Prisma schema |
| `npm run db:indexes` | Create MongoDB collections and indexes |
| `npm run db:seed` | Idempotent demo data |
| `npm run db:reset` | **Delete everything** and re-seed (asks first) |

```
prisma/             schema.prisma and versioned MySQL migrations
scripts/            seed / reset and MongoDB index scripts
src/app/(auth)      login page
src/app/(dashboard) one page per module
src/app/api/        Route Handlers, one folder per resource
src/components/     UI kit, generic list and form components, app shell
src/lib/            env, auth/session, API helpers, Zod schemas, pure business rules
src/models/         Mongoose models and indexes
src/server/         server-only helpers (parking transactions, complaint loading, activity log)
tests/              unit tests
db/lab_baseline.sql original seven-table lab script (reference only)
docs/               implementation guide, project proposal, architecture notes
```

More design detail and the feature checklist: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 9. Known limitations

- Academic demo: no payment gateway, no email/SMS, no chat, no biometric or hardware integration, no AI features.
- Sessions are stateless JWT cookies lasting 8 hours. Logout clears the cookie but cannot revoke a stolen token. Deactivating an account does take effect immediately because the account is re-checked on every request.
- Login throttling is in memory per server process.
- Dropdowns load at most 200 options.
- Writes that touch both databases are not atomic (see section 6).
- "Visitors today" uses the server's local midnight.
- Not claimed to meet any production security or compliance standard.
