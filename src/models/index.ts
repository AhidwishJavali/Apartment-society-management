import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Reuse compiled models across hot reloads. */
function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

// MongoDB stores event-like documents only. Relational entities are referenced by their MySQL integer IDs.

const visitorSchema = new Schema(
  {
    visitorName: { type: String, required: true, trim: true },
    phone: String,
    purpose: { type: String, required: true },
    apartmentId: { type: Number, required: true },
    hostResidentId: Number,
    vehicleNumber: String,
    entryTime: { type: Date, required: true },
    exitTime: Date,
    recordedByUserId: { type: Number, required: true },
    status: { type: String, enum: ["INSIDE", "EXITED"], default: "INSIDE", required: true },
  },
  { collection: "visitors" },
);
visitorSchema.index({ apartmentId: 1, entryTime: -1 });
visitorSchema.index({ status: 1, entryTime: -1 });

const noticeSchema = new Schema(
  {
    documentType: { type: String, enum: ["NOTICE", "ANNOUNCEMENT"], default: "NOTICE", required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, default: "General" },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH"], default: "NORMAL" },
    audience: { type: String, enum: ["ALL", "OWNERS", "TENANTS", "MAINTENANCE", "SECURITY"], default: "ALL" },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", required: true },
    publishedAt: Date,
    expiresAt: Date,
    createdByUserId: { type: Number, required: true },
  },
  { collection: "notices", timestamps: true },
);
noticeSchema.index({ publishedAt: -1 });
noticeSchema.index({ status: 1, audience: 1 });

// Append-only: the API only ever inserts into this collection.
const complaintActivitySchema = new Schema(
  {
    complaintId: { type: Number, required: true },
    actorUserId: { type: Number, required: true },
    actorRole: { type: String, required: true },
    actorName: String,
    action: { type: String, enum: ["CREATED", "ASSIGNED", "STATUS_CHANGED", "NOTE"], required: true },
    oldStatus: String,
    newStatus: String,
    note: String,
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "complaint_activity" },
);
complaintActivitySchema.index({ complaintId: 1, createdAt: 1 });

const feedbackSchema = new Schema(
  {
    residentId: { type: Number, required: true },
    apartmentId: { type: Number, required: true },
    category: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    message: { type: String, required: true },
    submittedAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["NEW", "REVIEWED", "RESOLVED"], default: "NEW", required: true },
    adminNote: String,
  },
  { collection: "feedback" },
);
feedbackSchema.index({ residentId: 1, submittedAt: -1 });
feedbackSchema.index({ status: 1, submittedAt: -1 });

export const Visitor = model("Visitor", visitorSchema);
export const Notice = model("Notice", noticeSchema);
export const ComplaintActivity = model("ComplaintActivity", complaintActivitySchema);
export const Feedback = model("Feedback", feedbackSchema);

export type VisitorDoc = InferSchemaType<typeof visitorSchema>;
export type NoticeDoc = InferSchemaType<typeof noticeSchema>;
export type ComplaintActivityDoc = InferSchemaType<typeof complaintActivitySchema>;
export type FeedbackDoc = InferSchemaType<typeof feedbackSchema>;
