"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { formatIST } from "@/lib/format";
import { useAdminData } from "@/lib/useAdminData";
import { notifyToast, promptAddAdmin, promptEditAdmin, confirmDeleteAdmin } from "@/lib/alerts";
import AppHeader, { adminNavLinks } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";

type AdminRow = {
  id: number;
  name: string | null;
  email: string | null;
  designation: string | null;
  createdAt: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { ready, profile, districts, sync, syncing, lastSyncedAt } = useAdminData();
  const navLinks = adminNavLinks(profile?.isOwner);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | "new" | null>(null);

  // Server-side 403s the same request (see app/api/admin/users/route.ts's isOwnerEmail check) —
  // this is just so a non-owner admin who navigates here directly gets bounced to the dashboard
  // instead of staring at an error banner.
  useEffect(() => {
    if (ready && profile && !profile.isOwner) {
      router.replace("/admin");
    }
  }, [ready, profile, router]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ rows: AdminRow[] }>("/api/admin/users", undefined, "admin");
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load admin users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && profile?.isOwner) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile?.isOwner]);

  async function addAdmin() {
    const values = await promptAddAdmin();
    if (!values) return;
    setBusyId("new");
    try {
      await apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify(values) }, "admin");
      notifyToast({ icon: "success", title: "Admin added" });
      await load();
    } catch (err) {
      notifyToast({ icon: "error", title: "Failed to add admin", text: err instanceof ApiError ? err.message : "Please try again." });
    } finally {
      setBusyId(null);
    }
  }

  async function editAdmin(row: AdminRow) {
    const values = await promptEditAdmin({
      name: row.name ?? "",
      email: row.email ?? "",
      designation: row.designation ?? "",
    });
    if (!values) return;
    setBusyId(row.id);
    try {
      await apiFetch("/api/admin/users/update", { method: "POST", body: JSON.stringify({ id: row.id, ...values }) }, "admin");
      notifyToast({ icon: "success", title: "Admin updated" });
      await load();
    } catch (err) {
      notifyToast({ icon: "error", title: "Failed to update admin", text: err instanceof ApiError ? err.message : "Please try again." });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAdmin(row: AdminRow) {
    const ok = await confirmDeleteAdmin(row.name ?? row.email ?? "this admin");
    if (!ok) return;
    setBusyId(row.id);
    try {
      await apiFetch("/api/admin/users/delete", { method: "POST", body: JSON.stringify({ id: row.id }) }, "admin");
      notifyToast({ icon: "success", title: "Admin removed" });
      await load();
    } catch (err) {
      notifyToast({ icon: "error", title: "Failed to remove admin", text: err instanceof ApiError ? err.message : "Please try again." });
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="Admin Users" role="admin" profile={profile} navLinks={navLinks} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
        <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
          <div className="h-[500px] w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader
        title="Admin Users"
        role="admin"
        profile={profile}
        navLinks={navLinks}
        onSync={sync}
        syncing={syncing}
        lastSyncedAt={lastSyncedAt}
        districts={districts}
      />
      <HelpPanel pageKey="admin-users" title="Admin users">
        <p>
          Only visible to the owner account. Every admin here can still lock/unlock districts,
          view data, and export — this page only controls who has an admin login at all. At
          least one admin must always remain, and you can&apos;t remove your own account.
        </p>
      </HelpPanel>
      <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            disabled={busyId === "new"}
            onClick={addAdmin}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            + Add Admin
          </button>
        </div>

        <div className="min-h-[300px] max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Name</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Email</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Designation</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Added</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    {loading ? "Loading..." : "No admin users."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white align-top dark:border-slate-800 dark:bg-slate-900">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.email ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.designation ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{formatIST(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => editAdmin(row)}
                          className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => deleteAdmin(row)}
                          className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        >
                          Remove
                        </button>
                      </div>
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
