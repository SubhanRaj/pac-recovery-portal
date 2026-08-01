# Security

Security architecture and PII protections for the PAC Recovery Portal. See
[CLAUDE.md](./CLAUDE.md) for the broader set of rules an AI agent must follow; this doc is the
security-specific detail.

## Session auth

- Sessions are HttpOnly, Secure, SameSite=Lax cookies (`__deo_session`/`__admin_session`,
  `api/lib/session.ts`), signed as a JWT via `jose` (`JWT_SECRET`, a Wrangler secret). Two
  separate cookie names so a DEO and Admin session can coexist in the same browser.
- No client-side JS ever touches the session token — HttpOnly guarantees that. No
  `X-API-Secret`-style shared-secret header exists anywhere; UI and API are a single origin, so
  there's no CORS surface either (`middleware.ts` is a documented no-op).
- `requireSession(req, role)` (`api/lib/auth-guard.ts`) is the single chokepoint every DEO/admin
  route calls before touching data — no route trusts `body.districtId`/`body.id` on its own.

## PII handling

- **DEO login never sees a raw CUG number server-side.** The 10-digit CUG mobile number is
  SHA-256-hashed client-side (`api/lib/crypto.ts`, Web Crypto) before it ever leaves the browser;
  `POST /api/auth/verify-cug` only ever receives and stores the hash (`users.cugHash`).
- **Admin login is magic-link email**, not a password/PIN — `POST /api/auth/request-magic-link`
  emails a 15-minute single-use token via Resend; `POST /api/auth/verify-magic-link` exchanges it
  for a session cookie.
- No plaintext CUG numbers or officer contact details are committed to the repository. The
  department's real contact directory and any D1 export/backup live only under
  `scripts_and_data/`, which `.gitignore` excludes by pattern (`*.sql`, `*.csv`, `*.txt`, `*.py`,
  anything matching `*hash*`, and the `backups/` subdirectory specifically — a plain
  `scripts_and_data/*.sql` glob does not cover `scripts_and_data/backups/*.sql`, since gitignore
  globs don't cross a `/` boundary). **Never commit anything under `scripts_and_data/` that isn't
  already covered by one of these patterns** — add a new pattern rather than committing the file
  if a new file type doesn't match.

## Rate limiting

- `checkIpRateLimit()` (`api/lib/rate-limit.ts`, D1-backed `login_attempts` table) throttles
  `POST /api/auth/verify-cug` — one row per hashed IP (not per attempt), fixed 5-minute window,
  so a sustained brute-force run can't grow the table unbounded.
- A separate per-user check inside `request-magic-link`'s own route (keyed by `magicLinkTokens`,
  not IP) throttles magic-link requests, so a flood targeting one admin account can't also lock
  out every other admin's real login.

## Server-side trust boundaries

- **Every financial value the client can influence is recomputed and validated server-side,
  never trusted as sent.** `pac_dues.openingBalance`/`netRecoverable` are computed only in
  `POST /api/pac-dues/submit` (`api/lib/dues-fields.ts`'s `computeNetRecoverable()`); the
  math-safety gate (`batteKhatteAmount`/`courtStayedAmount` can't exceed what's left) and the RC
  Details reconciliation (`validateRcDetails()`, per-RC amounts must sum to `rcAmount`) are both
  enforced there, independent of the client-side preview that mirrors them for UX.
- `/api/admin/truncate-demo-data` is hardcoded server-side to `district_name = 'Demo District'`
  — it is physically incapable of deleting a real district even given a malicious request body,
  by construction, not by validation.
- Every route is wrapped in `withErrorHandling()` (`api/lib/with-error-handling.ts`): an
  unhandled exception (a D1 blip, a thrown error from Resend) is logged server-side only and
  returns a generic `{ error }` JSON 500 to the client — internal error detail (D1 errors, stack
  traces) never reaches the response body.
- D1 access goes through Drizzle's query builder everywhere — no raw SQL string interpolation on
  a live query path. (`api/lib/export.ts`'s SQL-backup generator is the one place hand-built SQL
  text appears, and it's a client-side download of already-fetched data, not a query — its own
  `sqlLiteral()` helper escapes every value it writes.)

## Response headers

Every response (success or error) carries, via `withErrorHandling()`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Multi-write consistency

Routes that touch more than one table in a single logical action (e.g. locking a period and
writing its audit log entry) use `db.batch()` so a partial failure can't leave related rows
inconsistent.
