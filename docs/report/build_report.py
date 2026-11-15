"""Builds docs/Project_Report.pdf.

Usage (from the repository root):  python docs/report/build_report.py

- Student names / SRNs / course come from docs/report/report.config.json
- Real demo screenshots are read from docs/report/screenshots/<name>.png (see SCREENSHOTS below);
  any that are missing are shown as clearly labelled placeholders.
- Code screenshots are rendered from the current source files.
"""
import io
import json
import subprocess
import textwrap
from pathlib import Path

from PIL import Image
from pygments import highlight
from pygments.formatters import ImageFormatter
from pygments.lexers import SqlLexer, TextLexer, TypeScriptLexer
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable, Image as RLImage, KeepTogether, PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[2]
REPORT_DIR = ROOT / "docs" / "report"
SHOT_DIR = REPORT_DIR / "screenshots"
OUT = ROOT / "docs" / "Project_Report.pdf"
CONFIG = json.loads((REPORT_DIR / "report.config.json").read_text(encoding="utf-8"))

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

ss = getSampleStyleSheet()
BODY = ParagraphStyle("Body", parent=ss["BodyText"], fontName="Helvetica", fontSize=10.5, leading=15, spaceAfter=6)
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, spaceBefore=4, spaceAfter=10, textColor=colors.HexColor("#1e3a8a"))
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=5, textColor=colors.HexColor("#1e40af"))
CAP = ParagraphStyle("Cap", parent=BODY, fontSize=9, leading=12, textColor=colors.HexColor("#475569"), alignment=TA_CENTER)
CODE = ParagraphStyle("Code", fontName="Courier", fontSize=7.2, leading=8.6, backColor=colors.HexColor("#f1f5f9"), borderPadding=4, spaceAfter=8)
TREE = ParagraphStyle("Tree", fontName="Courier", fontSize=7.6, leading=9.2)
TITLE = ParagraphStyle("Title", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER, textColor=colors.HexColor("#1e3a8a"))
CENTER = ParagraphStyle("Center", parent=BODY, alignment=TA_CENTER, fontSize=12, leading=17)


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def wrap_code(text: str, width: int = 118) -> str:
    """Hard-wraps long lines (Preformatted does not wrap) keeping indentation."""
    out = []
    for line in text.splitlines():
        if len(line) <= width:
            out.append(line)
            continue
        indent = len(line) - len(line.lstrip())
        out.extend(textwrap.wrap(line, width, subsequent_indent=" " * (indent + 4), break_long_words=False, replace_whitespace=False) or [line])
    return "\n".join(out)


def code_block(text: str) -> Preformatted:
    return Preformatted(wrap_code(text.strip("\n")), CODE)


class Placeholder(Flowable):
    """Dashed box standing in for a screenshot that has not been supplied yet."""

    def __init__(self, label: str, width: float, height: float = 70 * mm):
        super().__init__()
        self.label, self.width, self.height = label, width, height

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(colors.HexColor("#dc2626"))
        c.setDash(4, 3)
        c.rect(0, 0, self.width, self.height)
        c.setFillColor(colors.HexColor("#dc2626"))
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(self.width / 2, self.height / 2 + 6, "SCREENSHOT TO BE INSERTED")
        c.setFont("Helvetica", 9)
        c.drawCentredString(self.width / 2, self.height / 2 - 8, self.label)


def fit_image(path_or_buf, max_w: float, max_h: float) -> RLImage:
    with Image.open(path_or_buf) as im:
        w, h = im.size
    if hasattr(path_or_buf, "seek"):
        path_or_buf.seek(0)
    scale = min(max_w / w, max_h / h)
    return RLImage(path_or_buf, width=w * scale, height=h * scale)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawString(MARGIN, 10 * mm, CONFIG["title"])
    canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


