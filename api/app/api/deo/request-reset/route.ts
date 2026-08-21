import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, unlockRequests } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

const REASON_MAX_LENGTH = 2000;

// FormData endpoint (matches this app's multipart precedent, see CLAUDE.md). A DEO's self-service
// escalation asking an Admin to reset their district's ledger back to the uploaded baseline (see
// PLAN.md) — district-level, not gated on any lock state since there isn't one anymore.
export const POST = withErrorHandling("deo/request-reset", async (req: NextRequest) => {
  const session = await requireSession(req, "deo");
  if (!session || !session.districtId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [district] = await db
    .select({ id: districts.id, districtName: districts.districtName })
    .from(districts)
    .where(eq(districts.id, session.districtId))
    .limit(1);
  if (!district) {
    return NextResponse.json({ error: "District not found" }, { status: 404 });
  }

  const [existingPending] = await db
    .select({ id: unlockRequests.id })
    .from(unlockRequests)
    .where(and(eq(unlockRequests.districtId, district.id), eq(unlockRequests.status, "pending")))
    .limit(1);
  if (existingPending) {
    return NextResponse.json({ error: "You already have a pending reset request" }, { status: 409 });
  }

  const form = await req.formData();
  const reasonRaw = form.get("reason");
  if (typeof reasonRaw !== "string" || reasonRaw.trim().length === 0) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }
  const reason = reasonRaw.trim();
  if (reason.length > REASON_MAX_LENGTH) {
    return NextResponse.json({ error: `Reason must be ${REASON_MAX_LENGTH} characters or fewer` }, { status: 400 });
  }

  await db.batch([
    db.insert(unlockRequests).values({
      districtId: district.id,
      reason,
      status: "pending",
      requestedAt: new Date().toISOString(),
    }),
    // No actorEmail — DEO events never log PII (see audit_log's schema comment).
    auditLogInsert(db, {
      eventType: "reset_requested",
      actorRole: "deo",
      districtName: district.districtName,
      metadata: { reason },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
