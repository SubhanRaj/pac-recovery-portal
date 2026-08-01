import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pacDues, districts } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { computeNetRecoverable } from "@/lib/dues-fields";
import { withErrorHandling } from "@/lib/with-error-handling";

type SubmitBody = {
  recoveredThisPeriod: number;
  batteKhatteCount: number;
  batteKhatteAmount: number;
  courtCaseCount: number;
  courtStayedAmount: number;
  submittedByName: string;
};

const NUMERIC_FIELDS = [
  "recoveredThisPeriod",
  "batteKhatteCount",
  "batteKhatteAmount",
  "courtCaseCount",
  "courtStayedAmount",
] as const;

// One period per submit, not a 5-FY loop — see pac-recovery-migration-plan.md §3. No "Open Next
// Period" mechanic yet, so this always operates on the district's single latest pac_dues row.
export const POST = withErrorHandling("pac-dues/submit", async (req: NextRequest) => {
  const session = await requireSession(req, "deo");
  if (!session || !session.districtId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as SubmitBody;

  for (const field of NUMERIC_FIELDS) {
    const value = body[field];
    // Zero-trust: reject missing/non-numeric values outright — the client must send an explicit
    // 0, never an empty string coerced to 0 (mirrors this repo's original anti-blank rule).
    if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
      return NextResponse.json({ error: `Field "${field}" must be a non-negative number` }, { status: 400 });
    }
  }
  if (typeof body.submittedByName !== "string" || body.submittedByName.trim().length === 0) {
    return NextResponse.json({ error: "submittedByName is required" }, { status: 400 });
  }
  if (body.batteKhatteAmount > 0 && body.batteKhatteCount === 0) {
    return NextResponse.json({ error: "Batte Khatte Count cannot be 0 when Amount is entered" }, { status: 400 });
  }
  if (body.courtStayedAmount > 0 && body.courtCaseCount === 0) {
    return NextResponse.json({ error: "Court Case Count cannot be 0 when Stayed Amount is entered" }, { status: 400 });
  }

  const db = getDb();

  const [district] = await db.select().from(districts).where(eq(districts.id, session.districtId)).limit(1);
  if (!district) {
    return NextResponse.json({ error: "District not found" }, { status: 404 });
  }

  const [current] = await db
    .select()
    .from(pacDues)
    .where(eq(pacDues.districtId, session.districtId))
    .orderBy(desc(pacDues.period))
    .limit(1);

  if (!current) {
    return NextResponse.json({ error: "No open recovery period for this district" }, { status: 404 });
  }
  if (current.lockStatus === 1) {
    return NextResponse.json({ error: "This period is already locked" }, { status: 409 });
  }

  // Server-computed only, never trusted from the client — mirrors this repo's original
  // Calculation Logic (README.md).
  const { duesLeft, netRecoverable } = computeNetRecoverable(
    current.openingBalance,
    body.recoveredThisPeriod,
    body.batteKhatteAmount,
    body.courtStayedAmount
  );

  // Math-safety gate (README's Calculation Logic #3), enforced server-side — mirrors the
  // frontend's disabled-submit-button check, never trusted from the client alone.
  if (body.batteKhatteAmount > duesLeft) {
    return NextResponse.json({ error: "Batte Khatte Amount cannot exceed Total Dues Left" }, { status: 400 });
  }
  if (body.courtStayedAmount > duesLeft - body.batteKhatteAmount) {
    return NextResponse.json(
      { error: "Court Stayed Amount cannot exceed Total Dues Left minus Batte Khatte Amount" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const submittedByName = body.submittedByName.trim();

  await db.batch([
    db
      .update(pacDues)
      .set({
        recoveredThisPeriod: body.recoveredThisPeriod,
        batteKhatteCount: body.batteKhatteCount,
        batteKhatteAmount: body.batteKhatteAmount,
        courtCaseCount: body.courtCaseCount,
        courtStayedAmount: body.courtStayedAmount,
        netRecoverable,
        lockStatus: 1,
        lockedAt: now,
        submittedByName,
      })
      .where(and(eq(pacDues.id, current.id))),
    auditLogInsert(db, {
      eventType: "district_locked",
      actorRole: "deo",
      districtName: district.districtName,
      metadata: { period: current.period, submittedByName },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
