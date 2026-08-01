import { eq } from "drizzle-orm";
import { loginAttempts } from "@/db/schema";
import type { getDb } from "@/lib/db";
import { sha256Hex } from "@/lib/hash";

const WINDOW_MS = 5 * 60 * 1000;

// Fixed-window per-IP counter — for routes with no user identity to key off yet (verify-cug's
// whole point is "we don't know who this is until the hash matches", so per-user limiting like
// request-magic-link's isn't available here). IP is hashed before storage, never kept raw. A
// small TOCTOU race exists between the read and the write (no transaction) — accepted as
// low-stakes, same posture as this codebase's other non-critical check-then-write patterns (see
// unlock_requests' "one pending request" comment in schema.ts). Returns false once the caller
// should be rejected (429), true otherwise.
export async function checkIpRateLimit(
  db: ReturnType<typeof getDb>,
  req: { headers: { get(name: string): string | null } },
  maxAttempts: number
): Promise<boolean> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await sha256Hex(ip);
  const now = Date.now();

  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.ipHash, ipHash)).limit(1);

  if (!row || now - new Date(row.windowStart).getTime() >= WINDOW_MS) {
    await db
      .insert(loginAttempts)
      .values({ ipHash, windowStart: new Date(now).toISOString(), count: 1 })
      .onConflictDoUpdate({
        target: loginAttempts.ipHash,
        set: { windowStart: new Date(now).toISOString(), count: 1 },
      });
    return true;
  }

  if (row.count >= maxAttempts) {
    return false;
  }

  await db.update(loginAttempts).set({ count: row.count + 1 }).where(eq(loginAttempts.ipHash, ipHash));
  return true;
}
