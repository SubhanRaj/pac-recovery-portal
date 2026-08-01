# CLAUDE.md — PAC Recovery Portal

Instructions for AI agents working in this repo. [.agents/AGENTS.md](./.agents/AGENTS.md) has the
core directives (stack limits, no new frameworks without permission, no schema/math changes
without instruction) — read that too. See [README.md](./README.md) for what the system does and
[pac-recovery-migration-plan.md](./pac-recovery-migration-plan.md) for the full migration
reasoning (identity/naming, schema translation, D1 safety guarantees, what's dropped from the
reference project's feature set). [v2plan.md](./v2plan.md) is pre-migration history — the old
single-snapshot system this repo used to be, kept for context, not a to-do list. This file
documents rules to preserve, not a build log.

## What this is

Government portal (Excise Dept., Uttar Pradesh) tracking recovery of dues from cases originating
up to FY ending 31-Mar-2019, across 75 districts. District Excise Officers (DEOs) submit recovery
figures every month; an Admin reviews, exports, and can unlock a district's period for re-entry.
Migrated from **UP Excise Bakaya Tracker** — a static-HTML + Cloudflare Pages + hand-rolled Worker
app tracking one lifetime snapshot per district — into **PAC Recovery Portal**, a single Next.js
app on `@opennextjs/cloudflare`, mirroring the sibling `excise-revenue-recovery-portal` project's
architecture (Drizzle/D1, HttpOnly cookie sessions, magic-link admin auth). Keep changes in the
spirit both projects share: the smallest diff that works, matching the reference project's
conventions rather than inventing new ones.

## Repo shape

The whole app — UI pages *and* `/api/*` route handlers — lives under `api/` (one Next.js Worker,
deployed via `@opennextjs/cloudflare`). The directory is still called `api` for historical
reasons: it used to hold just the backend Worker before this migration, and the name stuck rather
than being renamed, same as the reference project's own `api/` directory. Don't be surprised that
`api/app/deo-data-entry/page.tsx` is a UI page, not an API route — everything under `api/app/api/`
is the actual API surface; everything else under `api/app/` is a page.

No `frontend/` Pages deployment anymore. **Retired 2026-08-01**: the old `excise-bakaya-form`
Cloudflare Pages project and `excise-bakaya-api` Worker are both deleted from Cloudflare (neither
was ever on a custom domain — see `pac-recovery-migration-plan.md` §0 — so this was a plain
`wrangler delete`/`wrangler pages project delete`, no DNS involved); the `frontend/` directory
itself is also deleted from this repo (still recoverable from git history, commit `8413e20` and
earlier, if ever needed). The shared D1 database (`excise-bakaya-db`) and every table in it,
including `excise_dues`, were **not** touched by this retirement — only the two old deployments
that served requests were removed.

**Never run a destructive Wrangler D1 command with `--remote`, and never `wrangler deploy`/push to
`main`, without the user explicitly saying so for that specific change.** Local `--local` D1 work
and local testing (`pnpm run preview`) don't need to ask. This project has live production data and
real government users; the user has been explicit and repeated about this boundary — treat every
remote/deploy action as requiring a fresh go-ahead, not a standing one from a past turn.

## Data model

See [README.md](./README.md)'s Data model section and `api/db/schema.ts` (inline comments there
are the authoritative reasoning) for the full column reference. Rules to preserve:

- **District names are current official names** (`Prayagraj` not `Allahabad`, `Lakhimpur Kheri`
  not `Kheri`) — carried over unchanged from the pre-migration `excise_dues` table.
- `districts.totalDues`/`collectedTillDate` are the one-time, department-sourced, read-only
  baseline for cases originating up to FY ending 31-Mar-2019 — never computed or DEO-editable,
  never re-entered per period. `NULL` for districts the department hasn't yet supplied figures
  for (16 of the 75, as of the migration).
- **Lock state is per `(district, period)` on `pac_dues`, not district-lifetime.** This is the one
  structural difference from both the pre-migration version (one submission ever) and the
  reference project (`districts.lockStatus`, one atomic 5-FY submit) — a district here can have
  many `pac_dues` rows over time, each independently locked/unlocked. Any new route touching lock
  state must take a `period`, never assume "the" lock state for a district.
- **`pac_dues.openingBalance`/`netRecoverable` are computed server-side only**, never trusted from
  the client — `openingBalance` chains from the previous period's `netRecoverable` (or
  `totalDues − collectedTillDate` for a district's first period). See `lib/dues-fields.ts`'s
  `computeNetRecoverable()`.
