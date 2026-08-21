# PAC Recovery Portal

A production internal portal for the Department of Excise, Government of Uttar Pradesh, tracking
recovery of dues from cases originating up to FY ending 31-Mar-2019, across 75 districts. District
Excise Officers (DEOs) submit recovery updates whenever they have new figures — each submission is
a permanent, append-only ledger entry; an Admin reviews, exports, and can reset a district's
entire ledger back to its uploaded baseline.

See [PLAN.md](./PLAN.md) for the design record behind the append-only ledger, [CLAUDE.md](./CLAUDE.md)
for the rules an AI agent must follow when working in this repo, [SECURITY.md](./SECURITY.md) for
the security architecture, [DEPLOY.md](./DEPLOY.md) for production state and deploy commands, and
[TESTING.md](./TESTING.md) for how to test a change.

## Tech Stack

One Next.js (App Router) app on [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare),
deployed as a single Cloudflare Worker serving both UI pages and `/api/*` route handlers. Package
manager is **pnpm** throughout.

*   **Next.js 16 / React 19** — App Router. The whole app (UI pages and API routes) lives under
    `api/`. `api/app/api/*` is the API surface; everything else under `api/app/` is a page.
*   **Cloudflare D1** (`api/db/schema.ts`, Drizzle ORM) — `districts`, `users`, `pac_dues`,
    `magic_link_tokens`, `audit_log`, `unlock_requests`, `login_attempts`. Migrations tracked via
    `drizzle-kit` under `api/drizzle/`.
