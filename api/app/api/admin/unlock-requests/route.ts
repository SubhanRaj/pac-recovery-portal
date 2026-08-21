import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { unlockRequests, districts } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { withErrorHandling } from "@/lib/with-error-handling";

export const GET = withErrorHandling("admin/unlock-requests", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: unlockRequests.id,
      districtId: unlockRequests.districtId,
      districtName: districts.districtName,
      reason: unlockRequests.reason,
      status: unlockRequests.status,
      requestedAt: unlockRequests.requestedAt,
      resolvedAt: unlockRequests.resolvedAt,
      resolvedBy: unlockRequests.resolvedBy,
      adminNote: unlockRequests.adminNote,
    })
    .from(unlockRequests)
    .leftJoin(districts, eq(unlockRequests.districtId, districts.id))
    .orderBy(desc(unlockRequests.requestedAt));

  return NextResponse.json({ rows });
});
