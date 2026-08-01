# Agent Instructions: PAC Recovery Portal

You are an expert full-stack developer specializing in Next.js on Cloudflare Workers
(`@opennextjs/cloudflare`), Drizzle ORM, and the Cloudflare ecosystem (Workers, D1). You are
working on a live, production-grade internal portal for the Department of Excise, Government of
Uttar Pradesh.

See [../CLAUDE.md](../CLAUDE.md) for the full rules (data model, auth, validation, security
history, known gaps) — this file is the short version. If the two ever disagree, CLAUDE.md wins;
update this file to match rather than leaving them inconsistent.

## Core Directives
1.  **Reliability & Security**: This is a production application. Strict data typing, error handling, and security are paramount.
2.  **Architecture Limits**: Do not introduce new frameworks or complex libraries without explicit permission. Stick to the current stack:
    *   Next.js (App Router) on `@opennextjs/cloudflare`, deployed as one Cloudflare Worker — `api/app/*` is UI pages, `api/app/api/*` is the API surface.
    *   Cloudflare D1 via Drizzle ORM (`api/db/schema.ts`) for the database.
    *   TanStack Table, Dexie.js, ExcelJS, Cleave.js, SweetAlert2, Tabler Icons, Chart.js.
3.  **Database Changes**: Never alter the database schema or rewrite existing mathematical/formatting logic unless explicitly instructed. Lock state lives per `(district, period)` on `pac_dues` — don't assume a district has one lock state.
4.  **Remote/deploy actions require a fresh explicit go-ahead every time**: never run a `--remote` D1 command, `wrangler deploy`, or `git push` to `main` (which triggers the GitHub Actions deploy) without the user saying so for that specific change. Local `--local` D1 work and `pnpm run preview` don't need to ask.
5.  **Environment Variables**: Use Cloudflare Wrangler Secrets for `JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL`, `FROM_EMAIL` — none of these belong in `wrangler.jsonc`.
6.  **Never commit anything under `scripts_and_data/`** that isn't excluded by an existing `.gitignore` pattern (`*.sql`, `*.csv`, `*.txt`, `*.py`, `*hash*`, `backups/`) — that directory holds the department's real officer contact data and D1 export backups. See CLAUDE.md's Security section for why this is a hard rule, not a style preference.
7.  **Custom domain wiring**: `pacrecovery.exciseup.in` uses `custom_domain: true` in `wrangler.jsonc`'s routes, which auto-provisions DNS on deploy — don't switch to a plain `{ pattern, zone_name }` route without understanding you'd also need to manually create the DNS record.

## Component Guidelines
*   **Pages** (`api/app/*/page.tsx`): Calculate derived values (Total Dues Left, Net Recoverable) client-side for a live preview, but never trust that value — the server (`app/api/pac-dues/submit/route.ts`) recomputes and validates independently. Use SweetAlert2 modals only for blocking confirms before an irreversible action; use inline banners for field-level errors and toasts for other validation — see CLAUDE.md's UI conventions. DEO-input fields start blank, never pre-filled with `0`. Prefix all financial amounts with ₹, Indian Lakh/Crore grouping via Cleave.js. **NO EMOJIS ALLOWED** — Tabler Icons only.
*   **API routes** (`api/app/api/*/route.ts`): Wrap every handler in `withErrorHandling()`. Call `requireSession(req, role)` (`lib/auth-guard.ts`) before touching DEO or admin data — never trust `body.districtId`/`body.id` on its own. See CLAUDE.md's Auth section before adding or changing a write route.
