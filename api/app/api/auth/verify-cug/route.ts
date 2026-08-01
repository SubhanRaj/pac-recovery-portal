import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, districts } from "@/db/schema";
import { signSession, setSessionCookie } from "@/lib/session";
import { auditLogInsert } from "@/lib/audit";
import { checkIpRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/with-error-handling";

const MAX_ATTEMPTS_PER_WINDOW = 10;

// Frontend hashes the 10-digit CUG mobile number via Web Crypto SHA-256 before sending it here.
// The server never sees or stores the raw mobile number.
export const POST = withErrorHandling("auth/verify-cug", async (req: NextRequest) => {
  const { cugHash } = (await req.json()) as { cugHash?: unknown };

  if (typeof cugHash !== "string" || !/^[a-f0-9]{64}$/.test(cugHash)) {
    return NextResponse.json({ error: "Invalid CUG hash" }, { status: 400 });
  }

  const db = getDb();

  // Per-IP brute-force guard — see SECURITY.md's H-01. Checked before the DB lookup so a
  // sustained guessing run gets rejected without even touching the users table.
  const allowed = await checkIpRateLimit(db, req, MAX_ATTEMPTS_PER_WINDOW);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts — please try again later." }, { status: 429 });
  }

  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      name: users.name,
      designation: users.designation,
      districtId: users.districtId,
      districtName: districts.districtName,
    })
    .from(users)
    .leftJoin(districts, eq(users.districtId, districts.id))
    .where(eq(users.cugHash, cugHash))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Invalid CUG number" }, { status: 401 });
  }

  const token = await signSession({
    userId: row.id,
    role: row.role as "deo" | "admin",
    districtId: row.districtId,
  });

  // actorEmail/Name/Designation stay null for DEO logins by design (see audit_log's schema
  // comment) — only meaningful for the rare admin-via-CUG case.
  await auditLogInsert(db, {
    eventType: "login_cug",
    actorRole: row.role as "deo" | "admin",
    actorEmail: row.role === "admin" ? row.email : null,
    actorName: row.role === "admin" ? row.name : null,
    actorDesignation: row.role === "admin" ? row.designation : null,
    districtName: row.districtName,
  });

  const res = NextResponse.json({ ok: true, role: row.role, districtId: row.districtId });
  setSessionCookie(res, row.role as "deo" | "admin", token);
  return res;
});
