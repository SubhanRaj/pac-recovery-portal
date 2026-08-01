import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, pacDues, unlockRequests } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

const REASON_MAX_LENGTH = 2000;

// FormData endpoint (matches this app's multipart precedent, see CLAUDE.md). Checks the
// district's current pac_dues period rather than districts.lockStatus (lock is per-period here,
// see pac-recovery-migration-plan.md §3).
export const POST = withErrorHandling("deo/request-unlock", async (req: NextRequest) => {
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

  const [current] = await db
    .select({ period: pacDues.period, lockStatus: pacDues.lockStatus })
    .from(pacDues)
    .where(eq(pacDues.districtId, district.id))
    .orderBy(desc(pacDues.period))
    .limit(1);
  if (!current || current.lockStatus !== 1) {
    return NextResponse.json({ error: "Your district isn't locked — nothing to request unlocking for" }, { status: 409 });
  }

  const [existingPending] = await db
    .select({ id: unlockRequests.id })
    .from(unlockRequests)
    .where(
      and(
        eq(unlockRequests.districtId, district.id),
        eq(unlockRequests.period, current.period),
        eq(unlockRequests.status, "pending")
      )
    )
    .limit(1);
  if (existingPending) {
    return NextResponse.json({ error: "You already have a pending unlock request" }, { status: 409 });
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
      period: current.period,
      reason,
      status: "pending",
      requestedAt: new Date().toISOString(),
    }),
    // No actorEmail — DEO events never log PII (see audit_log's schema comment).
    auditLogInsert(db, {
      eventType: "unlock_requested",
      actorRole: "deo",
      districtName: district.districtName,
      metadata: { period: current.period, reason },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
