import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").startsWith("mysql://", "DATABASE_URL must be a mysql:// URL"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required").regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must be a mongodb:// URL"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated lazily so `next build` works without a configured environment. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration - ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