*   **Auth** — HttpOnly/Secure/SameSite=Lax session cookies (`jose` for JWT signing), no CORS. DEO
    login is CUG-hash verification (SHA-256, hashed client-side before the raw mobile number ever
    leaves the browser); Admin login is magic-link email (via [Resend](https://resend.com),
    `noreply@mail.exciseup.in`).
*   **Dexie.js** — IndexedDB cache on the Admin dashboard (districts + pac_dues), explicit Sync
    button to bypass it.
*   **ExcelJS** — Admin's `.xlsx` export: real frozen header rows, A4-landscape/fit-to-width print
    setup, currency formatting.
*   **TanStack Table** — the Admin Districts page's sortable/searchable/paginated grid.
*   **Cleave.js** — Indian Numeral (Lakh/Crore) input formatting on DEO money fields.
*   **SweetAlert2** — blocking confirms before irreversible actions; **Tabler Icons** — all UI
    iconography, no emojis anywhere.

## Data model

See `api/db/schema.ts` for the full column reference and inline reasoning. Key points:

*   **`districts`** — all 75 UP districts. `totalDues`/`collectedTillDate` are the one-time,
    department-sourced, read-only baseline for cases originating up to FY ending 31-Mar-2019 —
    never DEO-editable, never re-entered per period. `NULL` for the districts the department
    hasn't yet supplied figures for.
*   **`pac_dues`** — an **append-only ledger**, arbitrarily many rows per `districtId`, one per
    DEO submission, ordered by `id`/`createdAt`. Every row is immutable from the moment it's
    inserted — the submit route only ever `INSERT`s, never `UPDATE`s an existing row, and no route
    ever edits a field in place. `openingBalance` is the district's latest (highest-`id`) row's
    `netRecoverable` (or `totalDues − collectedTillDate` for a district's first-ever entry) —
    computed server-side only, never trusted from the client. See [PLAN.md](./PLAN.md) for the
    full design and why.
*   **`pac_dues.rcCount`/`rcAmount`/`rcDetails`** — RCs (Recovery Certificates) issued against
    defaulters this period. Informational only: independent of `recoveredThisPeriod`/
    `netRecoverable`, an RC tells a defaulter what they owe regardless of what's actually
    recovered. `rcDetails` is a JSON `RcDetail[]` (`rcNumber`, `rcAmount`, `stayed`) — one entry
    per RC, its amounts must sum to `rcAmount`, enforced server-side.
*   **`users`** — `role: "deo" | "admin"`. DEOs are keyed by `cugHash` (SHA-256 of their 10-digit
    CUG mobile number); admins by `email` (magic-link recipient).
*   A DEO submission can never be edited or deleted — only an Admin's district-level reset
    (`POST /api/admin/reset-district`) clears it, deleting every `pac_dues` row for that district
    at once (never a single row in place) so a fresh submit chains from the uploaded baseline
    again. The wiped rows are preserved in that reset's `audit_log` metadata, not destroyed.

**Data-entry scope**: this portal only tracks dues from cases that originated up to FY ending
31-Mar-2019 — a static bilingual banner on the DEO data-entry page, not a live date check (dues
can predate the 1970s). Recovery *entries* happen whenever a DEO has a new figure, with no cap on
how often; the underlying dues stock itself never grows.

## Calculation Logic

Computed server-side only (`lib/dues-fields.ts`'s `computeNetRecoverable()`), mirrored client-side
for a live preview:

1.  **कुल बकाया धनराशि (Total Dues Left)** = `openingBalance − recoveredThisPeriod`
2.  **शुद्ध वसूल की जाने वाली धनराशि (Net Recoverable)** = `max(0, Total Dues Left − batteKhatteAmount − courtStayedAmount)`
3.  **Submit is rejected (400)** server-side if `batteKhatteAmount > Total Dues Left`, or
    `courtStayedAmount > (Total Dues Left − batteKhatteAmount)`.
4.  **RC Details must reconcile**: if `rcCount > 0`, exactly that many `RcDetail` rows are
    required and their `rcAmount`s must sum to the period's `rcAmount` (± ₹0.01) — RCs are
    informational and never enter the Total Dues Left/Net Recoverable formulas above.

## DEO Flow (`/login` → `/deo-data-entry`)

Single-page form. CUG login → session cookie → form pre-filled with the district's current Opening
Balance (from its latest ledger entry, or the uploaded baseline if this is its first), blank
editable RC Count/Amount + per-RC breakdown, Recovered This Period/Batte Khatte/Court Stayed →
two-step submit confirm (plain "are you sure" dialog, then a name-entry prompt with a liability
disclaimer, validated against blank/digits/designation-words) → `POST /api/pac-dues/submit` inserts
a new permanent ledger entry — never locked, never edited, and the DEO can submit again immediately
with no cap on how often. A read-only "My Submissions" panel shows every entry the DEO has ever
made. If a DEO needs their district's data reset back to the baseline (e.g. a bad entry), they can
file a self-service reset request (`POST /api/deo/request-reset`) instead of waiting on the Admin
to notice.

## Admin Flow (`/admin` → `/admin/districts` → `/admin/districts/detail`)

Magic-link login (`/login` → email → `/verify`) → Dashboard (KPI cards, top-15-by-net-recoverable
chart, submission-status donut) → Districts table (search/sort/paginate, per-row Reset, Excel/SQL
export) → District Detail (every entry a district has ever had). Reset Requests and Audit Log
pages round out the admin surface. Every admin can reset a district's ledger, view all data, and
export — managing who has an admin account at all (`/admin/users`, "Manage Admins" in the profile
pill) is owner-only, gated by the `OWNER_EMAIL` secret (see `CLAUDE.md`'s Auth section). There is
still no bulk DEO provisioning.

## API (`api/app/api/*`)

Every route wrapped in `withErrorHandling()` (consistent JSON error shape + security headers).
Session auth via `requireSession(req, role)` reading the HttpOnly cookie.

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/verify-cug` | POST | DEO CUG-hash login. Rate-limited per IP. |
| `/api/auth/request-magic-link` | POST | Admin login step 1 — emails a 15-min single-use link. Rate-limited per user. |
| `/api/auth/verify-magic-link` | POST | Admin login step 2 — exchanges the token for a session cookie. |
| `/api/auth/me` | GET | Session + current-period info for the logged-in user. |
| `/api/auth/logout` | POST | Clears the session cookie for the given role. |
| `/api/pac-dues/mine` | GET | DEO's district baseline + full ledger history. |
| `/api/pac-dues/submit` | POST | DEO inserts a new permanent ledger entry. |
| `/api/deo/request-reset` | POST | DEO's self-service district-reset request (FormData). |
| `/api/admin/districts` | GET | Full districts + every pac_dues ledger entry, for the Dexie cache. |
| `/api/admin/reset-district` | POST | Admin wipes every ledger entry for a district back to baseline. |
| `/api/admin/unlock-requests` | GET | List of reset requests. |
| `/api/admin/unlock-requests/resolve` | POST | Approve/deny a reset request. |
| `/api/admin/audit-log` | GET | Paginated audit trail (45-day retention, pruned on read). |
| `/api/admin/truncate-demo-data` | POST | Deletes the hardcoded `Demo District` row only. |
| `/api/admin/users` | GET, POST | Owner-only: list/add admin accounts. |
| `/api/admin/users/update` | POST | Owner-only: edit an admin's name/email/designation. |
| `/api/admin/users/delete` | POST | Owner-only: remove an admin (blocks self and last-remaining). |

## App Flow

Regenerate by hand if the flow changes materially.

### 1. Authentication (both login paths)

```mermaid
flowchart TD
    Start(["DEO or Admin visits /login"]) --> Choice{"Login method"}

    Choice -->|"CUG Mobile"| CugHash["Hash 10-digit CUG number<br/>(Web Crypto, client-side —<br/>raw number never sent)"]
    CugHash --> VerifyCug["POST /api/auth/verify-cug<br/>(rate-limited per IP)"]
    VerifyCug --> CugCheck{"cug_hash match?"}
    CugCheck -->|"no"| CugErr["401 Invalid CUG number"]
    CugCheck -->|"yes"| Session

    Choice -->|"Admin email"| ReqLink["POST /api/auth/request-magic-link<br/>(rate-limited per user)"]
    ReqLink --> EmailSent["Resend sends magic-link email<br/>(noreply@mail.exciseup.in)"]
    EmailSent --> VerifyPage["/verify?token=…"]
    VerifyPage --> VerifyMagic["POST /api/auth/verify-magic-link"]
    VerifyMagic --> TokenCheck{"token valid,<br/>unused, unexpired?"}
    TokenCheck -->|"no"| MagicErr["401 invalid or expired"]
    TokenCheck -->|"yes"| Session

    Session["Set-Cookie: __deo_session /<br/>__admin_session<br/>(HttpOnly, Secure, SameSite=Lax,<br/>7-day JWT via jose)"] --> RoleCheck{"role"}
    RoleCheck -->|"deo"| DeoHome["/deo-data-entry"]
    RoleCheck -->|"admin"| AdminHome["/admin"]

    style Session fill:#16a34a,color:#fff
    style CugErr fill:#dc2626,color:#fff
    style MagicErr fill:#dc2626,color:#fff
```

### 2. DEO data entry — append-only ledger, unlimited submissions

```mermaid
flowchart TD
    Login(["DEO logs in"]) --> Me["GET /api/auth/me?role=deo<br/>pendingResetRequest?"]
    Me --> Mine["GET /api/pac-dues/mine<br/>totalDues, collectedTillDate,<br/>latest entry + full history"]
    Mine --> Form["Form pre-filled: Opening Balance<br/>(read-only, from latest entry) + RC<br/>Count/Amount + RC Detail rows +<br/>Recovered This Period + Batte<br/>Khatte + Court Stayed — all blank"]
    Form --> LiveCalc["Live preview: Total Dues Left,<br/>Net Recoverable (computeNetRecoverable)"]
    LiveCalc --> ClientValidate{"Anti-blank, count/amount<br/>synchrony, RC Details sum<br/>= RC Amount, math-safety gate"}
    ClientValidate -->|"fails"| Toast["SweetAlert2 toast, no submit"]
    ClientValidate -->|"passes"| Confirm1["confirmFinalSubmit()<br/>plain are-you-sure dialog"]
    Confirm1 --> Confirm2["promptDeoNameAndLock()<br/>name + liability disclaimer"]
    Confirm2 --> Submit["POST /api/pac-dues/submit"]

    Submit --> ServerValidate{"Server re-validates:<br/>non-negative, synchrony,<br/>validateRcDetails(), math-safety"}
    ServerValidate -->|"fails"| Rejected["400 — form shows error,<br/>nothing written"]
    ServerValidate -->|"passes"| Insert["Server computes netRecoverable,<br/>INSERTs a new permanent pac_dues<br/>row + audit_log — never edits<br/>an existing row"]
    Insert --> Refresh["Form clears, refetches mine —<br/>DEO can submit again immediately,<br/>anytime, no cap"]

    Mine -.->|"district needs a full<br/>do-over (bad entry)"| ReqReset["Request Reset button<br/>→ textarea, reason required"]
    ReqReset --> PostReset["POST /api/deo/request-reset<br/>(FormData)"]
    PostReset --> PendingBanner["Pending since … banner<br/>until Admin resolves"]

    style Insert fill:#16a34a,color:#fff
    style Refresh fill:#16a34a,color:#fff
    style Rejected fill:#dc2626,color:#fff
    style Toast fill:#f59e0b,color:#000
```

### 3. Admin dashboard — Dexie-first, reset, export

```mermaid
flowchart TD
    AdminLogin(["Admin logs in -> /admin"]) --> CacheCheck{"Dexie IndexedDB cache<br/>(adminDistricts/adminPacDues)<br/>populated?"}

    CacheCheck -->|"yes"| UseCache["Render from cache immediately<br/>no D1 query"]
    CacheCheck -->|"empty / manual Sync"| Fetch["GET /api/admin/districts<br/>full districts + every pac_dues entry"]
    Fetch --> StoreCache[("db.transaction: clear + bulkPut<br/>into adminDistricts/adminPacDues")]
    StoreCache --> UseCache

    UseCache --> Dashboard["/admin: KPI cards, top-15 chart,<br/>submission-status donut (AdminDashboard.tsx)"]
    UseCache --> Districts["/admin/districts: TanStack Table,<br/>search/sort/paginate, RC + dues columns,<br/>latest entry per district"]
    UseCache --> Detail["/admin/districts/detail:<br/>every entry this district has ever submitted"]

    Districts --> ResetClick["Reset button on a submitted district"]
    Detail --> ResetClick
    ResetClick --> Reason["promptResetReason()"]
    Reason --> PostReset["POST /api/admin/reset-district<br/>{ districtId, reason }"]
    PostReset --> PatchBoth["Delete every pac_dues row for the<br/>district from React state + Dexie —<br/>server preserves them in audit_log"]

    UseCache --> ResetReqPage["/admin/unlock-requests<br/>(Reset Requests)"]
    ResetReqPage --> Resolve{"Approve or deny?"}
    Resolve -->|"approve"| ResolveApprove["POST …/resolve<br/>same full reset as above"]
    Resolve -->|"deny"| ResolveDeny["POST …/resolve<br/>adminNote required"]

    UseCache --> Export["Export button (lib/export.ts)"]
    Export --> Xlsx["ExcelJS: Summary + Districts<br/>(RC/dues columns) + Submission Status sheets<br/>— frozen header, A4 landscape"]
    Export --> Sql["Plain-text SQL backup:<br/>districts + pac_dues INSERTs"]

    style UseCache fill:#16a34a,color:#fff
    style PatchBoth fill:#16a34a,color:#fff
```

## Getting started

```bash
cd api
pnpm install
cp .dev.vars.example .dev.vars   # fill in JWT_SECRET, RESEND_API_KEY, FRONTEND_URL, FROM_EMAIL
pnpm run db:migrate:local        # apply drizzle/*.sql to the local D1 (miniflare) instance
pnpm run dev                     # http://localhost:3000 — UI only, no D1 binding
pnpm run preview                 # closer to production: builds via OpenNext, real Worker + D1
                                  # binding + asset serving on http://localhost:8787
```

## Deploying

Live at `https://pacrecovery.exciseup.in` as a single Cloudflare Worker + D1. **Never run
`wrangler deploy` or a `--remote` D1 command without the user explicitly saying so for that
specific change** — this project has live production data and real government users. There is no
CI/CD; deploys are manual, run from this machine. See [DEPLOY.md](./DEPLOY.md) for the full
production resource table, secrets, and redeploy/rollback commands.

## Scripts and Data (`scripts_and_data/`)

`.gitignore` excludes `*.sql`, `*.csv`, `*.txt`, `*.py`, `*.xlsx`, `*.xls`, anything matching
`*hash*`, and the `backups/` directory under here — the department's contact directory (real
officer names, phone numbers, CUG numbers), any D1 export/backup, and any source Excel workbook
live here locally only, never in git.
