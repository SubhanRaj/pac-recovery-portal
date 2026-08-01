import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, users, pacDues, unlockRequests } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

// Hardcoded to district_name = 'Demo District', never parameterized — same rule as the old
// worker.js's /truncate-demo (see CLAUDE.md's "Demo District" section): this route is physically
// incapable of deleting a real district even given a bad request body.
const DEMO_DISTRICT_NAME = "Demo District";

// One-off admin housekeeping action — permanently deletes the Demo District row, its pac_dues
// rows, its unlock_requests, and the demo DEO's users row. Unlike the old worker.js, there's no
// separate DEMO_CUG-secret/prefix-exemption login mechanism to preserve here: the demo DEO's
// cug_hash migrated into `users` like every real DEO's, so it logs in through the ordinary
// verify-cug route — this endpoint only clears the *data* left over from the most recent demo run.
export const POST = withErrorHandling("admin/truncate-demo-data", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [demo] = await db
    .select()
    .from(districts)
    .where(eq(districts.districtName, DEMO_DISTRICT_NAME))
    .limit(1);

  if (!demo) {
    return NextResponse.json({ error: "No Demo District found — nothing to truncate." }, { status: 404 });
  }

  const [admin] = await db
    .select({ email: users.email, name: users.name, designation: users.designation })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  await db.batch([
    db.delete(pacDues).where(eq(pacDues.districtId, demo.id)),
    db.delete(unlockRequests).where(eq(unlockRequests.districtId, demo.id)),
    db.delete(users).where(eq(users.districtId, demo.id)),
    db.delete(districts).where(eq(districts.id, demo.id)),
    auditLogInsert(db, {
      eventType: "demo_data_truncated",
      actorRole: "admin",
      actorEmail: admin?.email,
      actorName: admin?.name,
      actorDesignation: admin?.designation,
      districtName: DEMO_DISTRICT_NAME,
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
