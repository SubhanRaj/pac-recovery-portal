import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/db/schema";
import { requireSession, isOwnerEmail } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Owner-only (see lib/auth-guard.ts's isOwnerEmail) — ordinary admins never see or manage each
// other's accounts, only the admin whose email matches the OWNER_EMAIL secret.
export const GET = withErrorHandling("admin/users:get", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const [actor] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.userId)).limit(1);
  if (!isOwnerEmail(actor?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      designation: users.designation,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.createdAt);

  return NextResponse.json({ rows });
});

export const POST = withErrorHandling("admin/users:create", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, email, designation } = (await req.json()) as {
    name?: unknown;
    email?: unknown;
    designation?: unknown;
  };
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

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const [inserted] = await db
    .insert(users)
    .values({
      role: "admin",
      email: normalizedEmail,
      name: name.trim(),
      designation: typeof designation === "string" && designation.trim() ? designation.trim() : null,
    })
    .returning({ id: users.id });

  await auditLogInsert(db, {
    eventType: "admin_user_added",
    actorRole: "admin",
    actorEmail: actor?.email,
    actorName: actor?.name,
    actorDesignation: actor?.designation,
    metadata: { addedEmail: normalizedEmail, addedName: name.trim() },
  });

  return NextResponse.json({ ok: true, id: inserted.id });
});
