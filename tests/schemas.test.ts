import { describe, expect, it } from "vitest";
import { accountBody, complaintPatch, paymentBody, vehicleBody, visitorBody } from "@/lib/schemas";

describe("paymentBody", () => {
  const base = { apartmentId: 1, amount: "3500", paymentMonth: "2026-10" };

  it("accepts a pending bill without a date and coerces numbers", () => {
    const parsed = paymentBody.parse({ ...base, status: "PENDING" });
    expect(parsed.amount).toBe(3500);
  });

  it("rejects PAID without a payment date", () => {
    expect(paymentBody.safeParse({ ...base, status: "PAID" }).success).toBe(false);
    expect(paymentBody.safeParse({ ...base, status: "PAID", paymentDate: "2026-10-05" }).success).toBe(true);
  });

  it("rejects malformed billing months and non-positive amounts", () => {
    expect(paymentBody.safeParse({ ...base, paymentMonth: "October 2026", status: "PENDING" }).success).toBe(false);
    expect(paymentBody.safeParse({ ...base, amount: 0, status: "PENDING" }).success).toBe(false);
  });
});

describe("vehicleBody", () => {
  it("normalizes the registration number and drops blank optionals", () => {
    const parsed = vehicleBody.parse({ residentId: "2", vehicleNumber: "ka-01 ab 1234", vehicleType: "CAR", brand: "" });
    expect(parsed.vehicleNumber).toBe("KA01AB1234");
    expect(parsed.residentId).toBe(2);
    expect(parsed.brand).toBeNull();
  });
});

describe("complaintPatch", () => {
  it("accepts assign and status actions and rejects unknown ones", () => {
    expect(complaintPatch.safeParse({ action: "assign", staffId: 3 }).success).toBe(true);
    expect(complaintPatch.safeParse({ action: "status", status: "RESOLVED" }).success).toBe(true);
    expect(complaintPatch.safeParse({ action: "delete" }).success).toBe(false);
    expect(complaintPatch.safeParse({ action: "status", status: "DONE" }).success).toBe(false);
  });
});

describe("accountBody", () => {
  const base = { username: "new.user", email: "New@Example.test", password: "a-long-password" };

  it("requires the right link for each role", () => {
    expect(accountBody.safeParse({ ...base, role: "RESIDENT" }).success).toBe(false);
    expect(accountBody.safeParse({ ...base, role: "RESIDENT", residentId: 1 }).success).toBe(true);
    expect(accountBody.safeParse({ ...base, role: "SECURITY" }).success).toBe(false);
    expect(accountBody.safeParse({ ...base, role: "SECURITY", staffId: 3 }).success).toBe(true);
    expect(accountBody.safeParse({ ...base, role: "ADMIN", residentId: 1 }).success).toBe(false);
  });

  it("lower-cases email and enforces password length", () => {
    expect(accountBody.parse({ ...base, role: "ADMIN" }).email).toBe("new@example.test");
    expect(accountBody.safeParse({ ...base, password: "short", role: "ADMIN" }).success).toBe(false);
  });
});

describe("visitorBody", () => {
  it("requires a destination apartment and treats blank optionals as absent", () => {
    expect(visitorBody.safeParse({ visitorName: "A", purpose: "Delivery" }).success).toBe(false);
    const parsed = visitorBody.parse({ visitorName: "A", purpose: "Delivery", apartmentId: "4", phone: "", vehicleNumber: "" });
    expect(parsed.apartmentId).toBe(4);
    expect(parsed.phone).toBeUndefined();
  });
});
