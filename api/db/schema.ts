import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// 75 districts (matches excise-revenue-recovery-portal's list). The 16 with no historical
// excise_dues row start with totalDues/collectedTillDate NULL until the department supplies
// figures — see pac-recovery-migration-plan.md §3.
export const districts = sqliteTable("districts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtName: text("district_name").notNull().unique(),
  // Gross dues from cases originating up to FY ending 31-Mar-2019 only — the portal's whole
  // scope is recovering that frozen pre-2019 stock, never new dues accrued from 1-Apr-2019
  // onwards. Same rule as the old excise_dues.total_dues (README's "Data-entry scope").
  totalDues: real("total_dues"),
  collectedTillDate: real("collected_till_date"),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["deo", "admin"] }).notNull().default("deo"),
  email: text("email").unique(),
  cugHash: text("cug_hash").unique(),
  districtId: integer("district_id").references(() => districts.id),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  name: text("name"),
  designation: text("designation"),
});

export const magicLinkTokens = sqliteTable("magic_link_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

// Recurring monthly snapshot, one row per (district, period). Lock/unlock now lives here
// (per-period) rather than on districts/users, unlike the reference project's lifetime-once
// district lock — see pac-recovery-migration-plan.md §3.
export const pacDues = sqliteTable("pac_dues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtId: integer("district_id").notNull().references(() => districts.id),
  period: text("period").notNull(), // "YYYY-MM"

  // Server-computed only, never trusted from the client: districts.totalDues -
  // districts.collectedTillDate for a district's first period, else previous period's
  // netRecoverable.
  openingBalance: real("opening_balance").notNull(),

  recoveredThisPeriod: real("recovered_this_period").default(0),
  batteKhatteCount: integer("batte_khatte_count").default(0),
  batteKhatteAmount: real("batte_khatte_amount").default(0),
  courtCaseCount: integer("court_case_count").default(0),
  courtStayedAmount: real("court_stayed_amount").default(0),

  // Server-computed only: max(0, openingBalance - recoveredThisPeriod - batteKhatteAmount -
  // courtStayedAmount). Becomes the next period's openingBalance.
  netRecoverable: real("net_recoverable").notNull(),

  lockStatus: integer("lock_status").notNull().default(0),
  lockedAt: text("locked_at"),
  submittedByName: text("submitted_by_name"),
  unlockedAt: text("unlocked_at"),
  unlockReason: text("unlock_reason"),
  unlockedBy: text("unlocked_by"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  districtPeriodUnique: uniqueIndex("district_period_unique").on(table.districtId, table.period),
}));

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(),
  actorRole: text("actor_role"),
  actorEmail: text("actor_email"),
  actorName: text("actor_name"),
  actorDesignation: text("actor_designation"),
  districtName: text("district_name"),
  metadata: text("metadata"), // JSON string, may include period for pac_dues events
  createdAt: text("created_at").notNull(),
});

export const unlockRequests = sqliteTable("unlock_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtId: integer("district_id").notNull().references(() => districts.id),
  period: text("period").notNull(), // "YYYY-MM" the DEO is requesting unlock for
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
  requestedAt: text("requested_at").notNull(),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
  adminNote: text("admin_note"),
});

export const loginAttempts = sqliteTable("login_attempts", {
  ipHash: text("ip_hash").primaryKey(),
  windowStart: text("window_start").notNull(),
  count: integer("count").notNull().default(1),
});
