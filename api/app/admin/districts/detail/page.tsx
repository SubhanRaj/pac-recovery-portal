"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DUES_FIELD_LABELS, isMoneyField } from "@/lib/dues-fields";
import { DUES_FIELD_ORDER } from "@/lib/dues-row";
import { formatIST } from "@/lib/format";
import { getNavDistrictId, onNavDistrictIdChange } from "@/lib/adminNav";
import { ApiError } from "@/lib/api";
import { notifyToast, promptUnlockReason } from "@/lib/alerts";
import { useAdminData } from "@/lib/useAdminData";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Unlock Requests", href: "/admin/unlock-requests" },
  { label: "Audit Log", href: "/admin/audit" },
];

function formatValue(field: (typeof DUES_FIELD_ORDER)[number], value: number) {
  return isMoneyField(field)
    ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
    : value.toLocaleString("en-IN");
}

// Which district to show comes from sessionStorage (lib/adminNav.ts), set by whatever link
// sent the admin here — not a ?id= URL query string, same reasoning as the reference project
// (static export, no server to resolve dynamic paths).
export default function DistrictDetailPage() {
  const [districtId, setDistrictId] = useState<number | null>(null);
  const { ready, profile, districts, pacDues, sync, syncing, lastSyncedAt, unlock, error, setError } = useAdminData();

  useEffect(() => {
    setDistrictId(getNavDistrictId());
    return onNavDistrictIdChange(setDistrictId);
  }, []);

  const district = districts.find((d) => d.id === districtId);
  // Every period this district has ever had, most recent first — unlike the reference project's
  // fixed 5-FY column matrix, this domain can accumulate an arbitrary number of periods over
  // time (see pac-recovery-migration-plan.md §3's "Open Next Period" mechanic).
  const periodRows = useMemo(
    () => pacDues.filter((p) => p.districtId === districtId).sort((a, b) => (a.period < b.period ? 1 : -1)),
    [pacDues, districtId]
  );
  const current = periodRows[0];

  async function handleUnlock(id: number, name: string, period: string) {
    const reason = await promptUnlockReason(name);
    if (!reason) return;
    try {
      await unlock(id, period, reason);
      notifyToast({ icon: "success", title: "District unlocked" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unlock failed.");
    }
  }

  if (!ready || districtId === null) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="District Detail" role="admin" profile={profile} navLinks={NAV_LINKS} />
        <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 lg:px-10">
          <div className="mb-6 h-8 w-48 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="min-h-[500px] w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="District Detail" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 lg:px-10">
        <Link
          href="/admin/districts"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          <i className="ti ti-chevron-left text-base" />
          Back to Districts
        </Link>

        {!district ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            District not found in the local cache — try Sync (top right) and reopen this page.
          </p>
        ) : (
          <>
            {error && (
              <div className="mb-4">
                <Banner variant="error">{error}</Banner>
              </div>
            )}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{district.districtName}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Gross Dues: {district.totalDues !== null ? `₹${district.totalDues.toLocaleString("en-IN")}` : "—"}
                    </span>
                    {current && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          current.lockStatus === 1
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        }`}
                      >
                        <i className={`ti ${current.lockStatus === 1 ? "ti-lock" : "ti-lock-open"} text-sm`} />
                        {current.period} — {current.lockStatus === 1 ? "Locked" : "Unlocked"}
                      </span>
                    )}
                    {current?.lockStatus === 1 && (
                      <button
                        onClick={() => handleUnlock(district.id, district.districtName, current.period)}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                      >
                        <i className="ti ti-lock-open text-sm" />
                        Unlock
                      </button>
                    )}
                    {district.deoEmail && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        <i className="ti ti-mail text-sm" />
                        {district.deoEmail}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {current?.lockStatus === 1 && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500 dark:text-slate-400">
                    Locked by <span className="font-medium text-slate-800 dark:text-slate-200">{current.submittedByName ?? "—"}</span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    on <span className="font-medium text-slate-800 dark:text-slate-200">{formatIST(current.lockedAt)}</span> IST
                  </p>
                </div>
              )}
              {current?.lockStatus === 0 && current.unlockedAt && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500 dark:text-slate-400">
                    Last unlocked by{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{current.unlockedBy ?? "—"}</span> on{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{formatIST(current.unlockedAt)}</span> IST
                  </p>
                  {current.unlockReason && (
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      Reason: <span className="font-medium text-slate-800 dark:text-slate-200">{current.unlockReason}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800">
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Period
                    </th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Opening Balance
                    </th>
                    {DUES_FIELD_ORDER.map((field) => (
                      <th
                        key={field}
                        className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      >
                        {DUES_FIELD_LABELS[field]}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Net Recoverable
                    </th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {periodRows.length === 0 ? (
                    <tr>
                      <td colSpan={DUES_FIELD_ORDER.length + 3} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                        No periods recorded for this district yet.
                      </td>
                    </tr>
                  ) : (
                    periodRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">{row.period}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                          ₹{row.openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        {DUES_FIELD_ORDER.map((field) => (
                          <td key={field} className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                            {formatValue(field, row[field])}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                          ₹{row.netRecoverable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              row.lockStatus === 1
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            }`}
                          >
                            {row.lockStatus === 1 ? "Locked" : "Unlocked"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
