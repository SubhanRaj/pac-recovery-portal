# CLAUDE.md — PAC Recovery Portal

Instructions for AI agents working in this repo. [.agents/AGENTS.md](./.agents/AGENTS.md) has the
core directives (stack limits, no new frameworks without permission, no schema/math changes
without instruction) — read that too. See [README.md](./README.md) for what the system does,
[SECURITY.md](./SECURITY.md) for the security architecture, [DEPLOY.md](./DEPLOY.md) for
production state and deploy commands, and [TESTING.md](./TESTING.md) for how to test a change.
This file documents rules to preserve, not a build log.

## What this is

Government portal (Excise Dept., Uttar Pradesh) tracking recovery of dues from cases originating
up to FY ending 31-Mar-2019, across 75 districts. District Excise Officers (DEOs) submit recovery
figures every month; an Admin reviews, exports, and can unlock a district's period for re-entry.
One Next.js app on `@opennextjs/cloudflare`, backed by Cloudflare D1 via Drizzle, with HttpOnly
cookie sessions and magic-link admin auth. Keep changes in the spirit of the codebase: the
smallest diff that works, matching existing conventions rather than inventing new ones.

## Repo shape

The whole app — UI pages *and* `/api/*` route handlers — lives under `api/` (one Next.js Worker,
deployed via `@opennextjs/cloudflare`). Don't be surprised that `api/app/deo-data-entry/page.tsx`
is a UI page, not an API route — everything under `api/app/api/` is the actual API surface;
everything else under `api/app/` is a page.

**Never run a destructive Wrangler D1 command with `--remote`, and never `wrangler deploy`/push to
`main`, without the user explicitly saying so for that specific change.** Local `--local` D1 work
and local testing (`pnpm run preview`) don't need to ask. This project has live production data and
real government users; the user has been explicit and repeated about this boundary — treat every
remote/deploy action as requiring a fresh go-ahead, not a standing one from a past turn.

## Data model

See [README.md](./README.md)'s Data model section and `api/db/schema.ts` (inline comments there
are the authoritative reasoning) for the full column reference. Rules to preserve:

- **District names are current official names** (`Prayagraj` not `Allahabad`, `Lakhimpur Kheri`
  not `Kheri`).
- `districts.totalDues`/`collectedTillDate` are the one-time, department-sourced, read-only
  baseline for cases originating up to FY ending 31-Mar-2019 — never computed or DEO-editable,
  never re-entered per period. `NULL` for districts the department hasn't yet supplied figures
  for.
- **Lock state is per `(district, period)` on `pac_dues`, not district-lifetime.** A district can
  have many `pac_dues` rows over time, each independently locked/unlocked. Any new route touching
  lock state must take a `period`, never assume "the" lock state for a district.
- **`pac_dues.openingBalance`/`netRecoverable` are computed server-side only**, never trusted from
  the client — `openingBalance` chains from the previous period's `netRecoverable` (or
  `totalDues − collectedTillDate` for a district's first period). See `lib/dues-fields.ts`'s
  `computeNetRecoverable()`.
- **`pac_dues.rcCount`/`rcAmount`/`rcDetails`** (RC — Recovery Certificate — issued against
  defaulters this period) are purely informational: they never enter
  `computeNetRecoverable()` — an RC is issued to inform a defaulter what they owe, regardless of
  what's recovered. `rcDetails` is a JSON-stringified `RcDetail[]` (`lib/dues-fields.ts`) whose
  amounts must sum to `rcAmount`, enforced server-side (`validateRcDetails()`, called from the
  submit route) — never trusted from the client.
- No "Open Next Period" mechanic exists yet — opening a district's next monthly period is a
  manual admin action, not automatic. Building it is real, undone work, not a documentation gap.
- **`Demo District`** is a real row, used only for pre-launch end-to-end testing.
  `/api/admin/truncate-demo-data` is hardcoded server-side to `district_name = 'Demo District'` —
  never parameterize this route, the whole point is that it's physically incapable of deleting a
  real district even given a bad request body.
- **Data-entry scope**: only dues from cases originating up to FY ending 31-Mar-2019 are tracked
  here — a static bilingual disclaimer banner on the DEO data-entry page, not a live date check
  (dues can predate the 1970s). Recovery *entries* happen in real time, monthly; the underlying
  dues stock itself never grows — don't build anything that lets a DEO or admin add new dues.

## Auth

See [README.md](./README.md)'s DEO Flow / Admin Flow / API sections for the request-level
overview. Rules to preserve:

- **Session is an HttpOnly/Secure/SameSite=Lax cookie** (`__deo_session`/`__admin_session`,
  `lib/session.ts`, signed via `jose`), not a shared-secret header — UI and API are a true single
  origin, so there's no `X-API-Secret`-style coarse filter and no CORS handling needed
  (`middleware.ts` is a documented no-op, kept only because the filename is load-bearing under
  this Next.js version).
- **DEO login** (`/api/auth/verify-cug`) is CUG-hash verification — the 10-digit CUG mobile number
  is SHA-256-hashed client-side (`lib/crypto.ts`) before it ever leaves the browser; the server
  only ever sees and stores the hash (`users.cugHash`).
- **Admin login is magic-link email** (`/api/auth/request-magic-link` → Resend →
  `/api/auth/verify-magic-link`), not a PIN. `RESEND_API_KEY`/`FROM_EMAIL`/`FRONTEND_URL` are
  Wrangler secrets, not `wrangler.jsonc` vars.