- **`pac_dues.rcCount`/`rcAmount`/`rcDetails`** (RC — Recovery Certificate — issued against
  defaulters this period) — ported back in from the reference project's `pac_data.rc_*` fields on
  2026-08-01, reversing the original migration plan's "explicitly dropped" call (§3). Purely
  informational: never enters `computeNetRecoverable()`, same as the reference project's own RC
  fields — an RC is issued to inform a defaulter what they owe, regardless of what's recovered.
  `rcDetails` is a JSON-stringified `RcDetail[]` (`lib/dues-fields.ts`) whose amounts must sum to
  `rcAmount`, enforced server-side (`validateRcDetails()`, called from the submit route) — never
  trusted from the client.
- No "Open Next Period" mechanic exists yet (provisionally decided as an explicit admin action,
  not a cron trigger — see migration plan §3, flagged as revisit-once-real-usage-is-known, not a
  final call). Building it is real, undone work, not a documentation gap.
- **`Demo District`** is a real row (migrated from `excise_dues` like any other), used only for
  pre-launch end-to-end testing. `/api/admin/truncate-demo-data` is hardcoded server-side to
  `district_name = 'Demo District'` — never parameterize this route, the whole point is that it's
  physically incapable of deleting a real district even given a bad request body.
- **Data-entry scope**: only dues from cases originating up to FY ending 31-Mar-2019 are tracked
  here — a static bilingual disclaimer banner on the DEO data-entry page, not a live date check
  (dues can predate the 1970s). Recovery *entries* happen in real time, monthly; the underlying
  dues stock itself never grows — don't build anything that lets a DEO or admin add new dues.

## Auth

See [README.md](./README.md)'s DEO Flow / Admin Flow / API sections for the request-level
overview. Rules to preserve:

- **Session is an HttpOnly/Secure/SameSite=Lax cookie** (`__deo_session`/`__admin_session`,
  `lib/session.ts`, signed via `jose`), not a shared-secret header — UI and API are a true single
  origin now, so there's no `X-API-Secret`-style coarse filter and no CORS handling needed
  (`middleware.ts` is a documented no-op, kept only because the filename is load-bearing under
  this Next.js version).
- **DEO login** (`/api/auth/verify-cug`) is CUG-hash verification — the 10-digit CUG mobile number
  is SHA-256-hashed client-side (`lib/crypto.ts`) before it ever leaves the browser; the server
  only ever sees and stores the hash (`users.cugHash`).
- **Admin login is magic-link email** (`/api/auth/request-magic-link` → Resend →
  `/api/auth/verify-magic-link`), not a PIN — a real behavior change from the pre-migration
  system, decided per the migration plan §6.1. `RESEND_API_KEY`/`FROM_EMAIL`/`FRONTEND_URL` are
  Wrangler secrets, not `wrangler.jsonc` vars.
- `requireSession(req, role)` (`lib/auth-guard.ts`) is the one place session verification happens
  — any new route touching DEO or admin data must call it, exactly like every existing route does.
  Don't let a new route trust `body.districtId`/`body.id` on its own.
- **No `isOwner`/`OWNER_EMAIL` concept** — the reference project's owner-gated multi-admin
  `/admin/users` and bulk DEO provisioning are out of scope for this version (migration plan
  §6.2). Every admin session has equal privileges.
- Rate limiting: `checkIpRateLimit()` (`lib/rate-limit.ts`, D1-backed `login_attempts` table) on
  CUG verify; a separate per-user check inside `request-magic-link`'s own route (keyed by
  `magicLinkTokens`, not IP) so a magic-link flood can't also block every admin's real login.

## Security

`scripts_and_data/contact.csv` (the department's real officer names + CUG mobile numbers) was
committed to this repo's history before `.gitignore` excluded `*.csv`/`*.txt`/`*.py` under that
directory. It was untracked and scrubbed from git history with `git-filter-repo` + force-push.
**Never commit anything under `scripts_and_data/` that isn't already gitignore-excluded by
pattern** — check `.gitignore`'s `scripts_and_data/*.sql`, `*.csv`, `*.txt`, `*.py`, `*hash*`, and
`scripts_and_data/backups/` rules before adding a new data-processing script or export there; if a
new file type doesn't match an existing pattern, add the pattern rather than committing the file.
The `scripts_and_data/backups/` rule specifically closes a gap found during this migration: D1
export backups taken there (real `cug_hash`/`deo_email` values) weren't actually covered by the
pre-existing `scripts_and_data/*.sql` pattern, since gitignore globs don't cross a `/` boundary —
the same class of leak as the CSV incident, caught before it happened this time.

## Validation rules

1. **Anti-blank rule**: DEO-input fields (`recoveredThisPeriod`, both count/amount pairs) start
   **blank**, never pre-filled with `0` — an explicit `0` must be typed deliberately. Submitting
   with any of these still blank is blocked by a SweetAlert2 toast (`notifyToast()` in
   `lib/alerts.ts`), never silently coerced to `0`. If you add a new DEO-input field, default it
   to `""`/blank and add it to the blank-check list in `app/deo-data-entry/page.tsx`'s
   `submitAll()`.
2. **DEO name** (`validateDeoName()` in `lib/alerts.ts`): rejects blank, digits (guards against a
   pasted CUG number), designation words ("DEO"/"officer"/"admin" etc. via whole-word regex), and
   non-letter characters.
3. **Math-safety submit gate**, enforced server-side (`app/api/pac-dues/submit/route.ts`) — the
   client-side preview mirrors it but the server never trusts it: rejects if
   `batteKhatteAmount > Total Dues Left` or
   `courtStayedAmount > (Total Dues Left − batteKhatteAmount)` — see README's Calculation Logic.
   Mirror this in any new deduction-style field pair.
4. **Two-step lock confirm**: a plain "are you sure" dialog (`confirmFinalSubmit()`), then the
   name-entry + liability-disclaimer prompt (`promptDeoNameAndLock()`) — both in `lib/alerts.ts`.
   Don't collapse this back to one dialog — the split is deliberate (matches both the reference
   project and the pre-migration version, gives a DEO a genuine second chance to cancel before the
   irreversible name-entry step).