# ---------------------------------------------------------------------------------------------
def title_page(story):
    story += [Spacer(1, 45 * mm), Paragraph(esc(CONFIG["title"]), TITLE), Spacer(1, 6 * mm)]
    story += [Paragraph(esc(CONFIG["subtitle"]), CENTER), Spacer(1, 18 * mm)]
    rows = [["Student name", "SRN"]] + [[s["name"], s["srn"]] for s in CONFIG["students"]]
    table = Table(rows, colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.3], hAlign="CENTER")
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")), ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i, s in enumerate(CONFIG["students"], start=1):  # unfilled placeholders stand out in red
        if "FILL IN" in s["name"] or "FILL IN" in s["srn"]:
            style.append(("TEXTCOLOR", (0, i), (-1, i), colors.HexColor("#dc2626")))
    table.setStyle(TableStyle(style))
    story += [table, Spacer(1, 18 * mm)]
    story += [Paragraph(esc(CONFIG["course"]), CENTER), Paragraph(esc(CONFIG["institution"]), CENTER), Paragraph(esc(CONFIG["date"]), CENTER), PageBreak()]


def abstract(story):
    story.append(Paragraph("1. Abstract", H1))
    for para in [
        "Apartment societies coordinate flat and resident records, monthly maintenance payments, parking and vehicles, staff, complaints, visitors and "
        "announcements. When this is done on paper registers, spreadsheets and messaging groups, records are hard to maintain, search and audit. "
        "This project delivers an Apartment Society Management System that centralises these operations in one web application.",
        "The system uses two databases for the jobs each does best. MySQL, accessed through the Prisma ORM, holds the structured records of truth: "
        "apartments, residents, staff, parking spaces, vehicles, maintenance payments, complaints and sign-in accounts, protected by primary keys, "
        "foreign keys, unique constraints, enumerated types, indexes and transactions. MongoDB, accessed through Mongoose, holds flexible, event-like "
        "documents: visitor entry and exit logs, notices and announcements, an append-only complaint activity history, and resident feedback. "
        "Documents reference relational rows by integer ID and never duplicate them.",
        "The front end and API are built with Next.js (App Router), TypeScript and Tailwind CSS. Four roles (administrator, resident, maintenance "
        "staff and security) sign in with hashed passwords and signed session cookies, and every API route enforces both role and record ownership "
        "on the server. Features include complaint assignment with status tracking and a chronological timeline, duplicate-bill protection, "
        "parking allocation that prevents double allocation and incompatible vehicle types, visitor search by flat and date, audience-targeted notices, "
        "live dashboards, search, filters and pagination. The project is an academic demonstration and does not claim production-grade security.",
    ]:
        story.append(Paragraph(esc(para), BODY))
    story.append(PageBreak())


