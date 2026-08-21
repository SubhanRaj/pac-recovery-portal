import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, pacDues, users } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

// Admin's escape hatch for a district whose ledger genuinely needs a do-over: deletes every
// pac_dues row for the district (a fresh submit afterwards chains from the uploaded baseline
// again, same as a district's first-ever entry) — never a field-level edit (see PLAN.md). The
// deleted rows aren't actually lost: the full JSON of what was deleted goes into this event's
// audit_log metadata, so "cannot be deleted" holds even though the district's active ledger goes
// back to empty.
export const POST = withErrorHandling("admin/reset-district", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { districtId, reason } = (await req.json()) as { districtId?: unknown; reason?: unknown };
  if (typeof districtId !== "number") {
    return NextResponse.json({ error: "districtId is required" }, { status: 400 });
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json({ error: "A reason for resetting is required" }, { status: 400 });
  }

  const db = getDb();
  const priorEntries = await db.select().from(pacDues).where(eq(pacDues.districtId, districtId));
  if (priorEntries.length === 0) {
    return NextResponse.json({ error: "This district has no submitted entries to reset" }, { status: 404 });
  }

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
    db.delete(pacDues).where(eq(pacDues.districtId, districtId)),
    auditLogInsert(db, {
      eventType: "district_reset",
      actorRole: "admin",
      actorEmail: admin?.email,
      actorName: admin?.name,
      actorDesignation: admin?.designation,
      districtName: district?.districtName,
      metadata: { reason: reason.trim(), priorEntries },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