## UI conventions

- **Language**: bilingual Hindi/English in the DEO-facing form (`app/deo-data-entry/page.tsx`) —
  this mirrors the actual government form. Admin-facing UI chrome stays English-only, matching the
  reference project's convention. Don't strip Hindi from DEO-facing field labels.
- The DEO-facing Hindi field labels in `lib/dues-fields.ts` were confirmed by the user on
  2026-08-01 — no longer a draft, treat as final government-form language until told otherwise.
- **Feedback split**: field-level errors render inline; multi-field/non-field-specific validation
  errors use a SweetAlert2 **toast** (`notifyToast()`); blocking confirms before an irreversible
  action (lock, admin unlock, truncate-demo, logout) use a SweetAlert2 **modal**. Don't add a new
  blocking modal for a routine validation message; don't add a new inline banner for an
  irreversible-action confirm.
- **No emojis anywhere in the UI** — Tabler Icons (webfont) only.
- **₹ prefix** on every financial amount, Indian Lakh/Crore grouping via Cleave.js
  (`components/PacFieldInput.tsx`) on DEO-input money fields — don't hand-roll number formatting.
- **Excel export uses ExcelJS, not a SheetJS-family library** (`lib/export.ts`) — `xlsx`/
  `xlsx-js-style`'s community core silently drops frozen-pane and print-layout XML, confirmed both
  here and in `excise-revenue-recovery-portal` by inspecting the actual output file. If you touch
  `exportDistrictsToXlsx()`, verify any page-setup/frozen-pane change with a real unzip-and-grep of
  the generated `.xlsx` (`<pane .../>`, `<pageSetup .../>` in `xl/worksheets/sheet1.xml`), not
  just "no error thrown."
- Destructive/irreversible admin actions (unlock, truncate-demo) use a red (`#dc2626`) confirm
  button and Hindi cancel text, matching the DEO-side lock/logout dialogs.

## Deployment & CI/CD

- `pacrecovery.exciseup.in` is a Cloudflare Workers **Custom Domain** (`custom_domain: true` in
  `api/wrangler.jsonc`'s `routes`, not a plain path-pattern route) — this auto-provisions its own
  DNS record on `wrangler deploy`, matching the sibling `up-excise-spatial-revenue-optimizer`
  project's `sro.exciseup.in` wiring. A plain `{ pattern, zone_name }` route does **not** create
  DNS and requires a record to already exist for the hostname to ever reach Cloudflare's edge —
  don't switch back to that form without re-adding the DNS record manually.
- `.github/workflows/ci.yml` — `tsc --noEmit` + `next build` on every push/PR touching `api/`.
- `.github/workflows/deploy.yml` — `pnpm run deploy` (OpenNext build + `wrangler deploy`) on push
  to `main`. Requires `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in GitHub Secrets.
- Remote Wrangler secrets (not `wrangler.jsonc` vars): `JWT_SECRET`, `RESEND_API_KEY`,
  `FRONTEND_URL`, `FROM_EMAIL`.

## Known gaps / intentionally out of scope

- Git history was scrubbed once (see Security above); it is not scrubbed automatically going
  forward — a future accidental commit of a gitignored-pattern-violating file still needs the same
  manual `git-filter-repo` + force-push treatment, this repo has no pre-commit hook preventing it.
- Multi-admin `/admin/users`, bulk DEO provisioning, and a district-detail drill-in beyond the
  per-period table are all out of scope for this version — see migration plan §6.2/§6.5. Easy to
  add later if the portal grows past one admin/59-district seeding.
