import "./load-env";
import mongoose from "mongoose";
import { ComplaintActivity, Feedback, Notice, Visitor } from "../src/models";

// Creates collections and the indexes declared on the Mongoose schemas.
async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 8000 });
  for (const model of [Visitor, Notice, ComplaintActivity, Feedback]) {
    await model.createCollection().catch(() => undefined); // already exists
    await model.syncIndexes();
    console.log(`indexes ready: ${model.collection.name}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("MongoDB index setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
