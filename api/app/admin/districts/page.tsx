"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, OPENING_BALANCE_LABEL, isMoneyField, englishLabel } from "@/lib/pac-fields";
import { formatIST } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { notifyToast, promptUnlockReason, confirmTruncateDemo } from "@/lib/alerts";
import { exportDistrictsToXlsx, exportDistrictsToSql } from "@/lib/export";
import { useAdminData } from "@/lib/useAdminData";
import { setNavDistrictId, consumeNavStatusFilter } from "@/lib/adminNav";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";
import type { CachedDistrict } from "@/lib/client-db";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Unlock Requests", href: "/admin/unlock-requests" },
  { label: "Audit Log", href: "/admin/audit" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;

type Row = CachedDistrict &
  Record<(typeof PAC_FIELD_ORDER)[number], number> & { openingBalance: number; netRecoverable: number };

const columnHelper = createColumnHelper<Row>();

function formatValue(field: (typeof PAC_FIELD_ORDER)[number], value: number) {
  return isMoneyField(field)
    ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
    : value.toLocaleString("en-IN");
}

export default function DistrictsPage() {
  const router = useRouter();
  const { ready, profile, districts, pacData, sync, syncing, lastSyncedAt, unlock, truncateDemo, error, setError } = useAdminData();
  const [selectedYear, setSelectedYear] = useState<(typeof FINANCIAL_YEARS)[number]>(FINANCIAL_YEARS[0]);
  const [statusFilter, setStatusFilter] = useState<"all" | "locked" | "unlocked">("all");
  const [globalFilter, setGlobalFilter] = useState("");

  // Deep-linked from the Admin Dashboard's Locked/Unlocked KPI cards, via sessionStorage
  // (lib/adminNav.ts) rather than a ?status= URL query string.
  useEffect(() => {
    const status = consumeNavStatusFilter();
    if (status) setStatusFilter(status);
  }, []);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [isChangingFY, setIsChangingFY] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("excise-portal:districts-pageSize");
    if (saved) {
      setPagination((p) => ({ ...p, pageSize: Number(saved) }));
    }
  }, []);
  const [exporting, setExporting] = useState<"xlsx" | "sql" | null>(null);

  const hasDemoDistrict = districts.some(d => d.districtName === "Demo District");

  async function handleUnlock(districtId: number, districtName: string) {
    const reason = await promptUnlockReason(districtName);
    if (!reason) return;
    try {
      await unlock(districtId, reason);
      notifyToast({ icon: "success", title: "District unlocked." });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unlock failed.");
    }
  }

  async function exportExcel() {
    setExporting("xlsx");
    window.Swal.fire({
      title: "Preparing Excel Export",
      html: "Syncing latest data...<br><br><i class='ti ti-loader animate-spin text-4xl text-blue-600'></i>",
      showConfirmButton: false,
      allowOutsideClick: false,
    });
    try {
      const fresh = await sync();
      // formatIST(), not toLocaleString("en-IN") alone — the latter only sets locale
      // conventions, not the timezone, so it silently renders in the admin's browser's own
      // local zone instead of real IST (see CLAUDE.md's formatIST() note).
      const now = formatIST(new Date().toISOString());
      const result = await window.Swal.fire({
        title: "Export Ready",
        html: `Data is synced and ready.<br>Generated at: <strong>${now} IST</strong>`,
        icon: "success",
        showConfirmButton: true,
        confirmButtonText: "Download Excel File",
        confirmButtonColor: "#2563eb",
        showCancelButton: true,
        cancelButtonText: "Cancel",
        allowOutsideClick: false,
      });
      if (result.isConfirmed) {
        await exportDistrictsToXlsx(fresh?.districts ?? districts, fresh?.pacData ?? pacData);
      }
    } finally {
      setExporting(null);
    }
  }

  async function exportSql() {
    setExporting("sql");
    window.Swal.fire({
      title: "Preparing SQL Export",
      html: "Syncing latest data...<br><br><i class='ti ti-loader animate-spin text-4xl text-blue-600'></i>",
      showConfirmButton: false,
      allowOutsideClick: false,
    });
    try {
      const fresh = await sync();
      // formatIST(), not toLocaleString("en-IN") alone — the latter only sets locale
      // conventions, not the timezone, so it silently renders in the admin's browser's own
      // local zone instead of real IST (see CLAUDE.md's formatIST() note).
      const now = formatIST(new Date().toISOString());
      const result = await window.Swal.fire({
        title: "Export Ready",
        html: `Data is synced and ready.<br>Generated at: <strong>${now} IST</strong>`,
        icon: "success",
        showConfirmButton: true,
        confirmButtonText: "Download SQL File",
        confirmButtonColor: "#2563eb",
        showCancelButton: true,
        cancelButtonText: "Cancel",
        allowOutsideClick: false,
      });
      if (result.isConfirmed) {
        exportDistrictsToSql(fresh?.districts ?? districts, fresh?.pacData ?? pacData);
      }
    } finally {
      setExporting(null);
    }
  }

  const rows: Row[] = useMemo(
    () =>
      districts
        .filter((d) =>
          statusFilter === "all" ? true : statusFilter === "locked" ? d.lockStatus === 1 : d.lockStatus === 0
        )
        .map((d) => {
          const match = pacData.find((p) => p.districtId === d.id && p.financialYear === selectedYear);
          const values = Object.fromEntries(
            PAC_FIELD_ORDER.map((field) => [field, match?.[field] ?? 0])
          ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
          return { ...d, ...values, openingBalance: match?.openingBalance ?? 0, netRecoverable: match?.netRecoverable ?? 0 };
        }),
    [districts, pacData, selectedYear, statusFilter]
  );

  const totals = useMemo(() => {
    const sums = Object.fromEntries(
      PAC_FIELD_ORDER.map((field) => [field, rows.reduce((sum, r) => sum + r[field], 0)])
    ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
    // Summing across districts for one FY (not across years, which would double-count the
    // carried-forward balance) is a legitimate total — see CLAUDE.md's Data model section.
    const openingBalanceTotal = rows.reduce((sum, r) => sum + r.openingBalance, 0);
    const netRecoverableTotal = rows.reduce((sum, r) => sum + r.netRecoverable, 0);
    return { sums, openingBalanceTotal, netRecoverableTotal };
  }, [rows]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("districtName", {
        header: "District",
        cell: (info) => info.getValue(),
      }),
      columnHelper.display({
        id: "openingBalance",
        header: () => englishLabel(OPENING_BALANCE_LABEL),
        cell: ({ row }) => `₹${row.original.openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      }),
      columnHelper.accessor("lockStatus", {
        header: "Status",
        cell: (info) => (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              info.getValue() === 1
                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            }`}
          >
            <i className={`ti ${info.getValue() === 1 ? "ti-lock" : "ti-lock-open"} text-sm`} />
            {info.getValue() === 1 ? "Locked" : "Unlocked"}
          </span>
        ),
      }),
      ...PAC_FIELD_ORDER.map((field) =>
        columnHelper.accessor(field, {
          // English only — matches the Excel export's audience convention (see CLAUDE.md),
          // no Hindi tooltip needed since the header text itself is already the short form.
          header: () => englishLabel(PAC_FIELD_LABELS[field]),
          cell: (info) => formatValue(field, info.getValue()),
        })
      ),
      columnHelper.display({
        id: "netRecoverable",
        header: "Net Recoverable",
        cell: ({ row }) => `₹${row.original.netRecoverable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      }),
      columnHelper.display({
        id: "actions",
        header: "Action",
        cell: ({ row }) =>
          row.original.lockStatus === 1 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUnlock(row.original.id, row.original.districtName);
              }}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Unlock
            </button>
          ) : null,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter, sorting, pagination, columnPinning: { left: ["districtName"] } },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 p-6 dark:bg-slate-950">
        <div className="h-8 w-64 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="mt-8 flex gap-4">
          <div className="h-10 w-40 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="h-10 w-40 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="mt-6 flex-1 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="Districts" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
      <HelpPanel pageKey="admin-districts" title="Using the districts table">
        <p>
          Click a column header to sort; use the search box to filter by district name. The
          District column stays pinned while you scroll horizontally. Click anywhere on a row
          to open that district&apos;s full revenue detail across all 5 years.
        </p>
        <p>
          The bottom row totals every numeric column for the selected year across all 75
          districts.
        </p>
        <p>
          <strong>Export as Excel Workbook</strong> re-syncs first, then builds a 5-sheet
          spreadsheet from the freshly-synced data. <strong>Export as SQL</strong> does the same
          re-sync but downloads a plain <code>.sql</code> restore script instead — useful for
          taking a manual backup. Both buttons show &quot;Exporting…&quot; while this runs so it
          doesn&apos;t look like the page has frozen. <strong>Unlock</strong> lets a District
          Excise Officer re-edit a submission they already locked.
        </p>
      </HelpPanel>
      <div className="flex w-full flex-1 flex-col px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="mb-4 flex flex-nowrap items-center justify-between gap-6">
          <input
            type="text"
            placeholder="Search district..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full max-w-[13rem] shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "locked" | "unlocked")}
              className="min-w-[9.5rem]"
            >
              <option value="all">All statuses</option>
              <option value="locked">Locked</option>
              <option value="unlocked">Unlocked</option>
            </Select>
            <Select
              value={selectedYear}
              size="md"
              disabled={isChangingFY}
              onChange={(e) => {
                const val = e.target.value as (typeof FINANCIAL_YEARS)[number];
                setIsChangingFY(true);
                setTimeout(() => {
                  setSelectedYear(val);
                  setIsChangingFY(false);
                }, 400);
              }}
            >
              {FINANCIAL_YEARS.map((y) => (
                <option key={y} value={y}>
                  FY {y}
                </option>
              ))}
            </Select>
            <Button size="xs" onClick={exportExcel} disabled={exporting !== null}>
              <i className={`ti ti-file-spreadsheet text-sm ${exporting === "xlsx" ? "animate-pulse" : ""}`} />
              {exporting === "xlsx" ? "Exporting..." : "Export as Excel Workbook"}
            </Button>
            <Button size="xs" onClick={exportSql} disabled={exporting !== null}>
              <i className={`ti ti-database-export text-sm ${exporting === "sql" ? "animate-pulse" : ""}`} />
              {exporting === "sql" ? "Exporting..." : "Export as SQL"}
            </Button>
            {hasDemoDistrict && (
              <Button
                variant="dangerSoft"
                size="xs"
                onClick={async () => {
                  if (await confirmTruncateDemo()) {
                    try {
                      await truncateDemo();
                      notifyToast({ icon: "success", title: "Demo District permanently deleted." });
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : "Truncate failed.");
                    }
                  }
                }}
              >
                <i className="ti ti-eraser text-sm" />
                Truncate Demo
              </Button>
            )}
          </div>
        </div>

        {/* max-h-[70vh] is a real cap (not just min-h/flex-1) so this scrolls internally at
            every breakpoint — every ancestor up to <body> only sets min-height (see
            layout.tsx), so flex-1 alone never clips and the table would otherwise just grow
            the whole page. This cap is what lets the sticky <thead> below actually freeze:
            position: sticky needs a real scrolling ancestor to stick within, and an
            lg:max-h-none override here previously removed that ancestor on desktop, leaving
            the header's sticky context fall back to the page/viewport where it competed with
            AppHeader's own sticky top-0 instead of freezing inside this table. Always capping
            it keeps the header frozen consistently at every screen size. */}
        <div className="max-h-[70vh] min-h-[50vh] flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm [scrollbar-width:thin] scroll-smooth dark:border-slate-800 dark:bg-slate-900">
          {isChangingFY ? (
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
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-slate-50 dark:bg-slate-800">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`sticky top-0 z-20 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400 ${
                        header.column.getCanSort()
                          ? "cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100"
                          : ""
                      } ${header.column.getIsPinned() ? "left-0 z-30" : ""}`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ??
                        (header.column.getCanSort() ? " ⇅" : "")}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody key={selectedYear + statusFilter} className="animate-in fade-in duration-500">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => {
                    setNavDistrictId(row.original.id);
                    router.push("/admin/districts/detail");
                  }}
                  className="cursor-pointer border-t border-slate-100 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200 ${
                        cell.column.getIsPinned() ? "sticky left-0 z-10 bg-inherit font-medium" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 z-20 border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                <td className="sticky left-0 z-30 whitespace-nowrap bg-slate-100 px-3 py-2.5 dark:bg-slate-800">Total</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  ₹{totals.openingBalanceTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" />
                {PAC_FIELD_ORDER.map((field) => (
                  <td key={field} className="whitespace-nowrap px-3 py-2.5">
                    {formatValue(field, totals.sums[field])}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2.5">
                  ₹{totals.netRecoverableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              value={pagination.pageSize}
              onChange={(e) => {
                const size = Number(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0, pageSize: size }));
                localStorage.setItem("excise-portal:districts-pageSize", String(size));
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <span>
              of {table.getFilteredRowModel().rows.length} district{table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              style={!table.getCanPreviousPage() ? { cursor: "not-allowed" } : undefined}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"
            >
              <i className="ti ti-chevron-left text-sm" />
            </button>
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              style={!table.getCanNextPage() ? { cursor: "not-allowed" } : undefined}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"
            >
              <i className="ti ti-chevron-right text-sm" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
