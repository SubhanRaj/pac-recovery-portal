"use client";

import { useMemo } from "react";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER } from "@/lib/pac-fields";
import { useAdminData } from "@/lib/useAdminData";
import type { CachedDistrict } from "@/lib/client-db";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";
import AdminDashboard from "@/components/AdminDashboard";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Unlock Requests", href: "/admin/unlock-requests" },
  { label: "Audit Log", href: "/admin/audit" },
];

type Row = CachedDistrict & Record<(typeof PAC_FIELD_ORDER)[number], number> & { netRecoverable: number };

export default function AdminDashboardPage() {
  const { ready, profile, districts, pacData, sync, syncing, lastSyncedAt, error } = useAdminData();

  // A district's lock/PAC submission is all 5 years at once (one atomic submit — see
  // CLAUDE.md), never partial, so there's no such thing as "locked for FY 2023-24 but not
  // 2024-25" — a per-year filter on this overview page was misleading, not just unnecessary.
  // The six raw PAC fields are summed across all 5 years per district, i.e. the cumulative
  // total raised/recovered as of 31 March 2026. Districts/page.tsx keeps its own per-year
  // filter, which is legitimately useful there for inspecting one year's figures per district.
  const rows: Row[] = useMemo(
    () =>
      districts.map((d) => {
        const values = Object.fromEntries(
          PAC_FIELD_ORDER.map((field) => [
            field,
            FINANCIAL_YEARS.reduce((sum, fy) => {
              const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
              return sum + (match?.[field] ?? 0);
            }, 0),
          ])
        ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
        // Net Recoverable is NOT summed across years like the fields above — it's a cumulative
        // running balance, so the FY 2025-26 (final year) value already includes everything
        // carried forward. See CLAUDE.md's Data model section for why summing years here would
        // double-count it.
        const finalYear = FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1];
        const finalYearRow = pacData.find((p) => p.districtId === d.id && p.financialYear === finalYear);
        return { ...d, ...values, netRecoverable: finalYearRow?.netRecoverable ?? 0 };
      }),
    [districts, pacData]
  );

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="Admin Dashboard" role="admin" profile={profile} navLinks={NAV_LINKS} />
        <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
          <div className="mt-4 h-64 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 h-64 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="Admin Dashboard" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
      <HelpPanel pageKey="admin-dashboard" title="Using this dashboard">
        <p>
          Districts, locked/unlocked counts, and gross arrears are totals across all 5 financial
          years (FY 2021-22 to 2025-26). Net Recoverable (and the top 5 districts by dues) is each
          district&apos;s running balance as of 31 March 2026, not a sum across years.
        </p>
        <p>
          <strong>Sync</strong> (top right) pulls the latest districts and PAC data from the
          server into this browser&apos;s local cache.
        </p>
        <p>
          Go to <strong>Districts</strong> to view/search all 75 districts by a single financial
          year, lock or unlock a submission, export to Excel, or bulk-provision DEO logins via
          the Excel template.
        </p>
      </HelpPanel>
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6 lg:px-10">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <AdminDashboard rows={rows} />
      </div>
    </div>
  );
}
