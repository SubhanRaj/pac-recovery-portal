import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, magicLinkTokens } from "@/db/schema";
import { requireSession, isOwnerEmail } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminActor = { id: number; email: string | null; name: string | null; designation: string | null };

// Owner-only — the actual gate is this check, not the ProfileMenu link's visibility. Returns the
// requesting admin's own row (so the frontend can flag the owner row as un-deletable/un-editable)
// or null if the caller isn't the owner — callers respond 401/403 themselves so the specific
// status code stays visible at the call site, same as every other route in this codebase.
async function getOwnerActor(req: NextRequest, db: ReturnType<typeof getDb>): Promise<AdminActor | null> {
  const session = await requireSession(req, "admin");
  if (!session) return null;

  const [admin] = await db
    .select({ id: users.id, email: users.email, name: users.name, designation: users.designation })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!isOwnerEmail(admin?.email)) return null;
  return admin ?? null;
}

export const GET = withErrorHandling("admin/users", async (req: NextRequest) => {
  const db = getDb();
  const admin = await getOwnerActor(req, db);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, designation: users.designation, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.createdAt);

  return NextResponse.json({ rows: rows.map((r) => ({ ...r, isOwner: isOwnerEmail(r.email) })) });
});

export const POST = withErrorHandling("admin/users/create", async (req: NextRequest) => {
  const db = getDb();
  const admin = await getOwnerActor(req, db);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as { name?: unknown; email?: unknown; designation?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const designation = typeof body.designation === "string" ? body.designation.trim() : "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const [created] = await db
    .insert(users)
    .values({ role: "admin", email, name, designation: designation || null })
    .returning({ id: users.id });

  await auditLogInsert(db, {
    eventType: "admin_user_created",
    actorRole: "admin",
    actorEmail: admin.email,
    actorName: admin.name,
    actorDesignation: admin.designation,
    metadata: { newAdminEmail: email, newAdminName: name },
  });

  return NextResponse.json({ id: created.id });
});

// Body carries `id` rather than a dynamic [id] route segment — matches every other
// action-on-an-existing-row route in this codebase (e.g. admin/unlock-requests/resolve), which
// all take the target's id in the JSON body instead of the URL.
//
// Editing the owner's own row is allowed for name/designation, but never email — OWNER_EMAIL is
// a Worker secret compared by value (see auth/me/route.ts's isOwner), so silently changing this
// row's email would strand the owner out of their own owner-only pages until the secret was
// updated to match by hand.
export const PATCH = withErrorHandling("admin/users/update", async (req: NextRequest) => {
  const db = getDb();
  const admin = await getOwnerActor(req, db);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as { id?: unknown; name?: unknown; email?: unknown; designation?: unknown };
  const targetId = Number(body.id);
  if (!Number.isInteger(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target || target.role !== "admin") return NextResponse.json({ error: "Admin user not found" }, { status: 404 });

  const values: { name?: string; email?: string; designation?: string | null } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    values.name = name;
  }
  if (body.designation !== undefined) {
    values.designation = typeof body.designation === "string" && body.designation.trim() ? body.designation.trim() : null;
  }
  if (body.email !== undefined) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    if (isOwnerEmail(target.email) && email !== target.email) {
      return NextResponse.json({ error: "The owner's email cannot be changed here" }, { status: 400 });
    }
    if (email !== target.email) {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    values.email = email;
  }

  await db.update(users).set(values).where(eq(users.id, targetId));

  await auditLogInsert(db, {
    eventType: "admin_user_updated",
    actorRole: "admin",
    actorEmail: admin.email,
    actorName: admin.name,
    actorDesignation: admin.designation,
    metadata: { targetAdminId: targetId, targetAdminEmail: values.email ?? target.email },
  });

  return NextResponse.json({ ok: true });
});

// Blocks removing the owner row (no recovery path if the only OWNER_EMAIL-matching account is
// deleted) and blocks an admin deleting their own logged-in row (same footgun, smaller blast
// radius). magic_link_tokens rows for that user are deleted first in the same batch — they
// reference users.id and would otherwise be orphaned once the user row is gone.
export const DELETE = withErrorHandling("admin/users/delete", async (req: NextRequest) => {
  const db = getDb();
  const admin = await getOwnerActor(req, db);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as { id?: unknown };
  const targetId = Number(body.id);
  if (!Number.isInteger(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target || target.role !== "admin") return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
  if (isOwnerEmail(target.email)) return NextResponse.json({ error: "The owner account cannot be deleted" }, { status: 400 });
  if (target.id === admin.id) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });

  await db.batch([
    db.delete(magicLinkTokens).where(eq(magicLinkTokens.userId, targetId)),
    db.delete(users).where(eq(users.id, targetId)),
  ]);

  await auditLogInsert(db, {
    eventType: "admin_user_deleted",
    actorRole: "admin",
    actorEmail: admin.email,
    actorName: admin.name,
    actorDesignation: admin.designation,
    metadata: { deletedAdminEmail: target.email, deletedAdminName: target.name },
  });

  return NextResponse.json({ ok: true });
});
