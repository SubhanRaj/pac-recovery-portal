import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, magicLinkTokens } from "@/db/schema";
import { requireSession, isOwnerEmail } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

export const POST = withErrorHandling("admin/users:delete", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = (await req.json()) as { id?: unknown };
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (id === session.userId) {
    return NextResponse.json({ error: "You cannot remove your own admin account" }, { status: 400 });
  }

  const db = getDb();
  const [actor] = await db
    .select({ email: users.email, name: users.name, designation: users.designation })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!isOwnerEmail(actor?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [target] = await db
    .select({ id: users.id, role: users.role, email: users.email, name: users.name, designation: users.designation })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target || target.role !== "admin") {
    return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
  }

  const allAdmins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  if (allAdmins.length <= 1) {
    return NextResponse.json({ error: "Cannot remove the last remaining admin" }, { status: 400 });
  }

  await db.batch([
    db.delete(magicLinkTokens).where(eq(magicLinkTokens.userId, id)),
    db.delete(users).where(and(eq(users.id, id), eq(users.role, "admin"))),
    auditLogInsert(db, {
      eventType: "admin_user_removed",
      actorRole: "admin",
      actorEmail: actor?.email,
      actorName: actor?.name,
      actorDesignation: actor?.designation,
      metadata: { removedEmail: target.email, removedName: target.name },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
