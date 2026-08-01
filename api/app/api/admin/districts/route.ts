import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { districts, pacDues, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { withErrorHandling } from "@/lib/with-error-handling";

// Full dump of all 75 districts + their pac_dues rows (every period, not just the latest), for
// the Admin dashboard's Dexie.js cache/sync — same shape/purpose as the reference project's
// /api/admin/districts, just without districts.lockStatus/unlockedAt (lock lives on pac_dues
// per period here, see pac-recovery-migration-plan.md §3).
export const GET = withErrorHandling("admin/districts", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [allDistricts, allPacDues] = await Promise.all([
    db
      .select({
        id: districts.id,
        districtName: districts.districtName,
        totalDues: districts.totalDues,
        collectedTillDate: districts.collectedTillDate,
        deoEmail: users.email,
        deoUserId: users.id,
      })
      .from(districts)
      .leftJoin(users, eq(districts.id, users.districtId)),
    db.select().from(pacDues),
  ]);

  return NextResponse.json({ districts: allDistricts, pacDues: allPacDues });
});
