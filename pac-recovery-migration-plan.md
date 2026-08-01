# PAC Recovery Portal — migration plan (from `excise-bakaya-record`)

Plan only — nothing in this document has been executed. Written by an agent working from both
this repo and the sibling `excise-revenue-recovery-portal` repo, at the user's request, before any
code/schema/deploy changes are made.

## TL;DR

This repo (currently "UP Excise Bakaya Tracker", a hand-rolled static-HTML + single-`worker.js`
app on Cloudflare Pages + Workers, `excisebakaya.exciseup.in`... actually **not yet on a custom
domain today** — see §0) gets repurposed and rebuilt as **PAC Recovery Portal**
(`pacrecovery.exciseup.in`), matching `excise-revenue-recovery-portal`'s current shape 1:1:
one Next.js app on `@opennextjs/cloudflare`, one Cloudflare Worker, one D1 binding, HttpOnly
cookie session auth, Drizzle ORM, no Cloudflare Pages anywhere. Same repo, same D1 database
(`excise-bakaya-db`, id `667be1f3-7612-45c6-91e9-0a40a451c6ea`) — **reused, never recreated**.
The domain's data model isn't a 5-financial-year loop like the reference project's `pac_data` —
it's one snapshot per district — so this is a **framework/practices port**, not a literal
copy-paste of every reference file. §3 below is the part that needs your sign-off most: it maps
old columns → new schema and calls out what doesn't carry over 1:1.

**Non-negotiable, per your instruction**: the existing `excise_dues` table (59 real districts,
real `total_dues`/`collected_till_date`/etc. figures, real `cug_hash`/`deo_email`, already live on
remote D1) is **only ever read from and inserted from** during this migration. No `UPDATE`, no
`DELETE`, no `DROP` against it, ever, as part of this plan — see §5.

## 0. Correction to your framing — worth confirming before we go further

You described this as "make it Workers-based (no Pages), same as pacrecovery's subdomain can be
set with wrangler since CF is the nameserver for exciseup.in" — that's exactly right for the new
portal. But I want to flag one thing I found while reading this repo that your message didn't
mention: **`excise-bakaya-record` is *already* two deployments today** (Cloudflare Pages for
`frontend/`, a separate Worker for `api/`), same shape `excise-revenue-recovery-portal` was in
*before* its own Milestone 41 merge — just without a custom domain wired up yet (`wrangler.toml`'s
`FRONTEND_URL` is still a bare `*.pages.dev` URL, and CORS is `SameSite=None`/cross-site, per
§8 of `v2plan.md`). So this migration is doing the same two things at once that the reference
project's Milestone 41 did separately: (a) collapsing two deployments into one Worker, and
(b) putting it on a real custom domain for the first time. Both are exactly what you asked for —
just flagging that this repo hasn't been through its own "Milestone 35" yet, so there's no
existing Pages custom domain to fight a Worker Route for priority against (unlike the reference
project's actual cutover) — the very first deploy of the new Worker with `pacrecovery.exciseup.in`
routed to it should just work cleanly, no domain-priority race like last time.

## 1. Identity

| | Old | New |
|---|---|---|
| Product name | UP Excise Bakaya Tracker | **PAC Recovery Portal** |
| Domain | none (Pages `*.pages.dev` + Workers `*.workers.dev`) | `pacrecovery.exciseup.in` |
| Deployment | Pages (`frontend/`) + Worker (`api/`), two separate GH Actions jobs | one Cloudflare Worker |
| Repo | this repo, kept as-is (path, not renamed) | same — mirrors how `excise-revenue-recovery-portal`'s own `api/` directory name stayed "historical" rather than being renamed when its scope grew; renaming a repo you have open elsewhere, have deploy hooks pointed at, etc. is a bigger, separate ask than this migration |
| Worker name (`wrangler.jsonc` `name`) | `excise-bakaya-api` | proposed: `pac-recovery-portal` — **your call, flag if you want something else** |
| D1 database | `excise-bakaya-db` (`667be1f3-7612-45c6-91e9-0a40a451c6ea`) | **same database, same id — reused, not recreated** |

Naming note: the reference project's own `CLAUDE.md` already uses "PAC" for a different thing —
its `pac_data` table / "PAC/RC recovery data" (Public Accounts Committee too, per your
explanation). That's not a collision to worry about (separate D1 databases, separate Workers,
separate domains) but worth knowing going in: two sibling portals will both use "PAC" in their
name/docs for the same underlying government body, describing two different datasets that get
presented to it. I'd suggest this repo's docs always say "PAC Recovery Portal" (the product name)
and never shorten to bare "PAC portal" in cross-project notes, so a future agent working across
both repos doesn't conflate them.

