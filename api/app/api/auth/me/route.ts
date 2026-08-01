import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { users, districts, pacDues, unlockRequests } from "@/db/schema";
import { withErrorHandling } from "@/lib/with-error-handling";

// The frontend calls this on load to learn role/districtId and gate routes — see lib/session.ts
// for why there are two separate cookies instead of one shared __session.
//
// Differs from the reference project structurally: lock state isn't a lifetime-once flag on
// districts/users here — it's per (district, period) on pac_dues (see
// pac-recovery-migration-plan.md §3), so "current period" for a DEO is just their district's
// most recent pac_dues row (by period desc). No "Open Next Period" mechanic exists yet (§3's
// provisionally-decided admin-action item isn't built), so today that's just the one row the
// legacy-data migration seeded. No isOwner/OWNER_EMAIL concept — multi-admin /admin/users is
// out of v1 scope (§6.2).
export const GET = withErrorHandling("auth/me", async (req: NextRequest) => {
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "admin" && role !== "deo") {
    return NextResponse.json({ error: "role query param must be admin or deo" }, { status: 400 });
  }

  const session = await requireSession(req, role);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      designation: users.designation,
      districtName: districts.districtName,
    })
    .from(users)
    .leftJoin(districts, eq(users.districtId, districts.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  let currentPeriod: {
    period: string;
    lockStatus: number;
    lockedAt: string | null;
    submittedByName: string | null;
  } | null = null;
  let pendingUnlockRequest: { requestedAt: string; reason: string } | null = null;

  if (role === "deo" && session.districtId) {
    const [latest] = await db
      .select({
        period: pacDues.period,
        lockStatus: pacDues.lockStatus,
        lockedAt: pacDues.lockedAt,
        submittedByName: pacDues.submittedByName,
      })
      .from(pacDues)
      .where(eq(pacDues.districtId, session.districtId))
      .orderBy(desc(pacDues.period))
      .limit(1);
    currentPeriod = latest ?? null;

    if (currentPeriod) {
      const [pending] = await db
        .select({ requestedAt: unlockRequests.requestedAt, reason: unlockRequests.reason })
        .from(unlockRequests)
        .where(
          and(
            eq(unlockRequests.districtId, session.districtId),
            eq(unlockRequests.period, currentPeriod.period),
            eq(unlockRequests.status, "pending")
          )
        )
        .limit(1);
      pendingUnlockRequest = pending ?? null;
    }
  }

  return NextResponse.json({
    ...session,
    email: row?.email ?? null,
    name: row?.name ?? null,
    designation: row?.designation ?? null,
    districtName: row?.districtName ?? null,
    currentPeriod,
    pendingUnlockRequest,
  });
});
