import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { magicLinkTokens, users } from "@/db/schema";
import { signSession, setSessionCookie } from "@/lib/session";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

// POST-only by design: the frontend /verify page requires a button click ("Verify & Continue"),
// so link-prefetching email clients/crawlers (which only issue GET) can never consume the token.
export const POST = withErrorHandling("auth/verify-magic-link", async (req: NextRequest) => {
  const { token } = (await req.json()) as { token?: unknown };

  if (typeof token !== "string" || token.length < 10) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.token, token), isNull(magicLinkTokens.usedAt)))
    .limit(1);

  if (!row || new Date(row.expiresAt) < new Date()) {
    return NextResponse.json({ error: "This link is invalid or has expired" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db
    .update(magicLinkTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(magicLinkTokens.id, row.id));

  const sessionToken = await signSession({
    userId: user.id,
    role: user.role as "deo" | "admin",
    districtId: user.districtId,
  });

  await auditLogInsert(db, {
    eventType: "login_magic_link",
    actorRole: user.role as "deo" | "admin",
    actorEmail: user.email,
    actorName: user.name,
    actorDesignation: user.designation,
  });

  const res = NextResponse.json({ ok: true, role: user.role, districtId: user.districtId });
  setSessionCookie(res, user.role as "deo" | "admin", sessionToken);
  return res;
});
