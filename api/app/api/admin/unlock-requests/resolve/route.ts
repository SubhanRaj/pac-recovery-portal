import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, pacDues, unlockRequests, users } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

export const POST = withErrorHandling("admin/unlock-requests/resolve", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action, note } = (await req.json()) as { id?: unknown; action?: unknown; note?: unknown };
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "action must be approve or deny" }, { status: 400 });
  }
  if (typeof note !== "string" || note.trim().length === 0) {
    return NextResponse.json({ error: "A note is required" }, { status: 400 });
  }
  const trimmedNote = note.trim();

  const db = getDb();
  const [request] = await db
    .select({
      id: unlockRequests.id,
      districtId: unlockRequests.districtId,
      period: unlockRequests.period,
      status: unlockRequests.status,
    })
    .from(unlockRequests)
    .where(eq(unlockRequests.id, id))
    .limit(1);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  // Re-checked here rather than trusted from a stale client list — prevents a double-resolve
  // race (two admins, or one admin double-clicking).
  if (request.status !== "pending") {
    return NextResponse.json({ error: "This request was already resolved" }, { status: 409 });
  }

  const [admin] = await db
    .select({ email: users.email, name: users.name, designation: users.designation })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const [district] = await db
    .select({ districtName: districts.districtName })
    .from(districts)
    .where(eq(districts.id, request.districtId))
    .limit(1);

  const resolvedAt = new Date().toISOString();
  const resolvedByDisplay = admin?.name ?? admin?.email ?? null;
  const statements = [
    db
      .update(unlockRequests)
      .set({ status: action === "approve" ? "approved" : "denied", resolvedAt, resolvedBy: resolvedByDisplay, adminNote: trimmedNote })
      .where(eq(unlockRequests.id, id)),
    ...(action === "approve"
      ? [
          db
            .update(pacDues)
            .set({ lockStatus: 0, unlockedAt: resolvedAt, unlockReason: trimmedNote, unlockedBy: resolvedByDisplay })
            .where(and(eq(pacDues.districtId, request.districtId), eq(pacDues.period, request.period))),
        ]
      : []),
    auditLogInsert(db, {
      eventType: action === "approve" ? "unlock_request_approved" : "unlock_request_denied",
      actorRole: "admin",
      actorEmail: admin?.email,
      actorName: admin?.name,
      actorDesignation: admin?.designation,
      districtName: district?.districtName,
      metadata: { period: request.period, note: trimmedNote },
    }),
  ];

  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
