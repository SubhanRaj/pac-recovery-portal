"use client";

import { useMemo } from "react";
import { DUES_FIELD_ORDER, type Row } from "@/lib/dues-row";
import { useAdminData } from "@/lib/useAdminData";
import AppHeader, { adminNavLinks } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";
import AdminDashboard from "@/components/AdminDashboard";

export default function AdminDashboardPage() {
  const { ready, profile, districts, pacDues, sync, syncing, lastSyncedAt, error } = useAdminData();
  const navLinks = adminNavLinks(profile?.isOwner);

  // One row per district, the district's latest pac_dues period — no cross-year summing needed
  // here, unlike the reference project's 5-FY totals, since this domain has one period per row.
  const rows: Row[] = useMemo(() => {
    const latestByDistrict = new Map<number, (typeof pacDues)[number]>();
    for (const p of pacDues) {
      const existing = latestByDistrict.get(p.districtId);
      if (!existing || p.period > existing.period) latestByDistrict.set(p.districtId, p);
    }
    return districts.map((d) => {
      const p = latestByDistrict.get(d.id);
      const values = Object.fromEntries(DUES_FIELD_ORDER.map((f) => [f, p ? p[f] : 0])) as Record<
        (typeof DUES_FIELD_ORDER)[number],
        number
      >;
      return {
        ...d,
        ...values,
        openingBalance: p?.openingBalance ?? 0,
        netRecoverable: p?.netRecoverable ?? 0,
        lockStatus: p?.lockStatus ?? 0,
        period: p?.period ?? null,
      };
    });
  }, [districts, pacDues]);

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="Admin Dashboard" role="admin" profile={profile} navLinks={navLinks} />
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
      <AppHeader title="Admin Dashboard" role="admin" profile={profile} navLinks={navLinks} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
      <HelpPanel pageKey="admin-dashboard" title="Using this dashboard">
        <p>
          Every figure here is each district&apos;s most recent recovery period — this portal tracks
          one open period per district at a time, not a multi-year loop.
        </p>
        <p>
          <strong>Sync</strong> (top right) pulls the latest districts and pac_dues data from
          the server into this browser&apos;s local cache.
        </p>
        <p>
          Go to <strong>Districts</strong> to view/search all 75 districts, lock or unlock a
          submission, or export to Excel.
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