- `requireSession(req, role)` (`lib/auth-guard.ts`) is the one place session verification happens
  — any new route touching DEO or admin data must call it, exactly like every existing route does.
  Don't let a new route trust `body.districtId`/`body.id` on its own.
- **One owner-tier gate, everything else is equal privilege.** Every admin can lock/unlock
  districts, view data, and export, same as always — the only owner-only surface is
  `/admin/users` (reachable from the profile pill dropdown, "Manage Admins") and its
  `/api/admin/users*` routes, gated by `isOwnerEmail()` (`lib/auth-guard.ts`): the signed-in
  admin's email must match the `OWNER_EMAIL` Wrangler secret. Ordinary admins don't see the link
  and get `403` if they hit the API directly — the whole point is that other officers never see
  each other's identities. Server-side also blocks removing your own account or the last
  remaining admin. There is still no bulk DEO provisioning.
- Rate limiting: `checkIpRateLimit()` (`lib/rate-limit.ts`, D1-backed `login_attempts` table) on
  CUG verify; a separate per-user check inside `request-magic-link`'s own route (keyed by
  `magicLinkTokens`, not IP) so a magic-link flood can't also block every admin's real login.

## Security

See [SECURITY.md](./SECURITY.md) for the full security architecture (session auth, PII handling,
rate limiting, server-side trust boundaries). The one rule worth repeating here since it's easy to
violate by accident: **never commit anything under `scripts_and_data/` that isn't already
gitignore-excluded by pattern** — check `.gitignore`'s `scripts_and_data/*.sql`, `*.csv`, `*.txt`,
`*.py`, `*hash*`, and `scripts_and_data/backups/` rules before adding a new data-processing script
or export there; if a new file type doesn't match an existing pattern, add the pattern rather than
committing the file.

## Validation rules

1. **Anti-blank rule**: DEO-input fields (`recoveredThisPeriod`, all count/amount pairs) start
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
4. **RC Details must reconcile**, enforced server-side (`validateRcDetails()` in
   `lib/dues-fields.ts`, called from the submit route): if `rcCount > 0`, exactly that many
   `RcDetail` rows are required and their `rcAmount`s must sum to the period's `rcAmount`.
5. **Two-step lock confirm**: a plain "are you sure" dialog (`confirmFinalSubmit()`), then the
   name-entry + liability-disclaimer prompt (`promptDeoNameAndLock()`) — both in `lib/alerts.ts`.
   Don't collapse this back to one dialog — the split is deliberate, it gives a DEO a genuine
   second chance to cancel before the irreversible name-entry step.

## UI conventions

- **Language**: bilingual Hindi/English in the DEO-facing form (`app/deo-data-entry/page.tsx`) —
  this mirrors the actual government form. Admin-facing UI chrome stays English-only. Don't strip
  Hindi from DEO-facing field labels. The Hindi field labels in `lib/dues-fields.ts` are
  user-confirmed government-form language, not a draft.
- **Feedback split**: field-level errors render inline; multi-field/non-field-specific validation
  errors use a SweetAlert2 **toast** (`notifyToast()`); blocking confirms before an irreversible
  action (lock, admin unlock, truncate-demo, logout) use a SweetAlert2 **modal**. Don't add a new
  blocking modal for a routine validation message; don't add a new inline banner for an
  irreversible-action confirm.
- **No emojis anywhere in the UI** — Tabler Icons (webfont) only.
- **₹ prefix** on every financial amount, Indian Lakh/Crore grouping via Cleave.js
  (`components/PacFieldInput.tsx`) on DEO-input money fields — don't hand-roll number formatting.
- **Excel export uses ExcelJS, not a SheetJS-family library** (`lib/export.ts`) — `xlsx`/
  `xlsx-js-style`'s community core silently drops frozen-pane and print-layout XML. If you touch
  `exportDistrictsToXlsx()`, verify any page-setup/frozen-pane change with a real unzip-and-grep of
  the generated `.xlsx` (`<pane .../>`, `<pageSetup .../>` in `xl/worksheets/sheet1.xml`), not
  just "no error thrown."
- Destructive/irreversible admin actions (unlock, truncate-demo) use a red (`#dc2626`) confirm
  button and Hindi cancel text, matching the DEO-side lock/logout dialogs.

## Deployment & CI/CD

See [DEPLOY.md](./DEPLOY.md) for the full production resource table, CI/CD wiring, and redeploy
commands. The one wiring detail worth repeating here: `pacrecovery.exciseup.in` is a Cloudflare
Workers **Custom Domain** (`custom_domain: true` in `api/wrangler.jsonc`'s `routes`, not a plain
path-pattern route) — this auto-provisions its own DNS record on `wrangler deploy`. A plain
`{ pattern, zone_name }` route does **not** create DNS and requires a record to already exist for
the hostname to ever reach Cloudflare's edge — don't switch to that form without adding the DNS
record manually.

## Known gaps / intentionally out of scope

- This repo has no pre-commit hook enforcing the `scripts_and_data/` gitignore rules above — a
  violating file only gets caught by review.
- Bulk DEO provisioning and an "Open Next Period" mechanic (opening a district's next monthly
  period today is a manual admin action) are still out of scope for now.
