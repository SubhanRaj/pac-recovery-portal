import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pacDues, districts } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { withErrorHandling } from "@/lib/with-error-handling";

// Lets a DEO re-fetch their district's baseline plus every ledger entry they've ever submitted
// (newest first) — "current" is just history[0]. The full history is returned so the DEO can
// view (read-only) everything they've submitted, per the "cannot be changed, can be viewed" rule.
export const GET = withErrorHandling("pac-dues/mine", async (req: NextRequest) => {
  const session = await requireSession(req, "deo");
  if (!session || !session.districtId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const [district] = await db
    .select({ totalDues: districts.totalDues, collectedTillDate: districts.collectedTillDate })
    .from(districts)
    .where(eq(districts.id, session.districtId))
    .limit(1);

  const history = await db
    .select()
    .from(pacDues)
    .where(eq(pacDues.districtId, session.districtId))
    .orderBy(desc(pacDues.id));

  return NextResponse.json({
    totalDues: district?.totalDues ?? null,
    collectedTillDate: district?.collectedTillDate ?? null,
    current: history[0] ?? null,
    history,
  });
});
