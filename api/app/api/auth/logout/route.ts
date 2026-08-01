import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { clearSessionCookie } from "@/lib/session";
import { getDb } from "@/lib/db";
import { auditLogInsert } from "@/lib/audit";
import { districts, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withErrorHandling } from "@/lib/with-error-handling";

// Session tokens are stateless JWTs with no server-side revocation list, so there's nothing
// to invalidate server-side beyond clearing the cookie — this endpoint records the audit-log
// event and clears that role's cookie. ?role= says which one, so logging out of /admin doesn't
// touch a /deo-data-entry session in the same browser.
export const POST = withErrorHandling("auth/logout", async (req: NextRequest) => {
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "admin" && role !== "deo") {
    return NextResponse.json({ error: "role query param must be admin or deo" }, { status: 400 });
  }

  const session = await requireSession(req, role);
  if (session) {
    let districtName = null;
    let actorEmail: string | null = null;
    let actorName: string | null = null;
    let actorDesignation: string | null = null;
    const db = getDb();
    if (session.role === "deo" && session.districtId) {
      const [d] = await db.select().from(districts).where(eq(districts.id, session.districtId)).limit(1);
      districtName = d?.districtName ?? null;
    }
    if (session.role === "admin") {
      const [u] = await db
        .select({ email: users.email, name: users.name, designation: users.designation })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      actorEmail = u?.email ?? null;
      actorName = u?.name ?? null;
      actorDesignation = u?.designation ?? null;
    }
    await auditLogInsert(db, { eventType: "logout", actorRole: role, actorEmail, actorName, actorDesignation, districtName }).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, role);
  return res;
});
