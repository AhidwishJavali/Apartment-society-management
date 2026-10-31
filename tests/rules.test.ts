import { describe, expect, it } from "vitest";
import {
  canTransitionComplaint,
  formatBillingMonth,
  isNoticeCurrent,
  isSlotCompatible,
  normalizeVehicleNumber,
  validatePaymentState,
  visibleAudiences,
} from "@/lib/rules";

describe("complaint status transitions", () => {
  it("lets admins assign-then-resolve and reopen, but not skip steps", () => {
    expect(canTransitionComplaint("ADMIN", "OPEN", "IN_PROGRESS")).toBe(true);
    expect(canTransitionComplaint("ADMIN", "IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(canTransitionComplaint("ADMIN", "RESOLVED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionComplaint("ADMIN", "OPEN", "RESOLVED")).toBe(false);
    expect(canTransitionComplaint("ADMIN", "RESOLVED", "OPEN")).toBe(false);
  });

  it("limits maintenance staff to resolving in-progress work", () => {
    expect(canTransitionComplaint("MAINTENANCE", "IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(canTransitionComplaint("MAINTENANCE", "OPEN", "IN_PROGRESS")).toBe(false);
    expect(canTransitionComplaint("MAINTENANCE", "RESOLVED", "IN_PROGRESS")).toBe(false);
  });

  it("never lets residents or security change status", () => {
    expect(canTransitionComplaint("RESIDENT", "OPEN", "IN_PROGRESS")).toBe(false);
    expect(canTransitionComplaint("SECURITY", "IN_PROGRESS", "RESOLVED")).toBe(false);
  });
});

describe("parking and vehicles", () => {
  it("only allows matching vehicle and slot types", () => {
    expect(isSlotCompatible("CAR", "CAR")).toBe(true);
    expect(isSlotCompatible("BIKE", "CAR")).toBe(false);
    expect(isSlotCompatible("CAR", "BIKE")).toBe(false);
  });

  it("normalizes vehicle numbers so formatting variants collide", () => {
    expect(normalizeVehicleNumber("ka 01-ab 1234")).toBe("KA01AB1234");
  });
});

describe("notice audiences", () => {
  it("shows admins everything and others only their audiences", () => {
    expect(visibleAudiences("ADMIN")).toBe("ALL_AUDIENCES");
    expect(visibleAudiences("RESIDENT", "OWNER")).toEqual(["ALL", "OWNERS"]);
    expect(visibleAudiences("RESIDENT", "TENANT")).toEqual(["ALL", "TENANTS"]);
    // Owns one flat, rents another: reads both.
    expect(visibleAudiences("RESIDENT", ["OWNER", "TENANT"])).toEqual(["ALL", "OWNERS", "TENANTS"]);
    expect(visibleAudiences("RESIDENT", [])).toEqual(["ALL"]);
    expect(visibleAudiences("MAINTENANCE")).toEqual(["ALL", "MAINTENANCE"]);
    expect(visibleAudiences("SECURITY")).toEqual(["ALL", "SECURITY"]);
  });

  it("treats drafts, archived and expired notices as not current", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(isNoticeCurrent({ status: "PUBLISHED" }, now)).toBe(true);
    expect(isNoticeCurrent({ status: "PUBLISHED", expiresAt: new Date("2026-11-01T00:00:00Z") }, now)).toBe(true);
    expect(isNoticeCurrent({ status: "PUBLISHED", expiresAt: new Date("2026-10-01T00:00:00Z") }, now)).toBe(false);
    expect(isNoticeCurrent({ status: "DRAFT" }, now)).toBe(false);
    expect(isNoticeCurrent({ status: "ARCHIVED" }, now)).toBe(false);
  });
});

describe("payments", () => {
  it("requires a date for PAID and forbids one for PENDING", () => {
    expect(validatePaymentState({ status: "PAID", paymentDate: null })).toMatch(/required/);
    expect(validatePaymentState({ status: "PAID", paymentDate: "2026-10-05" })).toBeNull();
    expect(validatePaymentState({ status: "PENDING", paymentDate: "2026-10-05" })).toMatch(/empty/);
    expect(validatePaymentState({ status: "PENDING" })).toBeNull();
  });

  it("formats billing months", () => {
    expect(formatBillingMonth("2026-10")).toBe("October 2026");
    expect(formatBillingMonth("Legacy value")).toBe("Legacy value");
  });
});
