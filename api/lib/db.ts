import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "@/db/schema";

// ponytail: getCloudflareContext() is per-request in OpenNext; no pooling needed on D1's edge model
export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}
