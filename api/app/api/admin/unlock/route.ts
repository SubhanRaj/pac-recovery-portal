import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, pacDues, users } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

// Unlock is per (district, period) here, not district-lifetime — needs `period` in the body.
// Never clears pac_dues's other data fields, same "unlock never clears data" rule as the
// reference project.
export const POST = withErrorHandling("admin/unlock", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { districtId, period, reason } = (await req.json()) as {
    districtId?: unknown;
    period?: unknown;
    reason?: unknown;
  };
  if (typeof districtId !== "number") {
    return NextResponse.json({ error: "districtId is required" }, { status: 400 });
  }
  if (typeof period !== "string" || period.trim().length === 0) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json({ error: "A reason for unlocking is required" }, { status: 400 });
  }

  const db = getDb();
  const [admin] = await db
    .select({ email: users.email, name: users.name, designation: users.designation })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const [district] = await db
    .select({ districtName: districts.districtName })
    .from(districts)
    .where(eq(districts.id, districtId))
    .limit(1);

  await db.batch([
    db
      .update(pacDues)
      .set({
        lockStatus: 0,
        unlockedAt: new Date().toISOString(),
        unlockReason: reason.trim(),
        unlockedBy: admin?.name ?? admin?.email ?? null,
      })
      .where(and(eq(pacDues.districtId, districtId), eq(pacDues.period, period))),
    auditLogInsert(db, {
      eventType: "district_unlocked",
      actorRole: "admin",
      actorEmail: admin?.email,
      actorName: admin?.name,
      actorDesignation: admin?.designation,
      districtName: district?.districtName,
      metadata: { period, reason: reason.trim() },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
