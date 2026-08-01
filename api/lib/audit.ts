import { auditLog } from "@/db/schema";
import type { getDb } from "@/lib/db";

type AuditEntry = {
  eventType: string;
  actorRole?: "admin" | "deo" | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorDesignation?: string | null;
  districtName?: string | null;
  metadata?: Record<string, unknown>;
};

// Returns an insertable statement rather than awaiting itself, so callers with an existing
// db.batch() (e.g. the lock/unlock routes) can fold the audit row into the same atomic batch
// instead of a separate round trip.
export function auditLogInsert(db: ReturnType<typeof getDb>, entry: AuditEntry) {
  return db.insert(auditLog).values({
    eventType: entry.eventType,
    actorRole: entry.actorRole ?? null,
    actorEmail: entry.actorEmail ?? null,
    actorName: entry.actorName ?? null,
    actorDesignation: entry.actorDesignation ?? null,
    districtName: entry.districtName ?? null,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    createdAt: new Date().toISOString(),
  });
}
