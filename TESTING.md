# Testing

## End-to-end (Playwright, real Chrome)

`api/e2e/login.spec.ts` drives the actual installed Chrome browser (not Playwright's bundled
Chromium) against the login page. By default it targets the live production deployment
(`https://pacrecovery.exciseup.in`); override with `E2E_BASE_URL`/`E2E_API_URL` to point at a
local `pnpm run preview` instance instead.

```bash
cd api
pnpm run e2e                    # headless, against production
HEADED=1 pnpm run e2e           # watch it run in a real window (needs a display)
E2E_BASE_URL=http://localhost:8788 E2E_API_URL=http://localhost:8788 pnpm run e2e   # local (pnpm run preview)
```

Config: `api/playwright.config.ts`. Headless by default (no window server assumed); set
`HEADED=1` locally to watch it run.

### What's covered

1. **Login page renders correctly** — the CUG Mobile (DEO) tab is the default, the mobile number
   field is visible and editable.
2. **Inline validation, no popup** — a malformed mobile number shows an inline error and asserts
   zero `.swal2-popup` elements exist. SweetAlert2 is reserved for the DEO lock confirm and other
   irreversible-action confirms — not routine field validation (see CLAUDE.md's UI conventions).
3. **Magic-link request → inline success card** — submitting the admin email tab shows "Check
   your email" inline instead of a popup.
4. **Full magic-link round trip against live D1** — `latestUnusedToken()` reads the most recently
   issued, still-unused token straight from D1 (`wrangler d1 execute excise-bakaya-db --remote`,
   read-only `SELECT`) rather than needing a real inbox, then drives the browser through
   `/verify?token=...` → "Verify & Continue" → asserts it actually lands on `/admin` (not bounced
   back to `/login`) and that an `HttpOnly` `__admin_session` cookie is present in the browser
   context.

Test 4 sends a real magic-link email via Resend and reads production D1 — only run it
deliberately, not as a quick local sanity check. Tests 1–3 are safe to run locally against
`pnpm run preview` any time.

Not wired into CI yet — `ci.yml` only runs `tsc --noEmit` + `next build`.

## Manual smoke test

For a change that touches auth, the submit/lock flow, or the admin dashboard, run through this
against `pnpm run preview` (real Worker + local D1, `http://localhost:8788` by default) before
calling it done:

1. **DEO login** — CUG tab, a real `users.cugHash` row's number, lands on `/deo-data-entry`.
2. **Submit gate** — leave a field blank (toast, no submit), enter a Batte Khatte/Court Stayed
   amount without its count (toast), enter an amount exceeding Total Dues Left (toast), enter an
   `rcCount > 0` with mismatched RC Details total (toast) — each should block, not silently pass.
3. **Lock** — fill every field correctly, confirm through both dialogs, submit; the period should
   show `lockStatus = 1` and the DEO should see the "Data Already Locked" screen on next login.
4. **DEO self-service unlock request** — from the locked screen, submit a reason; confirm it
   shows as pending.
5. **Admin login** — Email tab, request a magic link, read the token from local D1
   (`wrangler d1 execute excise-bakaya-db --local --command "SELECT token FROM magic_link_tokens ORDER BY id DESC LIMIT 1;"`),
   visit `/verify?token=...`.
6. **Admin unlock** — resolve the pending unlock request (or unlock directly from
   `/admin/districts`); confirm the DEO's next login shows the form again, pre-filled with the
   previously submitted values.
7. **Export** — from `/admin/districts`, run both the Excel and SQL export; open the `.xlsx` and
   confirm the header row is frozen and RC/dues columns are present with correct values.
8. **Audit log** — confirm the lock, unlock-request, and resolve events from the steps above all
   appear on `/admin/audit`.
9. **Admin Users (owner-only)** — sign in as the `OWNER_EMAIL` admin; confirm "Manage Admins"
   appears in the profile pill and `/admin/users` lists every admin. Add one, edit it, remove it
   — each should toast and show up on `/admin/audit`. Then sign in as a *non*-owner admin and
   confirm the link is gone and `/admin/users` bounces to `/admin`.

## Typecheck & build

```bash
cd api
pnpm exec tsc --noEmit
pnpm run build
```

Both run in CI (`.github/workflows/ci.yml`) on every push/PR touching `api/`.
