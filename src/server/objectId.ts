import mongoose from "mongoose";
import { badRequest } from "@/lib/api";

export function parseObjectId(value: string): string {
  if (!mongoose.isValidObjectId(value) || String(new mongoose.Types.ObjectId(value)) !== value.toLowerCase()) {
    throw badRequest("Invalid id");
  }
  return value;
}

/** Plain-object copy of a lean Mongo doc with `_id` exposed as `id`. */
export function withId<T extends { _id: unknown }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id) };
}
