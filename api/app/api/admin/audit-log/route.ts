import { NextRequest, NextResponse } from "next/server";
import { desc, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { withErrorHandling } from "@/lib/with-error-handling";

const PAGE_SIZE = 100;
const RETENTION_DAYS = 30;

export const GET = withErrorHandling("admin/audit-log", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Opportunistic 30-day retention: prune on read rather than a separate cron trigger — this
  // page is the only consumer of the table, so there's no need for the rows to disappear the
  // instant they turn 30 days old, just before the next time anyone actually looks.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff));

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return NextResponse.json({ rows, page, pageSize: PAGE_SIZE });
});
