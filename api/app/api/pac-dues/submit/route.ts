import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pacDues, districts } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { computeNetRecoverable, validateRcDetails, type RcDetail } from "@/lib/dues-fields";
import { withErrorHandling } from "@/lib/with-error-handling";

type SubmitBody = {
  rcCount: number;
  rcAmount: number;
  rcDetails: RcDetail[];
  recoveredThisPeriod: number;
  batteKhatteCount: number;
  batteKhatteAmount: number;
  courtCaseCount: number;
  courtStayedAmount: number;
  submittedByName: string;
};

const NUMERIC_FIELDS = [
  "rcCount",
  "rcAmount",
  "recoveredThisPeriod",
  "batteKhatteCount",
  "batteKhatteAmount",
  "courtCaseCount",
  "courtStayedAmount",
] as const;

// Always inserts a new immutable ledger entry — never updates or locks an existing row (see
// PLAN.md). A DEO can call this any number of times; openingBalance chains from whatever the
// district's latest entry currently is (or the uploaded baseline if this is the first entry).
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
  const rcDetailsError = validateRcDetails(body.rcCount, body.rcAmount, Array.isArray(body.rcDetails) ? body.rcDetails : []);
  if (rcDetailsError) {
    return NextResponse.json({ error: rcDetailsError }, { status: 400 });
  }

  const db = getDb();

  const [district] = await db.select().from(districts).where(eq(districts.id, session.districtId)).limit(1);
  if (!district) {
    return NextResponse.json({ error: "District not found" }, { status: 404 });
  }

  const [latest] = await db
    .select()
    .from(pacDues)
    .where(eq(pacDues.districtId, session.districtId))
    .orderBy(desc(pacDues.id))
    .limit(1);

  if (!latest && (district.totalDues === null || district.collectedTillDate === null)) {
    return NextResponse.json({ error: "District baseline dues have not been uploaded yet" }, { status: 404 });
  }
  const openingBalance = latest ? latest.netRecoverable : district.totalDues! - district.collectedTillDate!;

  // Server-computed only, never trusted from the client — mirrors this repo's original
  // Calculation Logic (README.md).
  const { duesLeft, netRecoverable } = computeNetRecoverable(
    openingBalance,
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

  const submittedByName = body.submittedByName.trim();

  await db.batch([
    db.insert(pacDues).values({
      districtId: session.districtId,
      openingBalance,
      rcCount: body.rcCount,
      rcAmount: body.rcAmount,
      rcDetails: JSON.stringify(body.rcDetails),
      recoveredThisPeriod: body.recoveredThisPeriod,
      batteKhatteCount: body.batteKhatteCount,
      batteKhatteAmount: body.batteKhatteAmount,
      courtCaseCount: body.courtCaseCount,
      courtStayedAmount: body.courtStayedAmount,
      netRecoverable,
      submittedByName,
    }),
    auditLogInsert(db, {
      eventType: "recovery_entry_submitted",
      actorRole: "deo",
      districtName: district.districtName,
      metadata: { submittedByName, recoveredThisPeriod: body.recoveredThisPeriod, netRecoverable },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
