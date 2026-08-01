import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pacDues, districts } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { withErrorHandling } from "@/lib/with-error-handling";

// Lets a DEO re-fetch their district's current period, including the read-only totalDues/
// collectedTillDate baseline — needed both on first load and once an Admin unlocks a period so
// the form can be re-populated. Single row, not a years[] array like the reference project's
// /api/pac-data/mine, since this domain has no multi-FY loop.
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

  const [current] = await db
    .select()
    .from(pacDues)
    .where(eq(pacDues.districtId, session.districtId))
    .orderBy(desc(pacDues.period))
    .limit(1);

  return NextResponse.json({
    totalDues: district?.totalDues ?? null,
    collectedTillDate: district?.collectedTillDate ?? null,
    current: current ?? null,
  });
});
