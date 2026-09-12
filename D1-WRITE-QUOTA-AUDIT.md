# D1 Write-Quota Risk Audit

**Status: fixed.** All four findings below now wrap their non-essential audit-log insert (or, for
the audit-log GET, the retention purge) in `try/catch` so a D1 write-quota failure there can't
turn an already-successful essential write into a visible 500. No schema or data change — code
only.

Triggered by a 2026-09-12 production incident in the sibling `up-excise-spatial-revenue-optimizer`
project: Cloudflare D1's account-wide daily write-row quota (100,000 rows/day, shared across every
D1 database on the account) was exhausted, breaking login and other features across that app. Three
code patterns caused it there. This repo's `excise-bakaya-db` is one of five D1 databases on the
same Cloudflare account, sharing the same quota pool, so this audit checks this codebase for the
same three patterns.

This document only reports what was found. It does not fix anything.

## Patterns checked

1. A write that fires on an ordinary page load, GET request, or component-mount effect, rather
   than a deliberate one-time user action.
2. A read endpoint that runs an unconditional write (cleanup, cache-warming, etc.) before its
   actual read, with no `try/catch` — a failed write blocks a read that would otherwise succeed.
3. Two related writes as separate unguarded `await` calls, where the first is essential and the
   second is not, so a failure in the second turns a real success into a visible error.

## Findings

### 1. Audit-log GET runs an unconditional purge before every read

`api/app/api/admin/audit-log/route.ts:23`:

```ts
const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff));
```

This `DELETE` runs before the `SELECT` on every call to `GET /api/admin/audit-log`, with no
`try/catch`. `api/app/admin/audit/page.tsx:128` calls this route once on every mount of
`/admin/audit`, so the delete statement runs on every visit to that page, not just once per
45-day cycle. `withErrorHandling` (`api/lib/with-error-handling.ts`) catches the exception if the
delete fails, but at that point the handler has already returned before reaching the `SELECT` —
the whole request comes back as a 500, and the audit log page shows nothing, even though the read
itself would have succeeded.

This is the same shape as the retention-purge-before-read bug that blanked an admin page in the
sibling project.

### 2. Login routes: session established, then a separate unguarded audit write

`api/app/api/auth/verify-magic-link/route.ts:34-51`:

```ts
await db
  .update(magicLinkTokens)
  .set({ usedAt: new Date().toISOString() })
  .where(eq(magicLinkTokens.id, row.id));

const sessionToken = await signSession({ ... });

await auditLogInsert(db, { eventType: "login_magic_link", ... });
```

The token is marked used (line 34-37) — an essential, irreversible write, since a magic link is
single-use — and then a separate `await auditLogInsert(...)` (line 45) runs unguarded. If that
insert throws (e.g. quota exhausted), the exception propagates to `withErrorHandling`, which
returns a 500 before the session cookie is ever set. The token is already consumed, so the login
attempt is now unrecoverable — the user must request an entirely new magic link — even though
their original one was valid and the login should have succeeded.

`api/app/api/auth/verify-cug/route.ts:57-64` has the same shape: the CUG hash lookup already
succeeded (a valid credential), and a separate unguarded `await auditLogInsert(...)` runs after
it, before the response is built. A login session here has no DB row of its own (`lib/session.ts`
signs a stateless JWT), so there's no already-written row left stranded the way there is in
`verify-magic-link` — but a failing audit insert still turns a valid credential check into a
visible 500, forcing a retry.

### 3. Admin-user CRUD: essential write, then a separate unguarded audit write

`api/app/api/admin/users/route.ts` has the same split in all three handlers:

- `POST` (create): `db.insert(users)` at line 61-64, then a separate `await auditLogInsert(...)`
  at line 66-73.
- `PATCH` (update): `db.update(users)` at line 121, then a separate `await auditLogInsert(...)` at
  line 123-130.
- `DELETE`: `db.batch([...])` at line 153-156 (already atomic for the two deletes it contains),
  then a separate `await auditLogInsert(...)` at line 158-165.

In each case, if the audit insert throws, the admin-user row has already been created, updated, or
deleted, but the caller receives a 500 and has no way to tell the mutation happened. On create,
retrying would hit the `409` email-collision check for a row that already exists; on delete, the
target is already gone but the UI reports failure.

## What's already correct, for contrast

Every other route that does an essential write plus an audit-log write folds both into one
`db.batch([...])` call, so they succeed or fail together and the audit write can never mask (or be
silently lost after) the essential one:

- `api/app/api/pac-dues/submit/route.ts:107-128`
- `api/app/api/admin/reset-district/route.ts:46-57`
- `api/app/api/deo/request-reset/route.ts:49-63`
- `api/app/api/admin/unlock-requests/resolve/route.ts:63-80`
- `api/app/api/admin/truncate-demo-data/route.ts:42-55`

`api/app/api/auth/logout/route.ts:41` already guards its own audit insert with `.catch(() => {})`,
so a failed logout audit write can't block sign-out.

## Pattern 1 — not found

No write fires on an ordinary page load or component-mount effect. Every `useEffect` found in
`api/app/**/*.tsx` (checked in `page.tsx`, `deo-data-entry/page.tsx`, `admin/audit/page.tsx`,
`admin/districts/page.tsx`, `admin/districts/detail/page.tsx`, `admin/unlock-requests/page.tsx`,
`admin/users/page.tsx`) only calls `GET` endpoints. There is no recurring acknowledgment/reminder
modal in this codebase, and no analytics-on-load write.

## Recommended fixes

For each finding above, match the `db.batch([...])` pattern this codebase already uses everywhere
else for an essential write + its audit-log row:

- `auth/verify-magic-link/route.ts`: batch the `magicLinkTokens` update with the
  `auditLogInsert(...)` call instead of two separate `await`s.
- `auth/verify-cug/route.ts`: there's no second essential write to batch this against (login here
  produces no DB row). Wrap the `auditLogInsert(...)` call in `try/catch` (or `.catch(() => {})`,
  matching `auth/logout/route.ts:41`) so a failed audit write can't block a valid login.
- `admin/users/route.ts`: batch each handler's essential write (`insert`, `update`, or the
  existing `batch([...])` in `DELETE`) together with its `auditLogInsert(...)` call.
- `admin/audit-log/route.ts`: wrap the retention `delete` in `try/catch` so a failed purge is
  skipped rather than blocking the `SELECT` that follows it — the same fix applied to the
  equivalent route in the sibling project.
