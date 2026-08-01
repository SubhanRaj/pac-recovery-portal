import { NextRequest, NextResponse } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/db/schema";
import { requireSession, isOwnerEmail } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withErrorHandling("admin/users:update", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, email, designation } = (await req.json()) as {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    designation?: unknown;
  };
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
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

  const normalizedEmail = email.trim().toLowerCase();

  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (!target || target.role !== "admin") {
    return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
  }

  const [emailTaken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalizedEmail), ne(users.id, id)))
    .limit(1);
  if (emailTaken) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  await db
    .update(users)
    .set({
      name: name.trim(),
      email: normalizedEmail,
      designation: typeof designation === "string" && designation.trim() ? designation.trim() : null,
    })
    .where(eq(users.id, id));

  await auditLogInsert(db, {
    eventType: "admin_user_updated",
    actorRole: "admin",
    actorEmail: actor?.email,
    actorName: actor?.name,
    actorDesignation: actor?.designation,
    metadata: { updatedEmail: normalizedEmail, updatedName: name.trim() },
  });

  return NextResponse.json({ ok: true });
});
