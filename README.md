# Apartment Society Management System

A full-stack web application for running an apartment society: flats and residents, monthly maintenance payments, parking and vehicles, staff, complaints, visitors, notices and feedback.

- **Frontend / API:** Next.js 15 (App Router) + TypeScript + Tailwind CSS, API via Route Handlers
- **Relational data:** MySQL 8 via Prisma (the seven lab tables plus a `UserAccount` table for sign-in)
- **Document data:** MongoDB via Mongoose (visitors, notices/announcements, complaint activity history, feedback)
- **Validation:** Zod for request bodies, query strings and environment variables
- **Auth:** real username/email + password sign-in, bcrypt hashes, signed httpOnly session cookie, role **and** ownership checks in every API route

> Academic demonstration project - not a production security or accounting platform. See [Known limitations](docs/ARCHITECTURE.md#known-limitations).

## Prerequisites

- Node.js 20.12+ (22 recommended) and npm
- MySQL 8.x running locally (or `docker compose up -d`, see below)
- MongoDB 6+ running locally

## Setup

```bash
git clone https://github.com/AhidwishJavali/Apartment-society-management.git
cd Apartment-society-management
npm install
```

1. **Create the MySQL database and a user** (skip if you use `docker compose up -d`):

   ```sql
   CREATE DATABASE apartment_society CHARACTER SET utf8mb4;
   CREATE USER 'society_user'@'localhost' IDENTIFIED BY 'change_me';
   GRANT ALL PRIVILEGES ON apartment_society.* TO 'society_user'@'localhost';
   ```

2. **Configure environment variables.** Copy `.env.example` to **both** `.env.local` (used by Next.js and the seed scripts) and `.env` (read by the Prisma CLI), then edit the values:

   | Variable | Meaning |
   | --- | --- |
   | `DATABASE_URL` | MySQL connection string, e.g. `mysql://society_user:change_me@localhost:3306/apartment_society` |
   | `MONGODB_URI` | MongoDB URI, e.g. `mongodb://localhost:27017/apartment_society` |
   | `SESSION_SECRET` | Random string of 32+ characters used to sign session cookies (`openssl rand -base64 48`) |

   `.env`, `.env.local` and `.demo-credentials.local` are git-ignored. Never commit real secrets.

3. **Migrate, create indexes and seed** in one go:

   ```bash
   npm run db:setup
   ```

   This runs the three steps below, which you can also run individually:

   | Command | What it does |
   | --- | --- |
   | `npm run db:migrate` | Applies the versioned MySQL migrations in `prisma/migrations` |
   | `npm run db:indexes` | Creates the MongoDB collections and indexes |
   | `npm run db:seed` | Inserts demo data (safe to re-run; it never creates duplicates) |

4. **Note the demo passwords.** The seed generates a random password for each demo account, prints it once and saves it to `.demo-credentials.local`.

5. **Start the app:**

   ```bash
   npm run dev      # http://localhost:3000
   ```

   For a production build: `npm run build && npm start`.

### Optional: databases via Docker

```bash
docker compose up -d
```

starts MySQL (`society_user` / `change_me`, database `apartment_society`) and MongoDB, matching `.env.example`.

## Demo accounts

| Username | Role | Linked record | Lands on |
| --- | --- | --- | --- |
| `admin` | Administrator | standalone | Dashboard |
| `resident` | Resident | Arjun Rao, flat A-101 | Dashboard |
| `maintenance` | Maintenance staff | Suresh Kumar (Electrician) | Complaints |
| `security` | Security | Mahesh Rao (Security Guard) | Visitors |

Passwords: see the seed output / `.demo-credentials.local`. Admins can create accounts and reset passwords on the **Accounts** page.

### Resetting the demo data

```bash
npm run db:reset
```

**Warning: this deletes all data in every table and collection of this app** (MySQL and MongoDB), then re-seeds and generates new demo passwords. It asks you to type `reset` first (`npm run db:reset -- --yes` skips the prompt).

## What each role can do

| Role | Access |
| --- | --- |
| Administrator | Everything: apartments, residents, staff, payments, parking, vehicles, complaints (assign, status), visitors, notices, feedback review, accounts |
| Resident | Own profile and flat, own flat's payment history and pending balance, own flat's parking and vehicles, create/track own complaints, read notices for their audience, submit feedback |
| Maintenance | Complaints assigned to them: update status (In progress to Resolved) and add work notes; read notices |
| Security | Register visitor entry/exit and search visitor history; read notices. No payment access |

Hiding a button is never the authorization: every API route checks the session, the role and (where relevant) record ownership on the server.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Run the Next.js app |
| `npm run lint` | ESLint (Next.js config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (business rules, validation schemas, session tokens, env validation) |
| `npm run check` | lint + typecheck + tests + production build |
| `npm run db:migrate:dev` | Create a new migration after editing `prisma/schema.prisma` |

## Repository layout

```
prisma/             schema.prisma and versioned MySQL migrations
scripts/            seed, reset and MongoDB index scripts
src/app/(auth)      login page
src/app/(dashboard) one page per module (dashboard, apartments, residents, ...)
src/app/api/        Route Handlers (one folder per resource)
src/components/     UI kit, generic list/form components, app shell
src/lib/            env, auth/session, API helpers, Zod schemas, pure business rules
src/models/         Mongoose models and indexes
src/server/         server-only helpers (parking transactions, complaint loading, activity log)
tests/              unit tests
db/lab_baseline.sql original seven-table lab script (reference only)
docs/               implementation guide, project proposal, architecture notes
```

More detail, the feature checklist and known limitations: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
