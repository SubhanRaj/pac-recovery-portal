"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIST } from "@/lib/format";
import { apiFetch, ApiError } from "@/lib/api";
import { notifyToast, confirmDeleteAdmin } from "@/lib/alerts";
import { useAdminData } from "@/lib/useAdminData";
import AppHeader, { adminNavLinks } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import HelpPanel from "@/components/ui/HelpPanel";
import AdminUserDrawer, { type AdminUserRow } from "@/components/ui/AdminUserDrawer";

type FormState = { name: string; email: string; designation: string };

export default function AdminUsersPage() {
  const router = useRouter();
  const { ready, profile, districts, sync, syncing, lastSyncedAt } = useAdminData();
  const navLinks = adminNavLinks(profile?.isOwner);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AdminUserRow | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Hiding this page from a non-owner admin is UX only — the API routes' own OWNER_EMAIL check
  // is the real boundary.
  useEffect(() => {
    if (ready && profile && !profile.isOwner) router.replace("/admin");
  }, [ready, profile, router]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ rows: AdminUserRow[] }>("/api/admin/users", undefined, "admin");
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

  function startCreate() {
    setEditingRow(null);
    setDrawerError(null);
    setDrawerOpen(true);
  }

  function startEdit(row: AdminUserRow) {
    setEditingRow(row);
    setDrawerError(null);
    setDrawerOpen(true);
  }

  async function saveDrawer(form: FormState) {
    setDrawerError(null);
    setSaving(true);
    try {
      if (editingRow === null) {
        await apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify(form) }, "admin");
        notifyToast({ icon: "success", title: "Admin added" });
      } else {
        await apiFetch(
          "/api/admin/users",
          { method: "PATCH", body: JSON.stringify({ id: editingRow.id, ...form }) },
          "admin"
        );
        notifyToast({ icon: "success", title: "Admin updated" });
      }
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setDrawerError(err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AdminUserRow) {
    if (!(await confirmDeleteAdmin(row.name ?? row.email ?? "this admin"))) return;
    try {
      await apiFetch("/api/admin/users", { method: "DELETE", body: JSON.stringify({ id: row.id }) }, "admin");
      notifyToast({ icon: "success", title: "Admin removed" });
      await load();
    } catch (err) {
      notifyToast({ icon: "error", title: "Failed", text: err instanceof ApiError ? err.message : "Please try again." });
    }
  }

  if (!ready || !profile?.isOwner) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <div className="m-6 h-8 w-64 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="mx-6 h-[400px] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
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
      <HelpPanel pageKey="admin-users" title="Managing admin accounts">
        <p>
          Add new admin/HQ officials here, or edit an existing one&apos;s name, email, or
          designation. The owner account (whoever&apos;s email matches this deployment&apos;s
          <code> OWNER_EMAIL</code>) can&apos;t have its email changed or be deleted here — that
          would lock the owner out of owner-only pages like this one.
        </p>
      </HelpPanel>
      <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="mb-4 flex items-center justify-end">
          <Button size="sm" onClick={startCreate}>
            <i className="ti ti-user-plus text-base" />
            Add Admin
          </Button>
        </div>

        {drawerOpen && (
          <AdminUserDrawer
            user={editingRow}
            saving={saving}
            error={drawerError}
            onClose={() => setDrawerOpen(false)}
            onSave={saveDrawer}
          />
        )}

        <div className="min-h-[400px] max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Name</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Email</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Designation</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Added (IST)</th>
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
                  <tr key={row.id} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {row.name ?? "—"}
                      {row.isOwner && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Owner
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.email}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.designation ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{formatIST(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                        >
                          Edit
                        </button>
                        {!row.isOwner && (
                          <button
                            type="button"
                            onClick={() => remove(row)}
                            className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                          >
                            Remove
                          </button>
                        )}
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
