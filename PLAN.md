# PLAN — Immutable recovery ledger

Design record for the append-only `pac_dues` ledger that replaced the monthly-period/lock-unlock
model. Kept here (not just in chat) so the reasoning behind the schema survives past this change.
See [CLAUDE.md](./CLAUDE.md) for the rules this supersedes and [README.md](./README.md) for the
current-state description of the resulting flows.

## Why

The old model: one `pac_dues` row per `(district, period)`, `period` a `"YYYY-MM"` string. A DEO
submits once, the row locks (`lockStatus = 1`); the only way to change it again is an Admin
unlock, which clears the lock and lets the DEO overwrite the same row in place. The
"Open Next Period" mechanic that would ever create a *second* row per district was never built —
in production, every district has at most one `pac_dues` row for its whole life.

Requested instead: a DEO can submit a recovery update **any time, unlimited times**, and each
submission is permanent the instant it's saved — never edited, never deleted. Each new update
only builds on the last one downward (more recovery can reduce what's owed; nothing put in the
ledger is ever un-put). The monthly "period" concept goes away. Admin keeps one escape hatch —
reset a district back to its uploaded baseline — for genuine mistakes, but it's a full reset, not
a field-level edit, and the wiped history is preserved in `audit_log` rather than destroyed.

## Schema diff

`pac_dues`:
- **Dropped**: `period`, `district_period_unique` index, `lockStatus`, `lockedAt`, `unlockedAt`,
  `unlockReason`, `unlockedBy`. Every row that exists is final by construction — there's nothing
  left to lock/unlock per-row.
- **Unchanged**: `id`, `districtId`, `openingBalance`, `rcCount`/`rcAmount`/`rcDetails`,
  `recoveredThisPeriod`, `batteKhatteCount`/`Amount`, `courtCaseCount`, `courtStayedAmount`,
  `netRecoverable`, `submittedByName`, `createdAt`. `id` order (autoincrement, monotonic) is the
  ledger order — used in place of the old `period` string comparison everywhere "latest" was
  computed.

`unlock_requests`: dropped `period` (a reset request is district-level now). Table/column names
kept as `unlockRequests`/`unlockedBy` etc. — renaming identifiers project-wide for a naming
purity concern isn't worth the diff; only user-facing copy and route paths say "reset."

Since no district ever had more than one `pac_dues` row in production, dropping these columns
required no data migration.

## Route renames

- `POST /api/admin/unlock` → `POST /api/admin/reset-district` — body `{ districtId, reason }`
  (dropped `period`). Deletes every `pac_dues` row for the district and writes one `audit_log`
  entry (`district_reset`) whose `metadata.priorEntries` is the full JSON of what was deleted —
  this is how "cannot be deleted" holds even though the district's active ledger goes back to
  empty. A fresh submit after a reset chains its `openingBalance` from `districts.totalDues -
  districts.collectedTillDate` again, same as a district's very first-ever entry.
- `POST /api/deo/request-unlock` → `POST /api/deo/request-reset` — DEO-side escalation to ask an
  Admin to reset their district; no longer gated on a lock state (nothing to be locked out of).
- Audit event types: `district_locked` → `recovery_entry_submitted`; `district_unlocked` →
  `district_reset`; `unlock_requested`/`unlock_request_approved`/`unlock_request_denied` →
  `reset_requested`/`reset_request_approved`/`reset_request_denied`.

## Retention

`audit_log` prunes on read (`app/api/admin/audit-log/route.ts`'s `RETENTION_DAYS`) — originally
30 days, raised to **45 days** on 2026-08-21 specifically because a district reset's
`priorEntries` snapshot is the only place a wiped submission survives, and 30 days was judged too
short a window to keep that recoverable. If reset history ever needs to outlive 45 days,
`RETENTION_DAYS` is the one number to revisit.
