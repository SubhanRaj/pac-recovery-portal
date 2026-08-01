"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, OPENING_BALANCE_LABEL, englishLabel, isMoneyField } from "@/lib/pac-fields";
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

function formatValue(field: (typeof PAC_FIELD_ORDER)[number], value: number) {
  return isMoneyField(field)
    ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
    : value.toLocaleString("en-IN");
}

type RcDetail = { rcNumber: string; rcAmount: number; stayed: boolean };

// Lenient — this is a read-only admin display of a value the server already validated at
// submit time (see @/lib/pac-fields.ts), not a fresh zero-trust boundary.
function parseRcDetails(raw: string | undefined): RcDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Which district to show comes from sessionStorage (lib/adminNav.ts), set by whatever link
// sent the admin here (a table row, the header's district search, the dashboard's top-5 list)
// — not a ?id= URL query string. This app is a fully static export (next.config.ts:
// output: "export") with no server to resolve arbitrary paths at request time, so a
// /districts/[id] dynamic segment would need every id enumerated via generateStaticParams;
// sessionStorage avoids that without putting the id in the URL either.
export default function DistrictDetailPage() {
  const [districtId, setDistrictId] = useState<number | null>(null);
  const { ready, profile, districts, pacData, sync, syncing, lastSyncedAt, unlock, error, setError } = useAdminData();
  const [query, setQuery] = useState("");
  // Which FY's RC Details disclosure is open, keyed by financial year — only one open at a
  // time, toggled by clicking the "N RCs" badge next to that FY's RC Amount cell.
  const [openRcFy, setOpenRcFy] = useState<string | null>(null);

  useEffect(() => {
    setDistrictId(getNavDistrictId());
    // Jumping to a different district while already on this page doesn't navigate (same URL,
    // no remount) — this keeps the page in sync with the header's district-jump search.
    return onNavDistrictIdChange(setDistrictId);
  }, []);

  const district = districts.find((d) => d.id === districtId);
  const yearRows = useMemo(
    () => FINANCIAL_YEARS.map((fy) => pacData.find((p) => p.districtId === districtId && p.financialYear === fy)),
    [pacData, districtId]
  );
  // All 5 years' rows share the same lock event (one atomic submit), so any row that exists
  // carries the same submittedByName/lockedAt — just read off the first one found.
  const lockInfo = yearRows.find((r) => r);

  // Search across every year's value for a field, on both the raw number and its formatted
  // (₹-prefixed, comma-grouped) form, so "50000" or "50,000" or "₹50,000.00" all match.
  const q = query.trim().toLowerCase();
  const visibleFields = q
    ? PAC_FIELD_ORDER.filter((field) =>
        yearRows.some((row) => {
          const value = row?.[field] ?? 0;
          return String(value).includes(q) || formatValue(field, value).toLowerCase().includes(q);
        })
      )
    : PAC_FIELD_ORDER;

  async function handleUnlock(id: number, name: string) {
    const reason = await promptUnlockReason(name);
    if (!reason) return;
    try {
      await unlock(id, reason);
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
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        district.lockStatus === 1
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      <i className={`ti ${district.lockStatus === 1 ? "ti-lock" : "ti-lock-open"} text-sm`} />
                      {district.lockStatus === 1 ? "Locked" : "Unlocked"}
                    </span>
                    {district.lockStatus === 1 && (
                      // Hand-styled to the same pill dimensions as the Locked/email badges it
                      // sits beside, rather than a full Button.tsx instance — the earlier
                      // Button size="sm" was noticeably taller/wider than its badge neighbors.
                      <button
                        onClick={() => handleUnlock(district.id, district.districtName)}
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
              {lockInfo && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500 dark:text-slate-400">
                    Locked by <span className="font-medium text-slate-800 dark:text-slate-200">{lockInfo.submittedByName ?? "—"}</span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    on <span className="font-medium text-slate-800 dark:text-slate-200">{formatIST(lockInfo.lockedAt)}</span> IST
                  </p>
                </div>
              )}
              {district.lockStatus === 0 && district.unlockedAt && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500 dark:text-slate-400">
                    Last unlocked by{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{district.unlockedBy ?? "—"}</span> on{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{formatIST(district.unlockedAt)}</span> IST
                  </p>
                  {district.unlockReason && (
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      Reason: <span className="font-medium text-slate-800 dark:text-slate-200">{district.unlockReason}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mb-3">
              <input
                type="text"
                placeholder="Search field or amount..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {/* max-h-[70vh] gives this table its own vertical scrollbar on small screens
                (overflow-x-auto alone was horizontal-only) instead of just extending the whole
                page — same reasoning as the districts table above. The header stays sticky
                within that scroll so it doesn't scroll out of view first. */}
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {/* No w-full — with the auto (default) table layout, forcing the table to exactly
                  the container's width squeezes/clips money columns instead of letting them
                  grow, same issue documented for the districts table below. Content sizes
                  itself; the wrapper's overflow-auto is the fallback past that. */}
              <table className="border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800">
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Field
                    </th>
                    {FINANCIAL_YEARS.map((fy) => (
                      <th
                        key={fy}
                        className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      >
                        FY {fy}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!q && (
                    <tr className="border-t border-slate-100 bg-slate-50 font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
                      <td className="whitespace-nowrap px-3 py-2.5">{englishLabel(OPENING_BALANCE_LABEL)}</td>
                      {yearRows.map((row, i) => (
                        <td key={FINANCIAL_YEARS[i]} className="whitespace-nowrap px-3 py-2.5">
                          ₹{(row?.openingBalance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      ))}
                    </tr>
                  )}
                  {visibleFields.length === 0 ? (
                    <tr>
                      <td colSpan={FINANCIAL_YEARS.length + 1} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                        No fields match &quot;{query}&quot;.
                      </td>
                    </tr>
                  ) : (
                    visibleFields.map((field) => (
                      <tr key={field} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                          {PAC_FIELD_LABELS[field]}
                        </td>
                        {yearRows.map((row, i) => {
                          const fy = FINANCIAL_YEARS[i];
                          if (field !== "rcAmount") {
                            return (
                              <td key={fy} className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                                {formatValue(field, row?.[field] ?? 0)}
                              </td>
                            );
                          }
                          const rcDetails = parseRcDetails(row?.rcDetails);
                          return (
                            <td key={fy} className="relative whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-2">
                                {formatValue(field, row?.[field] ?? 0)}
                                {rcDetails.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setOpenRcFy((v) => (v === fy ? null : fy))}
                                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                                  >
                                    {rcDetails.length} RC{rcDetails.length === 1 ? "" : "s"}
                                    <i className={`ti text-sm ${openRcFy === fy ? "ti-chevron-up" : "ti-chevron-down"}`} />
                                  </button>
                                )}
                              </div>
                              {openRcFy === fy && (
                                <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                  <table className="w-full border-collapse text-xs">
                                    <thead>
                                      <tr className="text-left font-medium text-slate-500 dark:text-slate-400">
                                        <th className="py-1 pr-2">RC Number</th>
                                        <th className="py-1 pr-2 text-right">Amount</th>
                                        <th className="py-1 text-center">Stayed</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rcDetails.map((d, di) => (
                                        <tr key={di} className="border-t border-slate-100 dark:border-slate-800">
                                          <td className="max-w-[9rem] truncate py-1 pr-2 font-normal">{d.rcNumber}</td>
                                          <td className="py-1 pr-2 text-right tabular-nums font-normal">
                                            ₹{d.rcAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                          </td>
                                          <td className="py-1 text-center">
                                            {d.stayed ? (
                                              <i className="ti ti-check text-sm text-amber-600 dark:text-amber-400" />
                                            ) : (
                                              <span className="text-slate-300 dark:text-slate-700">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                  {!q && (
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      <td className="whitespace-nowrap px-3 py-2.5">Net Recoverable</td>
                      {yearRows.map((row, i) => (
                        <td key={FINANCIAL_YEARS[i]} className="whitespace-nowrap px-3 py-2.5">
                          ₹{(row?.netRecoverable ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      ))}
                    </tr>
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