def tech_stack(story):
    story.append(Paragraph("2. Tech Stack", H1))
    rows = [
        ["Layer", "Technology", "Used for"],
        ["Frontend", "Next.js 15 (App Router), React 19, TypeScript", "Pages, forms, tables, role-aware navigation"],
        ["Styling", "Tailwind CSS 3", "Responsive, accessible UI"],
        ["Backend / API", "Next.js Route Handlers (Node.js runtime)", "REST-style JSON API; all database access is server-side"],
        ["Relational DB", "MySQL 8 + Prisma ORM 6", "Apartments, residents, staff, payments, parking, vehicles, complaints, accounts"],
        ["Document DB", "MongoDB + Mongoose 8", "Visitors, notices, complaint activity, feedback"],
        ["Validation", "Zod", "Request bodies, query strings, environment variables"],
        ["Authentication", "bcryptjs, jose (JWT in httpOnly cookie)", "Password hashing, signed sessions, role and ownership checks"],
        ["Testing / quality", "Vitest, ESLint, TypeScript strict mode", "Unit tests, linting, type checking"],
        ["Tooling", "tsx, Docker Compose (optional)", "Seed and index scripts, local databases"],
    ]
    cells = [[Paragraph(esc(c), BODY if i else ParagraphStyle("h", parent=BODY, fontName="Helvetica-Bold")) for c in r] for i, r in enumerate(rows)]
    t = Table(cells, colWidths=[CONTENT_W * 0.17, CONTENT_W * 0.38, CONTENT_W * 0.45], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#94a3b8")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [t, Spacer(1, 6 * mm)]
    story.append(Paragraph("Request flow: Browser UI -> Next.js Route Handler -> Zod validation -> Prisma / MySQL or Mongoose / MongoDB. "
                           "Browser code never connects to a database.", BODY))
    story.append(PageBreak())


SQL_SETUP = """-- Create the database and an application user
CREATE DATABASE apartment_society CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'society_user'@'localhost' IDENTIFIED BY 'change_me';
GRANT ALL PRIVILEGES ON apartment_society.* TO 'society_user'@'localhost';
USE apartment_society;"""

SQL_DML = """-- Sample data (the seed script loads the full set of rows)
INSERT INTO Apartment (apartment_id, block, floor_no, flat_no, bhk, updated_at) VALUES
  (1, 'A', 1, '101', 2, NOW()), (2, 'A', 1, '102', 3, NOW()), (3, 'A', 2, '201', 2, NOW());

INSERT INTO Resident (resident_id, apartment_id, name, phone, email, resident_type, updated_at) VALUES
  (1, 1, 'Arjun Rao',    '9876500001', 'arjun@example.test',  'OWNER',  NOW()),
  (3, 3, 'Rahul Mehta',  '9876500003', 'rahul@example.test',  'TENANT', NOW());

INSERT INTO Staff (staff_id, name, role, phone, salary, updated_at) VALUES
  (1, 'Suresh Kumar', 'Electrician',    '9000000001', 25000, NOW()),
  (3, 'Mahesh Rao',   'Security Guard', '9000000003', 22000, NOW());

INSERT INTO ParkingSpace (parking_id, apartment_id, slot_number, vehicle_type, status, updated_at) VALUES
  (1, 1, 'A-P01', 'CAR', 'ALLOCATED', NOW()),
  (11, NULL, 'C-P03', 'CAR', 'AVAILABLE', NOW());

INSERT INTO Vehicle (vehicle_id, resident_id, parking_id, vehicle_number, vehicle_type, brand, updated_at)
VALUES (1, 1, 1, 'KA01AB1234', 'CAR', 'Hyundai', NOW());

INSERT INTO MaintenancePayment (apartment_id, amount, payment_month, payment_date, status, updated_at) VALUES
  (1, 3500, '2026-10', '2026-10-05', 'PAID',    NOW()),
  (3, 3500, '2026-10', NULL,         'PENDING', NOW());

INSERT INTO Complaint (complaint_id, resident_id, staff_id, category, description, complaint_date, status, updated_at)
VALUES (3, 3, NULL, 'Security', 'Intercom not working', '2026-10-03', 'OPEN', NOW());

-- Complaint lifecycle: admin assigns (OPEN -> IN_PROGRESS), staff resolves
UPDATE Complaint SET staff_id = 3, status = 'IN_PROGRESS' WHERE complaint_id = 3 AND status = 'OPEN';
UPDATE Complaint SET status = 'RESOLVED' WHERE complaint_id = 3 AND status = 'IN_PROGRESS';

-- Mark a bill paid
UPDATE MaintenancePayment SET status = 'PAID', payment_date = '2026-10-20'
WHERE apartment_id = 3 AND payment_month = '2026-10';

-- Duplicate monthly bill is rejected by the unique (apartment_id, payment_month) index:
-- INSERT INTO MaintenancePayment (...) VALUES (1, 3500, '2026-10', ...);  -> ERROR 1062 Duplicate entry

-- Parking allocation (run inside one transaction)
START TRANSACTION;
UPDATE ParkingSpace SET status = 'ALLOCATED', apartment_id = 1 WHERE parking_id = 11 AND status = 'AVAILABLE';
UPDATE Vehicle SET parking_id = 11 WHERE vehicle_id = 1;
COMMIT;

-- Release the slot again
START TRANSACTION;
UPDATE Vehicle SET parking_id = NULL WHERE parking_id = 11;
UPDATE ParkingSpace SET status = 'AVAILABLE', apartment_id = NULL WHERE parking_id = 11;
COMMIT;

-- Safe removal: deactivate instead of deleting history
UPDATE Resident SET is_active = FALSE WHERE resident_id = 3;
UPDATE UserAccount SET is_active = FALSE WHERE resident_id = 3;"""

SQL_QUERIES = """SHOW TABLES;
DESCRIBE MaintenancePayment;

SELECT 'Apartment' AS table_name, COUNT(*) AS record_count FROM Apartment
UNION ALL SELECT 'Resident', COUNT(*) FROM Resident
UNION ALL SELECT 'Staff', COUNT(*) FROM Staff
UNION ALL SELECT 'ParkingSpace', COUNT(*) FROM ParkingSpace
UNION ALL SELECT 'Vehicle', COUNT(*) FROM Vehicle
UNION ALL SELECT 'MaintenancePayment', COUNT(*) FROM MaintenancePayment
UNION ALL SELECT 'Complaint', COUNT(*) FROM Complaint
UNION ALL SELECT 'UserAccount', COUNT(*) FROM UserAccount;

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
FROM MaintenancePayment GROUP BY payment_month ORDER BY payment_month DESC;

-- Open / in-progress complaints with who is handling them
SELECT c.complaint_id, c.category, c.description, c.status, r.name AS raised_by, s.name AS assigned_to
FROM Complaint c
JOIN Resident r ON r.resident_id = c.resident_id
LEFT JOIN Staff s ON s.staff_id = c.staff_id
WHERE c.status <> 'RESOLVED' ORDER BY c.complaint_date;

-- Workload per staff member
SELECT s.name, s.role, COUNT(c.complaint_id) AS active_complaints
FROM Staff s
LEFT JOIN Complaint c ON c.staff_id = s.staff_id AND c.status = 'IN_PROGRESS'
GROUP BY s.staff_id, s.name, s.role ORDER BY active_complaints DESC;

-- Free parking slots by type
SELECT vehicle_type, COUNT(*) AS free_slots FROM ParkingSpace WHERE status = 'AVAILABLE' GROUP BY vehicle_type;

-- Vehicles with owners and slots
SELECT v.vehicle_number, v.vehicle_type, r.name AS owner, a.block, a.flat_no, ps.slot_number
FROM Vehicle v
JOIN Resident r ON r.resident_id = v.resident_id
JOIN Apartment a ON a.apartment_id = r.apartment_id
LEFT JOIN ParkingSpace ps ON ps.parking_id = v.parking_id
WHERE v.is_active = TRUE;

-- Consistency check: allocated slots without a vehicle (expect 0 rows)
SELECT ps.* FROM ParkingSpace ps
LEFT JOIN Vehicle v ON v.parking_id = ps.parking_id
WHERE ps.status = 'ALLOCATED' AND v.vehicle_id IS NULL;"""


def sql_section(story):
    story.append(Paragraph("3. SQL - Database Commands (MySQL)", H1))
    story.append(Paragraph("The relational schema has the seven agreed core tables (Apartment, Resident, Staff, ParkingSpace, Vehicle, "
                           "MaintenancePayment, Complaint) plus a UserAccount table for authentication. The DDL below is the migration "
                           "applied by <font face='Courier'>npm run db:migrate</font>; it is generated from <font face='Courier'>prisma/schema.prisma</font>.", BODY))
    story.append(Paragraph("3.1 Database and user creation", H2))
    story.append(code_block(SQL_SETUP))
    story.append(Paragraph("3.2 Table definitions (DDL)", H2))
    ddl = (ROOT / "prisma" / "migrations" / "20261030000000_init" / "migration.sql").read_text(encoding="utf-8")
    ddl = "\n".join(l for l in ddl.splitlines() if not l.startswith("-- "))
    story.append(code_block(ddl))
    story.append(Paragraph("3.3 Inserts, updates and transactions", H2))
    story.append(code_block(SQL_DML))
    story.append(Paragraph("3.4 Queries and checks", H2))
    story.append(code_block(SQL_QUERIES))
    story.append(PageBreak())


MONGO_SETUP = """use apartment_society

// Collections and indexes (created by `npm run db:indexes`; shell equivalent shown here)
db.createCollection("visitors")
db.createCollection("notices")
db.createCollection("complaint_activity")
db.createCollection("feedback")

db.visitors.createIndex({ apartmentId: 1, entryTime: -1 })
db.visitors.createIndex({ status: 1, entryTime: -1 })
db.notices.createIndex({ publishedAt: -1 })
db.notices.createIndex({ status: 1, audience: 1 })
db.complaint_activity.createIndex({ complaintId: 1, createdAt: 1 })
db.feedback.createIndex({ residentId: 1, submittedAt: -1 })
db.feedback.createIndex({ status: 1, submittedAt: -1 })

show collections
db.visitors.getIndexes()"""

MONGO_CRUD = """// ---- visitors: entry, exit, search ---------------------------------------------------------
db.visitors.insertOne({
  visitorName: "Anil Verma", phone: "9845000000", purpose: "Family visit",
  apartmentId: 1, hostResidentId: 1, vehicleNumber: "KA51ZZ1000",
  entryTime: new Date(), recordedByUserId: 4, status: "INSIDE"
})

// Record the exit on the matching active visit only
db.visitors.findOneAndUpdate(
  { visitorName: "Anil Verma", status: "INSIDE" },
  { $set: { status: "EXITED", exitTime: new Date() } },
  { returnDocument: "after" }
)

db.visitors.find({ status: "INSIDE" }).sort({ entryTime: -1 })

db.visitors.find({
  apartmentId: 1,
  entryTime: { $gte: ISODate("2026-10-01"), $lt: ISODate("2026-11-01") }
}).sort({ entryTime: -1 })

db.visitors.aggregate([
  { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryTime" } }, count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])

// ---- notices: publish, archive, audience filtering -------------------------------------------
db.notices.insertOne({
  documentType: "NOTICE", title: "Water tank cleaning",
  body: "Water supply will be off 10am-2pm on Sunday.", category: "Maintenance",
  priority: "HIGH", audience: "ALL", status: "DRAFT", createdByUserId: 1
})
db.notices.updateOne({ title: "Water tank cleaning" }, { $set: { status: "PUBLISHED", publishedAt: new Date() } })
db.notices.updateOne({ title: "Water tank cleaning" }, { $set: { status: "ARCHIVED" } })

// What a tenant should currently see
db.notices.find({
  status: "PUBLISHED",
  audience: { $in: ["ALL", "TENANTS"] },
  $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }]
}).sort({ publishedAt: -1 })

// ---- complaint_activity: append-only timeline -------------------------------------------------
db.complaint_activity.insertMany([
  { complaintId: 2, actorUserId: 2, actorRole: "RESIDENT", action: "CREATED", newStatus: "OPEN",
    note: "Water leakage in kitchen", createdAt: new Date() },
  { complaintId: 2, actorUserId: 1, actorRole: "ADMIN", action: "ASSIGNED", oldStatus: "OPEN",
    newStatus: "IN_PROGRESS", note: "Assigned to Ramesh Babu (Plumber)", createdAt: new Date() }
])
db.complaint_activity.find({ complaintId: 2 }).sort({ createdAt: 1 })
db.complaint_activity.aggregate([{ $group: { _id: "$action", n: { $sum: 1 } } }])

// ---- feedback: submit, review, summarise ------------------------------------------------------
db.feedback.insertOne({
  residentId: 7, apartmentId: 7, category: "Amenities", rating: 3,
  message: "Clubhouse timings could be extended.", submittedAt: new Date(), status: "NEW"
})
db.feedback.updateOne({ residentId: 7, status: "NEW" }, { $set: { status: "REVIEWED", adminNote: "Raised with committee" } })
db.feedback.aggregate([{ $group: { _id: "$category", avgRating: { $avg: "$rating" }, n: { $sum: 1 } } }])
db.feedback.find({ status: "NEW" })

// ---- counts -----------------------------------------------------------------------------------
db.visitors.countDocuments()
db.notices.countDocuments()
db.complaint_activity.countDocuments()
db.feedback.countDocuments()"""


def mongo_section(story):
    story.append(Paragraph("4. NoSQL Database Commands (MongoDB)", H1))
    story.append(Paragraph("MongoDB stores event-like documents and references MySQL rows only by integer ID (apartmentId, residentId, complaintId, "
                           "userId); nothing from Apartment, Resident, Staff or Payment is copied. The application uses Mongoose; the commands "
                           "below are the equivalent <font face='Courier'>mongosh</font> statements. No vector database is used in this project.", BODY))
    rows = [["Collection", "Purpose", "Indexes"],
            ["visitors", "Visitor entry / exit log", "apartmentId + entryTime; status + entryTime"],
            ["notices", "Notices and announcements (documentType)", "publishedAt; status + audience"],
            ["complaint_activity", "Append-only complaint timeline", "complaintId + createdAt"],
            ["feedback", "Resident feedback and admin review", "residentId + submittedAt; status + submittedAt"]]
    cells = [[Paragraph(esc(c), BODY) for c in r] for r in rows]
    t = Table(cells, colWidths=[CONTENT_W * 0.22, CONTENT_W * 0.38, CONTENT_W * 0.40], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#94a3b8")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [t, Spacer(1, 3 * mm)]
    story.append(Paragraph("4.1 Collections and indexes", H2))
    story.append(code_block(MONGO_SETUP))
    story.append(Paragraph("4.2 Insert, update, query and aggregate commands", H2))
    story.append(code_block(MONGO_CRUD))
    story.append(PageBreak())


def project_tree(story):
    story.append(Paragraph("5. Next.js - Project Tree Structure", H1))
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    files = sorted(f for f in files if f and f != "package-lock.json" and not f.startswith("docs/report/screenshots/"))
    tree: dict = {}
    for f in files:
        node = tree
        for part in f.split("/"):
            node = node.setdefault(part, {})
    lines = [ROOT.name + "/"]

    def walk(node, prefix=""):
        names = sorted(node, key=lambda n: (not node[n], n.lower()))  # folders first
        for i, name in enumerate(names):
            last = i == len(names) - 1
            lines.append(f"{prefix}{'`-- ' if last else '|-- '}{name}{'/' if node[name] else ''}")
            walk(node[name], prefix + ("    " if last else "|   "))

    walk(tree)
    story.append(Paragraph("Generated from the files tracked in the repository (lock file and screenshots omitted).", BODY))
    story.append(Preformatted("\n".join(lines), TREE))
    story.append(Spacer(1, 4 * mm))
    notes = [
        ("src/app/(auth)/login", "login page"),
        ("src/app/(dashboard)/*", "one page per module, wrapped in the role-aware app shell"),
        ("src/app/api/*", "Route Handlers: one folder per resource, each calls route(roles, handler)"),
        ("src/lib", "env validation, session/auth, API wrapper, Zod schemas, pure business rules"),
        ("src/models", "Mongoose models and indexes"),
        ("src/server", "server-only helpers: parking transactions, complaint access checks, activity log"),
        ("prisma", "schema.prisma and the versioned MySQL migration"),
        ("scripts", "seed / reset and MongoDB index scripts"),
    ]
    story.append(Paragraph("Key folders", H2))
    for path, desc in notes:
        story.append(Paragraph(f"<font face='Courier'>{esc(path)}</font> - {esc(desc)}", BODY))
    story.append(PageBreak())


CODE_SHOTS = [
    ("Prisma schema: ParkingSpace and Vehicle (unique parking_id prevents double allocation)", "prisma/schema.prisma", "model ParkingSpace {", 34, "prisma"),
    ("Role and authentication wrapper used by every API route", "src/lib/api.ts", "export function route<", 22, "ts"),
    ("Parking allocation: type check, conditional update, unique slot", "src/server/parking.ts", "export async function allocateSlot", 27, "ts"),
    ("Complaint assignment and status change with MongoDB activity log", "src/app/api/complaints/[id]/route.ts", "export const PATCH", 22, "ts"),
    ("Mongoose schema for the append-only complaint_activity collection", "src/models/index.ts", "const complaintActivitySchema", 18, "ts"),
    ("Reusable list page: search, filters, pagination, states", "src/components/ResourcePage.tsx", "export function ResourcePage", 30, "ts"),
]

SCREENSHOTS = [
    ("01-login", "Login page"),
    ("02-dashboard-admin", "Administrator dashboard with live counts"),
    ("03-apartments", "Apartments list with search"),
    ("04-payments", "Maintenance payments with paid / pending totals"),
    ("05-parking", "Parking slots with allocate / release"),
    ("06-complaint-timeline", "Complaint details with activity timeline"),
    ("07-visitors", "Visitor entry / exit and history search"),
    ("08-notices", "Notices management"),
    ("09-mysql-tables", "MySQL: SHOW TABLES / row counts"),
    ("10-mongodb-collections", "MongoDB: collections and sample documents"),
]


def render_code(rel: str, marker: str, count: int, kind: str) -> bytes:
    lines = (ROOT / rel).read_text(encoding="utf-8").splitlines()
    start = next(i for i, l in enumerate(lines) if marker in l)
    chunk = "\n".join(lines[start:start + count])
    lexer = TypeScriptLexer() if kind == "ts" else SqlLexer() if kind == "sql" else TextLexer()
    fmt = ImageFormatter(font_size=15, line_numbers=True, line_number_start=start + 1, style="default", image_pad=10, line_pad=3)
    return highlight(chunk, lexer, fmt)


def screenshots(story):
    story.append(Paragraph("6. Sample Screenshots of Application Code and Demo", H1))
    story.append(Paragraph("6.1 Application code", H2))
    story.append(Paragraph("Rendered from the project source files.", BODY))
    for caption, rel, marker, count, kind in CODE_SHOTS:
        img = fit_image(io.BytesIO(render_code(rel, marker, count, kind)), CONTENT_W, 120 * mm)
        story.append(KeepTogether([Paragraph(f"<font face='Courier'>{esc(rel)}</font>", BODY), img, Paragraph(esc(caption), CAP), Spacer(1, 5 * mm)]))
    story.append(PageBreak())
    story.append(Paragraph("6.2 Application demo", H2))
    missing = []
    for name, caption in SCREENSHOTS:
        path = SHOT_DIR / f"{name}.png"
        if path.exists():
            body = fit_image(str(path), CONTENT_W, 110 * mm)
        else:
            body = Placeholder(f"{name}.png - {caption}", CONTENT_W, 60 * mm)
            missing.append(name)
        story.append(KeepTogether([Paragraph(esc(caption), BODY), body, Paragraph(f"Figure: {esc(caption)}", CAP), Spacer(1, 5 * mm)]))
    if missing:
        print("Missing demo screenshots (placeholders used):", ", ".join(missing))


def main():
    story: list = []
    title_page(story)
    abstract(story)
    tech_stack(story)
    sql_section(story)
    mongo_section(story)
    project_tree(story)
    screenshots(story)
    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=18 * mm, bottomMargin=18 * mm,
                            title=CONFIG["title"] + " - Final Project Report", author=", ".join(s["name"] for s in CONFIG["students"]))
    doc.build(story, onFirstPage=lambda c, d: None, onLaterPages=footer)
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
