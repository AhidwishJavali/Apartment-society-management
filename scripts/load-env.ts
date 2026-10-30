import { existsSync } from "node:fs";
import path from "node:path";

/** Loads .env.local then .env (first value wins), mirroring how Next.js and the Prisma CLI read config. */
for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (existsSync(full)) process.loadEnvFile(full);
}

for (const key of ["DATABASE_URL", "MONGODB_URI"]) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Copy .env.example to .env.local and .env, then fill it in.`);
    process.exit(1);
  }
}