## 2. Target architecture (mirrors `excise-revenue-recovery-portal` exactly)

- One Next.js (App Router) app, built with `@opennextjs/cloudflare`, deployed as a single
  Cloudflare Worker serving both UI pages and `/api/*` route handlers — no `output: "export"`,
  same "SSR shell that behaves like a SPA" approach (UI routes prerender as static shells that
  hydrate client-side; `/api/*` stays dynamic).
- Drizzle ORM against the same D1 binding, replacing every hand-written `env.DB.prepare(...)` SQL
  string in `api/worker.js` — same `db/schema.ts` + `drizzle/*.sql` migration-file pattern.
- Two `HttpOnly; Secure; SameSite=Lax` session cookies (`__admin_session` / `__deo_session`),
  same-origin, no CORS needed at all (this repo's current cross-origin CORS/`SameSite=None`
  dance in `worker.js` goes away entirely, same reasoning as the reference project's own
  "Why cookies again" section — real win here since `SameSite=None` third-party-cookie risk was
  already flagged as an open, unaddressed trade-off in this repo's own `v2plan.md` §8).
- `withErrorHandling()`-style wrapper, `lib/` folder shape, dark mode, Tailwind CDN, SweetAlert2
  confirm patterns, `Button`/`Select` shared components — same conventions, ported wholesale
  rather than reinvented, per your "same design, practices" instruction.
- CDN-loaded libraries preferred where the reference project already does that (Tailwind,
  SweetAlert2, Chart.js if used, Tabler Icons); ExcelJS is already CDN-loaded in this repo's
  current `admin.html` too (per `v2plan.md` §10), so that's not even a change.
- No Cloudflare Pages project created at any point in this migration.
- **Package manager is pnpm** — this repo's `api/` already uses it (`pnpm-lock.yaml`,
  `pnpm-workspace.yaml`), matching every sibling project including the reference repo; no npm/yarn
  lockfile exists anywhere in this repo today, so there's nothing to migrate away from — just keep
  using `pnpm install`/`pnpm run <script>` in the merged app and in CI (`pnpm/action-setup@v4` +
  `pnpm install --frozen-lockfile`, same as the reference project's `ci.yml`/`deploy.yml`).

## 3. Domain model — REVISED per your 2026-08-01 direction (supersedes the original translation below)

**This is no longer a single-snapshot domain.** Per your instruction, PAC Recovery Portal launches
fresh and tracks recovery **every month**, admin-locked/unlocked per month, not once-ever — closer
in shape to the reference project's per-FY `pac_data` than the original plan assumed, just with
**months as the recurring period instead of financial years**, and **no new dues accruing each
period** (the department's one-time seeded figure is the only "gross arrears" input; DEOs enter
recovery/write-offs/stays against it going forward, they don't re-enter a dues figure).

**Scope, per your answers**: all **75 districts** (matching `excise-revenue-recovery-portal`'s
list, not just this repo's 59) — the 16 districts with no `excise_dues` row simply start with a
`NULL` baseline until the department supplies their figures. Admin PIN → **magic-link** (full
port). **Full feature set** ported: audit log, DEO self-service unlock requests, owner-gated
`/admin/users`, bulk DEO provisioning, per-district detail page for every district. Old
`excise-bakaya-form`/`excise-bakaya-api` deployment is **discarded**, not kept in parallel, once
the new portal is verified live.

### `districts` (75 rows — mirrors reference's `districts` almost verbatim, plus the one-time baseline)
```ts
export const districts = sqliteTable("districts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtName: text("district_name").notNull().unique(),
  // One-time, department-sourced, never DEO-editable, never re-entered per period — same
  // "read-only, Excel-sourced" rule as this repo's original total_dues/collected_till_date.
  // NULL for the 16 districts this repo's Excel export doesn't cover yet.
  totalDues: real("total_dues"),
  collectedTillDate: real("collected_till_date"),
  // NOTE: lockStatus/unlockedAt/unlockReason/unlockedBy moved OFF districts and onto pac_dues
  // below — lock is now a per-(district, period) action, not a lifetime-once one, unlike the
  // reference project's districts.lockStatus (see CLAUDE.md: "a district's lock is one atomic
  // action across all 5 years" — that assumption does NOT carry over here).
});
```

### `users` (mirrors reference's `users` almost verbatim — no per-user lock fields, see above)
```ts
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["deo", "admin"] }).notNull().default("deo"),
  email: text("email").unique(),
  cugHash: text("cug_hash").unique(),
  districtId: integer("district_id").references(() => districts.id),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  name: text("name"),          // admin-only in practice, per reference project's convention
  designation: text("designation"),
});
```

### `pac_dues` (new table — the recurring monthly snapshot; was the rest of `excise_dues`, now period-keyed)
```ts
export const pacDues = sqliteTable("pac_dues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtId: integer("district_id").notNull().references(() => districts.id),
  period: text("period").notNull(), // "YYYY-MM", e.g. "2026-08"

  // Computed server-side only, never trusted from the client (same posture as the reference
  // project's openingBalance). = districts.totalDues - districts.collectedTillDate for a
  // district's FIRST period ever; = the previous period's netRecoverable for every period after.
  openingBalance: real("opening_balance").notNull(),

  // DEO-entered, scoped to just this one period (NOT cumulative like the old collected_after_date):
  recoveredThisPeriod: real("recovered_this_period").default(0),
  batteKhatteCount: integer("batte_khatte_count").default(0),
  batteKhatteAmount: real("batte_khatte_amount").default(0),
  courtCaseCount: integer("court_case_count").default(0),
  courtStayedAmount: real("court_stayed_amount").default(0),

  // Computed server-side only: max(0, openingBalance - recoveredThisPeriod - batteKhatteAmount
  // - courtStayedAmount). Becomes the NEXT period's openingBalance.
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
```
`lib/dues-fields.ts` (equivalent of the reference's `lib/pac-fields.ts`) owns
`computeNetRecoverable()` (the one formula above, called from both the submit route and the DEO's
live draft UI) and field order/labels — same "single source of truth" rule.

**DECIDED 2026-08-01 (provisional — revisit once real monthly usage patterns are known): option
(a), explicit Admin action.** An "Open [Month] Recovery Cycle" admin action creates an unlocked
`pac_dues` row for every district, carrying `openingBalance` from each district's latest locked
period. No Cron Trigger. Chosen because it's simplest to reason about today and avoids a scheduled
job writing financial rows with no human in the loop — the user's explicit caveat is that this
isn't a final call, just what's easiest to build first; the automatic-cron alternative (option b
below) stays on the table if manual rollover proves to be a recurring admin chore.

### Reused as-is from the reference project (no domain translation needed)
- `magicLinkTokens` — needed now (Admin auth confirmed moving to magic-link).
- `auditLog` — generic, ports directly; metadata should include `period` for pac_dues-related events.
- `unlockRequests` — gets a `period` column added (a DEO requests unlock for a specific month, not
  the district for all time).
- `loginAttempts` — ports directly, same as originally planned.

### What's explicitly dropped, not ported
- `FINANCIAL_YEARS` / any 5-year loop, `rc_details` JSON breakdown — reference-specific, no
  equivalent concept here (this domain's periods are months, and there's no per-RC breakdown).

## 4. UI/API port checklist

| Reference file | Ports to | Notes |
|---|---|---|
| `app/login/page.tsx` | `app/login/page.tsx` | Merge `login.html` (DEO CUG) + `admin-login.html` (Admin PIN) into one tabbed page, reference-style — **only if** Admin auth moves to magic-link (§6); otherwise Admin tab keeps a PIN field, not an email field |
| `app/verify/page.tsx` | `app/verify/page.tsx` | Only needed if Admin moves to magic-link |
| `app/deo-data-entry/page.tsx` + `YearStepForm.tsx` | one new `app/deo-data-entry/page.tsx`, **no step-form** | Single-page form: District name (static heading, already done — `v2plan.md` §11), Total Dues (read-only), Collected Till Date (read-only baseline), Collected After Date, Batte Khatte Count/Amount, Court Case Count/Amount. Reuses reference's count/amount-synchrony inline validation pattern (already independently built here in `v2plan.md`'s last commit — good sign the practices already converged) |
| `app/page.tsx` / `MasterView.tsx` | not needed | No multi-year "master view" concept exists in this domain |
| `app/admin/page.tsx` (Dashboard) | `app/admin/page.tsx` | KPI cards (Districts/Locked/Unlocked/Total Dues/Net Recoverable), same Locked=green/Unlocked=red convention |
| `app/admin/districts/page.tsx` | `app/admin/districts/page.tsx` | Replaces `admin.html`'s DataTables+jQuery grid with the reference's TanStack Table pattern (sortable/searchable/paginated) — same functional result, modern dependency |
| `app/admin/districts/detail/page.tsx` | optional, new | This repo's `admin.html` currently shows everything in one flat table with no per-district drill-in. Adding a detail page is extra scope beyond feature-parity — see §6 |
| `lib/export.ts` (ExcelJS) | `lib/export.ts` | Smaller lift than usual: this repo already migrated `admin.html`'s export off SheetJS onto ExcelJS in `v2plan.md` §10, with real frozen panes/print setup already verified. Port the cell-building logic, adapt columns to the flat (non-FY) schema |
| `lib/client-db.ts` (Dexie) | `lib/client-db.ts` | This repo's Admin dashboard already uses Dexie caching per the README — port the wrapper, adapt table shape |
| `lib/auth-guard.ts`, `lib/session.ts` | same | Cookie-based session verify/sign, replacing `worker.js`'s hand-rolled `signToken`/`verifyToken` (keep the same HMAC-via-`crypto.subtle` approach — no new dependency, it already works and is unchanged in spirit, just moved into the shared Next.js route-handler shape) |
| `lib/rate-limit.ts` | same | D1-backed, replacing the in-memory `Map` |
| `lib/hash.ts` | same | `sha256Hex()` — this repo already does CUG hashing client-side before it ever leaves the browser (ahead of the reference project's own hashing helper in spirit); server-side hash comparison logic ports directly |
| `api/app/api/admin/audit-log/route.ts` etc. | same, if §6 scope includes audit log | |

## 5. D1 safety — explicit guarantees (your stated hard constraint)

1. **No new database.** `wrangler.jsonc`'s `d1_databases` binding points at the existing
   `excise-bakaya-db` / `667be1f3-7612-45c6-91e9-0a40a451c6ea` — copied byte-for-byte from
   `api/wrangler.toml`, not regenerated.
2. **`excise_dues` is never dropped, altered, or written to by this migration.** The new Drizzle
   tables (`districts`, `users`, `pac_dues`, ...) are created alongside it via
   `CREATE TABLE IF NOT EXISTS`, not a `DROP`+recreate.
3. **The data migration is INSERT-only, sourced by `SELECT` from `excise_dues`:**
   ```sql
   INSERT INTO districts (district_name)
     SELECT DISTINCT district_name FROM excise_dues;

   INSERT INTO users (role, email, cug_hash, district_id, locked_at, submitted_by_name, created_at)
     SELECT 'deo', e.deo_email, e.cug_hash, d.id, e.locked_at, e.deo_name, CURRENT_TIMESTAMP
     FROM excise_dues e JOIN districts d ON d.district_name = e.district_name
     WHERE e.cug_hash IS NOT NULL;

   INSERT INTO pac_dues (district_id, total_dues, collected_till_date, collected_after_date,
                          batte_khatte_count, batte_khatte_amount, court_case_count,
                          court_stayed_amount, total_dues_left, net_recoverable,
                          submitted_by_name, locked_at)
     SELECT d.id, e.total_dues, e.collected_till_date, e.collected_after_date,
            e.batte_khatte_count, e.batte_khatte_amount, e.court_case_count,
            e.court_stayed_amount,
            (e.total_dues - e.collected_till_date - e.collected_after_date),
            MAX(0, (e.total_dues - e.collected_till_date - e.collected_after_date)
                   - e.batte_khatte_amount - e.court_stayed_amount),
            e.deo_name, e.locked_at
     FROM excise_dues e JOIN districts d ON d.district_name = e.district_name;

   UPDATE districts SET lock_status = 1
     WHERE district_name IN (SELECT district_name FROM excise_dues WHERE is_locked = 1);
   ```
   (That last statement is an `UPDATE`, but only against the **brand-new** `districts` table this
   same migration just created — never against `excise_dues`.)
4. **Tested against local D1 only first**, exact same standing rule this repo's own `v2plan.md`
   has followed throughout ("nothing touches remote/live D1 until you say go") — verify row counts
   (59 districts, matching totals) against local before any `--remote` run.
5. Real `cug_hash`/`deo_email` values carry over unchanged (`SELECT`-copied, never rehashed/
   regenerated) — a DEO's existing login continues to work post-migration without re-provisioning.
6. Recommend a `wrangler d1 export --remote` backup of `excise-bakaya-db` before the remote
   migration step runs, same belt-and-suspenders step used for the reference project's own
   Milestone 41 (extra safety net, not a substitute for the INSERT-only guarantee above).
7. `excise_dues` stays in the database indefinitely after migration, as a read-only historical
   snapshot/backup — not scheduled for removal by this plan (see §6, open question, for whether
   you ever want it dropped later).

## 6. Open questions before implementation

1. **Admin auth: keep 4-digit PIN, or move to the reference's magic-link email flow?** Your "same
   design, practices" instruction points toward magic-link (also closes this repo's own flagged
   PIN-brute-force-surface concern more thoroughly than the existing 10-attempts/15-min throttle
   does) — but it's a real behavior change for whoever currently has the PIN. **My recommendation:
   move to magic-link**, matching the reference project exactly, since you said UI/logic should
   match "for now."
2. **Feature scope** — full reference parity (audit log, DEO self-service unlock requests, owner-
   gated multi-admin `/admin/users`, bulk DEO provisioning via template upload) vs. a leaner port
   matching this repo's current simpler feature set (single admin, manual unlock only, no bulk
   provisioning since districts/DEOs are already seeded)? **My recommendation: port audit log +
   self-service unlock requests** (cheap, no FY-dependent logic, directly reusable) but **skip
   multi-admin/`/admin/users` and bulk provisioning for v1** (both were built for the reference
   project's 75-district/multiple-admin reality; this repo's 59 districts already have DEOs
   seeded and there's currently one PIN/admin, so that machinery has nothing to do yet — easy to
   add later if PAC Recovery Portal ever grows a second admin).
3. **What happens to the current `excise-bakaya-form` Pages site + `excise-bakaya-api` Worker?**
   This plan is scoped to building the *new* `pacrecovery.exciseup.in` portal — it does not touch
   or retire the existing live deployment. Do you want the old one kept running in parallel
   indefinitely, or retired once the new portal is verified? (Out of scope for this plan either
   way — just flagging it's a separate decision, same as how the reference project's Pages
   removal was its own explicit later step, not assumed.)
4. **Worker name** (`pac-recovery-portal` proposed in §1) and **repo path** (kept as `excise-
   bakaya-record`, unrenamed, proposed in §1) — confirm both, or tell me what you'd rather call
   them.
5. **`/admin/districts/detail` drill-in page** — worth building now, or is the existing flat
   admin table (this repo's current pattern) good enough for a 59-row dataset? Leaning toward
   *skip for v1* — the reference project's version exists mainly to show 5 years of FY data per
   district, which doesn't exist here; a flat table search/filter probably already covers it.

## 7. Sequencing (once you sign off)

Same shape as the reference project's Milestone 41 branch workflow: new branch off `main`
(e.g. `migrate/pac-recovery-portal`), staged commits (schema+migration SQL first and verified
against local D1 before any UI work touches it, then app skeleton, then route-by-route port,
then CI/CD collapse, then `wrangler.jsonc` domain wiring), PR, your review, merge, then the actual
`pacrecovery.exciseup.in` cutover deploy watched closely the same way the last one was (checking
response headers, not just status codes, to confirm the new Worker is actually what's answering).

## 8. Verification checklist (before calling this done)

- [ ] Local D1 migration run, row counts match (59 districts, users, pac_dues) against `excise_dues`
- [ ] Every `excise_dues` figure spot-checked against its `pac_dues` counterpart for a sample of
      districts (totals, locked districts, cug_hash equality)
- [ ] `excise_dues` table still present and completely unmodified after migration (`SELECT count(*)`
      and a checksum/spot-diff against a pre-migration export)
- [ ] DEO login (CUG hash) works for a real seeded district against the new schema
- [ ] Admin login works (PIN or magic-link, per §6 decision)
- [ ] Lock/unlock round-trip works, matches old semantics (unlock clears lock_status only, doesn't
      touch `pac_dues` — same "unlock never clears data" rule as the reference project)
- [ ] Excel export produces a valid, real-Excel-openable file with frozen panes (same verification
      method already proven in this repo's `v2plan.md` §10 — unzip, grep the XML, don't just trust
      no error was thrown)
- [ ] `pacrecovery.exciseup.in` resolves to the new Worker (response headers, not just status code)
- [ ] No Cloudflare Pages project created at any point
- [ ] Old `excise-bakaya-form`/`excise-bakaya-api` deployment still running, untouched, per §6 Q3
