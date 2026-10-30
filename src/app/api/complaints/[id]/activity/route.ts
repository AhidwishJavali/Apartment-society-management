import { ApiError, created, parseBody, parseId, route } from "@/lib/api";
import { complaintNoteBody } from "@/lib/schemas";
import { loadComplaintFor } from "@/server/complaints";
import { appendActivity } from "@/server/helpers";

type P = { id: string };

// Work notes / comments. Visibility rules are identical to the complaint itself.
export const POST = route<P>(["ADMIN", "RESIDENT", "MAINTENANCE"], async ({ req, user, params }) => {
  const id = parseId(params.id);
  const { note } = await parseBody(req, complaintNoteBody);
  const complaint = await loadComplaintFor(user, id);
  const logged = await appendActivity({ complaintId: complaint.id, user, action: "NOTE", note });
  // Notes live only in MongoDB, so a failed write is a real failure rather than a partial one.
  if (!logged.ok) throw new ApiError(503, "ACTIVITY_STORE_UNAVAILABLE", "The note could not be saved because MongoDB is unavailable");
  return created({ saved: true });
});
