# Deploying

One Cloudflare Worker (`api/`, via OpenNext — serves both the UI and `/api/*`) plus one D1
database. This doc is the source of truth for current production state and the exact commands to
redeploy or rebuild from scratch. See [CLAUDE.md](./CLAUDE.md) for how the system itself works
and [SECURITY.md](./SECURITY.md) for the security architecture.

**Never run a destructive Wrangler D1 command with `--remote`, `wrangler deploy`, or push to
`main` (which triggers `deploy.yml`) without the user explicitly saying so for that specific
change.** This project has live production data and real government users.

## Current production deployment

| Resource | Value |
|---|---|
| Cloudflare account | `Subhan` (`4d93d751987b8d9ff101445570e72711`) |
| Custom domain | `https://pacrecovery.exciseup.in` — a Workers **Custom Domain** (`custom_domain: true` in `api/wrangler.jsonc`'s `routes`, not a plain path-pattern route), which auto-provisions its own DNS record on deploy |
| Worker | `pac-recovery-portal` — serves the UI and `/api/*` both, `workers_dev: false` (no `*.workers.dev` URL) |
| D1 database | `excise-bakaya-db` (id `667be1f3-7612-45c6-91e9-0a40a451c6ea`) |
| Admin accounts | seeded in `users` (role `admin`), sign in via magic link — see D1 directly for the current list, not documented here |

Auth to Cloudflare: `pnpm exec wrangler whoami` (already logged in via OAuth on this machine).
Re-auth elsewhere with `pnpm exec wrangler login`.

### Pre-filled recovery figures (test data, not a real lock)

The 59 districts that had a prior bakaya form period carry real recovery figures
(`recovered_this_period`, `batte_khatte_*`, `court_stayed_amount`, `net_recoverable`) pulled from
that old system's own report export — the source file is
`scripts_and_data/Excise_Bakaya_Report_02-07-2026_12-39-31.xlsx`, backed up alongside a pre-import
D1 snapshot in `scripts_and_data/backups/`. These rows are deliberately left **unlocked** with no
`submitted_by_name` — nobody has actually submitted through this portal, so a DEO logging in today
sees real historical numbers pre-filled but must still review and lock the period themselves for
it to count as a genuine submission. The real Excel re-baseline (`districts.totalDues`/
`collectedTillDate`, up to 31-Mar-2019) supersedes this once it's imported.

## CI/CD

- `.github/workflows/ci.yml` — `pnpm exec tsc --noEmit` + `pnpm run build` on every push/PR
  touching `api/`.
- `.github/workflows/deploy.yml` — `pnpm run deploy` (OpenNext build + `wrangler deploy`) on push
  to `main` when `api/**` changed, or via `workflow_dispatch`. Requires
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in GitHub Secrets.

**`deploy.yml` is currently broken and failing on every push** — the repo was renamed, and the
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` GitHub Secrets need to be re-added under the new
repo name before it'll run again. Until that's done, deploys are manual only — run
`pnpm run deploy` from `api/` yourself after pushing, don't assume a push to `main` actually
reached production. `ci.yml` (typecheck/build) is unaffected and still runs normally.

```bash
gh workflow run deploy.yml
gh run watch <run-id> --exit-status           # follow it live
```

## One-time setup (already done — for reference / disaster recovery)

```bash
cd api
pnpm exec wrangler d1 create excise-bakaya-db
# → paste the printed database_id into api/wrangler.jsonc's d1_databases[0].database_id

pnpm run db:generate           # drizzle-kit generate, only needed after schema.ts changes
pnpm run db:migrate:remote     # applies drizzle/[0-9]*.sql to remote D1
```

If you ever need to point the admin account at a different email, patch it live:

```bash
pnpm exec wrangler d1 execute excise-bakaya-db --remote \
  --command "UPDATE users SET email = 'someone@example.com' WHERE role = 'admin';"
```

## Secrets

Set once for the Worker via `wrangler secret put <NAME>` (reads the value from stdin — pipe it,
don't type it into a prompt that ends up in shell history):

```bash
cd api
echo -n "<value>" | pnpm exec wrangler secret put JWT_SECRET
echo -n "<value>" | pnpm exec wrangler secret put RESEND_API_KEY
echo -n "https://pacrecovery.exciseup.in" | pnpm exec wrangler secret put FRONTEND_URL
echo -n "noreply@mail.exciseup.in" | pnpm exec wrangler secret put FROM_EMAIL
echo -n "shubhanraj2002@gmail.com" | pnpm exec wrangler secret put OWNER_EMAIL
```

`OWNER_EMAIL` gates `/admin/users` (see `CLAUDE.md`'s Auth section) — the one admin whose email
matches this secret can add/edit/remove other admins; everyone else gets a 403 and doesn't see
the link.

List what's set (values are never shown): `pnpm exec wrangler secret list`.

Local development uses `api/.dev.vars` instead (gitignored) — copy `api/.dev.vars.example` and
fill in the same four values.

## Local development

```bash
cd api
pnpm install
cp .dev.vars.example .dev.vars
pnpm run db:migrate:local        # apply drizzle/*.sql to the local D1 (miniflare) instance
pnpm run dev                     # http://localhost:3000 — UI only, no D1 binding
pnpm run preview                 # closer to production: builds via OpenNext, real Worker + D1
                                  # binding + asset serving on http://localhost:8788
```

`next dev` has no D1 binding at all — `pnpm run preview` is the only way to exercise a route that
touches the database locally.

## Redeploying from scratch

```bash
cd api
pnpm install
pnpm run db:migrate:remote       # only if there are new drizzle/*.sql files to apply
pnpm run deploy                  # opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

## Rolling back

```bash
pnpm exec wrangler deployments list
pnpm exec wrangler rollback [deployment-id]
```

Rolling back the Worker does not roll back D1 schema/data changes — a schema migration applied
via `db:migrate:remote` is not automatically reversible; write and apply a down-migration by hand
if one is ever needed.
