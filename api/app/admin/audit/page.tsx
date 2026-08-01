"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatIST } from "@/lib/format";
import { useAdminData } from "@/lib/useAdminData";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";
import Select from "@/components/ui/Select";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Unlock Requests", href: "/admin/unlock-requests" },
  { label: "Audit Log", href: "/admin/audit" },
];

type AuditRow = {
  id: number;
  eventType: string;
  actorRole: "admin" | "deo" | null;
  actorEmail: string | null;
  actorName: string | null;
  actorDesignation: string | null;
  districtName: string | null;
  metadata: string | null;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  login_cug: "DEO login (CUG)",
  login_magic_link: "Login (magic link)",
  logout: "Logout",
  district_locked: "District locked",
  district_unlocked: "District unlocked",
  deo_provisioned: "DEO(s) provisioned",
  unlock_requested: "Unlock requested (DEO)",
  unlock_request_approved: "Unlock request approved",
  unlock_request_denied: "Unlock request denied",
};

// Raw metadata JSON keys, as actually written across every `auditLog` insert in api/app/api/**
// (submittedByName, reason, note, inserted/updated/errors/totalRows) — human labels for display,
// falling back to the raw key for anything not yet mapped.
const METADATA_KEY_LABELS: Record<string, string> = {
  submittedByName: "Locked by",
  reason: "Reason",
  note: "Note",
  inserted: "Added",
  updated: "Updated",
  errors: "Errors",
  totalRows: "Total rows",
  newAdminEmail: "New admin email",
  newAdminName: "New admin name",
  targetAdminId: "Admin ID",
  targetAdminEmail: "Admin email",
  deletedAdminEmail: "Deleted admin email",
  deletedAdminName: "Deleted admin name",
};

// Name/designation are captured at write time (see api/lib/audit.ts) — an admin's later name
// change doesn't rewrite past rows. Falls back through email, then the same "DEO {district}"
// shape the DEO side already used, matching how this page treats DEO identity.
function describeActor(row: AuditRow): string {
  if (row.actorName) return row.actorDesignation ? `${row.actorName} (${row.actorDesignation})` : row.actorName;
  if (row.actorDesignation) return row.actorDesignation;
  if (row.actorEmail) return row.actorEmail;
  if (row.actorRole === "deo" && row.districtName) return `DEO ${row.districtName}`;
  if (row.actorRole) return `(${row.actorRole})`;
  return "—";
}

function describeMetadata(row: AuditRow): string {
  if (!row.metadata) return "—";
  try {
    const m = JSON.parse(row.metadata) as Record<string, unknown>;
    return Object.entries(m)
      .map(([k, v]) => `${METADATA_KEY_LABELS[k] ?? k}: ${v}`)
      .join(", ");
  } catch {
    return row.metadata;
  }
}

export default function AuditLogPage() {
  // Shares the same guard/Sync/district-search/Synced-timestamp header as every other admin
  // page (Dashboard, Districts, District Detail) — this page used to run its own bare-bones
  // `/api/auth/me` guard and skip districts/onSync entirely, which is why its header used to
  // look/behave differently (no search box, no Sync button) from the other three.
  const { ready, profile, districts, sync, syncing, lastSyncedAt } = useAdminData();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [isChangingFilter, setIsChangingFilter] = useState(false);

  // Filters + re-sorts only the currently-loaded page's rows — the log itself is already
  // newest-first from the server and server-paginated, so a true global filter/sort would need
  // a server-side query; not worth it for a 30-day-retention, single-reader table. Both are
  // pure client-side operations on data already in memory, no extra request.
  const visibleRows = useMemo(() => {
    const filtered = eventFilter === "all" ? rows : rows.filter((r) => r.eventType === eventFilter);
    const sorted = [...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [rows, eventFilter, sortDir]);

  async function loadPage(p: number) {
    setLoading(true);
    try {
      const res = await apiFetch<{ rows: AuditRow[]; page: number; pageSize: number }>(
        `/api/admin/audit-log?page=${p}`,
        undefined,
        "admin"
      );
      setRows(res.rows);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready) loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="Audit Log" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
        <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-1.5">
            <div className="h-8 w-32 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="h-8 w-32 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="h-[500px] w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader
        title="Audit Log"
        role="admin"
        profile={profile}
        navLinks={NAV_LINKS}
        onSync={sync}
        syncing={syncing}
        lastSyncedAt={lastSyncedAt}
        districts={districts}
      />
      <HelpPanel pageKey="admin-audit" title="Reading the audit log">
        <p>
          Every login, logout, district lock/unlock, and DEO provisioning batch is recorded
          here, newest first. Entries older than 30 days are removed automatically.
        </p>
        <p>
          Use <strong>Filter by event</strong> to show only one kind of entry, and the sort
          button to flip between newest-first and oldest-first — both apply only to the page of
          entries currently loaded below.
        </p>
        <p>Unlock events include the reason the admin gave when reopening a submission.</p>
      </HelpPanel>
      <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-end gap-1.5">
          <Select
            value={eventFilter}
            disabled={isChangingFilter}
            onChange={(e) => {
              const val = e.target.value;
              setIsChangingFilter(true);
              setTimeout(() => {
                setEventFilter(val);
                setIsChangingFilter(false);
              }, 400);
            }}
            className="min-w-[11rem]"
          >
            <option value="all">All events</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={isChangingFilter}
            onClick={() => {
              setIsChangingFilter(true);
              setTimeout(() => {
                setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                setIsChangingFilter(false);
              }, 400);
            }}
            title={sortDir === "desc" ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
            className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <i className={`ti ${sortDir === "desc" ? "ti-sort-descending" : "ti-sort-ascending"} text-sm`} />
            {sortDir === "desc" ? "Newest first" : "Oldest first"}
          </button>
        </div>

        <div className="min-h-[500px] max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm [scrollbar-width:thin] scroll-smooth dark:border-slate-800 dark:bg-slate-900">
          {isChangingFilter ? (
            <div className="p-6">
              <div className="mb-6 h-8 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mb-4 h-12 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/50" />
              <div className="mb-4 h-12 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/50" />
              <div className="mb-4 h-12 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/50" />
              <div className="h-12 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/50" />
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  When (IST)
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Event
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Actor
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  District
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Details
                </th>
              </tr>
            </thead>
            <tbody key={eventFilter + sortDir + page} className="animate-in fade-in duration-300">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    {loading ? "Loading..." : "No matching activity in the last 30 days."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {formatIST(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {EVENT_LABELS[row.eventType] ?? row.eventType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {describeActor(row)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {row.districtName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{describeMetadata(row)}</td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => loadPage(page - 1)}
            disabled={page <= 1 || loading}
            style={page <= 1 || loading ? { cursor: "not-allowed" } : undefined}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"
          >
            <i className="ti ti-chevron-left text-sm" />
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            onClick={() => loadPage(page + 1)}
            disabled={rows.length === 0 || loading}
            style={rows.length === 0 || loading ? { cursor: "not-allowed" } : undefined}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"
          >
            <i className="ti ti-chevron-right text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
