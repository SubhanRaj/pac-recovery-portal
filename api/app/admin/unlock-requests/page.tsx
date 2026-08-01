"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatIST } from "@/lib/format";
import { useAdminData } from "@/lib/useAdminData";
import { notifyToast } from "@/lib/alerts";
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

type RequestRow = {
  id: number;
  districtId: number;
  districtName: string | null;
  reason: string;
  status: "pending" | "approved" | "denied";
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  adminNote: string | null;
};

const STATUS_BADGE: Record<RequestRow["status"], string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  denied: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// Same reason-required prompt shape as promptUnlockReason() in alerts.ts (single SweetAlert2
// textarea) — the admin always types their own note here, approve or deny, never auto-copied
// from the DEO's submitted reason. Not added to alerts.ts since its title/verb differ per action
// and there's only this one call site pair.
async function promptResolveNote(action: "approve" | "deny", districtName: string): Promise<string | null> {
  const result = await window.Swal.fire({
    icon: action === "approve" ? "question" : "warning",
    title: `${action === "approve" ? "Approve" : "Deny"} unlock request — ${districtName}?`,
    input: "textarea",
    inputPlaceholder: "Your note (required)",
    showCancelButton: true,
    confirmButtonText: action === "approve" ? "Approve & Unlock" : "Deny",
    cancelButtonText: "Cancel",
    confirmButtonColor: action === "approve" ? "#1d4ed8" : "#dc2626",
    allowOutsideClick: false,
    inputValidator: (value: string) => (value && value.trim() ? undefined : "Please enter a note."),
  });
  return result.isConfirmed ? (result.value as string).trim() : null;
}

export default function UnlockRequestsPage() {
  const { ready, profile, districts, sync, syncing, lastSyncedAt } = useAdminData();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ rows: RequestRow[] }>("/api/admin/unlock-requests", undefined, "admin");
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load unlock requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function resolve(row: RequestRow, action: "approve" | "deny") {
    const note = await promptResolveNote(action, row.districtName ?? "this district");
    if (!note) return;
    setResolvingId(row.id);
    try {
      await apiFetch(
        "/api/admin/unlock-requests/resolve",
        { method: "POST", body: JSON.stringify({ id: row.id, action, note }) },
        "admin"
      );
      notifyToast({ icon: "success", title: action === "approve" ? "District unlocked" : "Request denied" });
      await load();
    } catch (err) {
      notifyToast({ icon: "error", title: "Failed", text: err instanceof ApiError ? err.message : "Please try again." });
    } finally {
      setResolvingId(null);
    }
  }

  const visibleRows = statusFilter === "pending" ? rows.filter((r) => r.status === "pending") : rows;

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="Unlock Requests" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
        <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
          <div className="mb-4 flex items-center justify-end">
            <div className="h-9 w-40 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="h-[500px] w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader
        title="Unlock Requests"
        role="admin"
        profile={profile}
        navLinks={NAV_LINKS}
        onSync={sync}
        syncing={syncing}
        lastSyncedAt={lastSyncedAt}
        districts={districts}
      />
      <HelpPanel pageKey="admin-unlock-requests" title="Unlock requests">
        <p>
          A locked-out DEO can submit an in-app request here instead of contacting an Admin
          outside the portal. Approving unlocks the district (same as the manual Unlock button
          on Districts); denying leaves it locked. Both require you to type your own note.
        </p>
      </HelpPanel>
      <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="mb-4 flex items-center justify-end">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "pending" | "all")} className="min-w-[10rem]">
            <option value="pending">Pending only</option>
            <option value="all">All requests</option>
          </Select>
        </div>

        <div className="min-h-[500px] max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">District</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Requested (IST)</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Reason</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Status</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    {loading ? "Loading..." : "No unlock requests."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white align-top dark:border-slate-800 dark:bg-slate-900">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.districtName ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{formatIST(row.requestedAt)}</td>
                    <td className="max-w-sm px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {row.reason}
                      {row.status !== "pending" && row.adminNote && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Admin note: {row.adminNote} ({row.resolvedBy}, {formatIST(row.resolvedAt)})
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>{row.status}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {row.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={resolvingId === row.id}
                            onClick={() => resolve(row, "approve")}
                            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={resolvingId === row.id}
                            onClick={() => resolve(row, "deny")}
                            className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                          >
                            Deny
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
