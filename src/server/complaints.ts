import type { CurrentUser } from "@/lib/auth";
import { forbidden, notFound } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { ComplaintActivity } from "@/models";
import { complaintInclude } from "./includes";

/** Loads a complaint and enforces who may see it (record ownership), throwing 404/403 otherwise. */
export async function loadComplaintFor(user: CurrentUser, id: number) {
  const complaint = await prisma.complaint.findUnique({ where: { id }, include: complaintInclude });
  if (!complaint) throw notFound("Complaint");
  if (user.role === "ADMIN") return complaint;
  if (user.role === "RESIDENT" && user.residentIds.includes(complaint.residentId)) return complaint;
  if (user.role === "MAINTENANCE" && complaint.staffId !== null && complaint.staffId === user.staffId) return complaint;
  throw forbidden();
}

/** Chronological activity; returns an explicit flag instead of failing the whole page if MongoDB is down. */
export async function loadTimeline(complaintId: number) {
  try {
    await connectMongo();
    const docs = await ComplaintActivity.find({ complaintId }).sort({ createdAt: 1 }).lean();
    return { activity: docs.map((d) => ({ ...d, id: String(d._id), _id: undefined })), activityAvailable: true };
  } catch {
    return { activity: [], activityAvailable: false };
  }
}
