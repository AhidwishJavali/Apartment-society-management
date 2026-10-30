import mongoose from "mongoose";
import { getEnv } from "./env";

const globalForMongo = globalThis as unknown as { mongooseConn?: Promise<typeof mongoose> };

/** Returns a connected mongoose instance; the connection is cached across hot reloads. */
export function connectMongo(): Promise<typeof mongoose> {
  if (!globalForMongo.mongooseConn) {
    globalForMongo.mongooseConn = mongoose
      .connect(getEnv().MONGODB_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false })
      .catch((err) => {
        globalForMongo.mongooseConn = undefined;
        throw err;
      });
  }
  return globalForMongo.mongooseConn;
}
