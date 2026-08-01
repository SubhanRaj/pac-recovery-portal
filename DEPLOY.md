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
| Admin | `shubhanraj2002@gmail.com` (role `admin`, signs in via magic link) |

Auth to Cloudflare: `pnpm exec wrangler whoami` (already logged in via OAuth on this machine).
Re-auth elsewhere with `pnpm exec wrangler login`.

## CI/CD

- `.github/workflows/ci.yml` — `pnpm exec tsc --noEmit` + `pnpm run build` on every push/PR
  touching `api/`.
- `.github/workflows/deploy.yml` — `pnpm run deploy` (OpenNext build + `wrangler deploy`) on push
  to `main` when `api/**` changed, or via `workflow_dispatch`. Requires
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in GitHub Secrets.

```bash
gh workflow run deploy.yml
gh run watch <run-id> --exit-status           # follow it live
```

Manual `wrangler` commands below still work for local development and emergency redeploys, but
treat GitHub Actions as the source of truth for what's actually live.

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
```

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
