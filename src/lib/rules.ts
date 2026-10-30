/**
 * Pure business rules shared by API handlers, seeds and tests. No I/O in this file.
 */

export type Role = "ADMIN" | "RESIDENT" | "MAINTENANCE" | "SECURITY";
export type ComplaintStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type VehicleType = "CAR" | "BIKE";
export type NoticeAudience = "ALL" | "OWNERS" | "TENANTS" | "MAINTENANCE" | "SECURITY";

export const COMPLAINT_STATUSES: ComplaintStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

const ADMIN_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["IN_PROGRESS"], // reopen
};

const STAFF_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: [],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: [],
};

/** Which complaint status changes a role may perform. Residents never change status. */
export function canTransitionComplaint(role: Role, from: ComplaintStatus, to: ComplaintStatus): boolean {
  if (role === "ADMIN") return ADMIN_TRANSITIONS[from].includes(to);
  if (role === "MAINTENANCE") return STAFF_TRANSITIONS[from].includes(to);
  return false;
}

export function isSlotCompatible(vehicleType: VehicleType, slotType: VehicleType): boolean {
  return vehicleType === slotType;
}

/** Upper-cases and strips spaces/hyphens so "ka 01-ab 1234" and "KA01AB1234" collide. */
export function normalizeVehicleNumber(value: string): string {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

/** Audiences a viewer in the given role may read. Admins see every audience. */
export function visibleAudiences(role: Role, residentType?: "OWNER" | "TENANT" | null): NoticeAudience[] | "ALL_AUDIENCES" {
  switch (role) {
    case "ADMIN":
      return "ALL_AUDIENCES";
    case "RESIDENT":
      return residentType === "TENANT" ? ["ALL", "TENANTS"] : ["ALL", "OWNERS"];
    case "MAINTENANCE":
      return ["ALL", "MAINTENANCE"];
    case "SECURITY":
      return ["ALL", "SECURITY"];
  }
}

export function isNoticeCurrent(notice: { status: string; expiresAt?: Date | null }, now: Date = new Date()): boolean {
  if (notice.status !== "PUBLISHED") return false;
  return !notice.expiresAt || notice.expiresAt.getTime() > now.getTime();
}

export type PaymentInput = { status: "PAID" | "PENDING"; paymentDate?: string | null };

/** PAID needs a payment date; PENDING must not carry one. Returns an error message or null. */
export function validatePaymentState(input: PaymentInput): string | null {
  if (input.status === "PAID" && !input.paymentDate) return "paymentDate is required when status is PAID";
  if (input.status === "PENDING" && input.paymentDate) return "paymentDate must be empty when status is PENDING";
  return null;
}

/** "2026-10" -> "October 2026". Falls back to the raw value for legacy formats. */
export function formatBillingMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
