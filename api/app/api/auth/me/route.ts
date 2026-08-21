import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession, isOwnerEmail } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { users, districts, unlockRequests } from "@/db/schema";
import { withErrorHandling } from "@/lib/with-error-handling";

// The frontend calls this on load to learn role/districtId and gate routes — see lib/session.ts
// for why there are two separate cookies instead of one shared __session.
//
// A DEO is never locked out here — pac_dues is an append-only ledger (see PLAN.md), so this only
// surfaces whether the DEO has a pending district-reset request, not a lock/period state.
//
// isOwner mirrors the reference project's OWNER_EMAIL-secret pattern (not a DB column) — only
// the admin whose email matches the OWNER_EMAIL secret sees/uses /admin/users, so ordinary
// admins never see each other's identities. Always false for DEOs.
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

  let pendingResetRequest: { requestedAt: string; reason: string } | null = null;

  if (role === "deo" && session.districtId) {
    const [pending] = await db
      .select({ requestedAt: unlockRequests.requestedAt, reason: unlockRequests.reason })
      .from(unlockRequests)
      .where(and(eq(unlockRequests.districtId, session.districtId), eq(unlockRequests.status, "pending")))
      .limit(1);
    pendingResetRequest = pending ?? null;
  }

  const isOwner = role === "admin" && isOwnerEmail(row?.email);

  return NextResponse.json({
    ...session,
    email: row?.email ?? null,
    name: row?.name ?? null,
    designation: row?.designation ?? null,
    districtName: row?.districtName ?? null,
    isOwner,
    pendingResetRequest,
  });
});
