import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Chart } from "chart.js";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, plainLabel } from "@/lib/pac-fields";
import { setNavDistrictId, setNavStatusFilter } from "@/lib/adminNav";
import type { CachedDistrict } from "@/lib/client-db";

type Row = CachedDistrict & Record<(typeof PAC_FIELD_ORDER)[number], number> & { netRecoverable: number };

// Every KpiCard/chart/list on this dashboard is a total across the full 5-year window, not one
// FY at a time — see the comment in admin/page.tsx for why a per-year filter didn't make sense
// here. This is just the label for that window.
const PERIOD_LABEL = `FY ${FINANCIAL_YEARS[0]} – ${FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1]}`;

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

// Green = Locked, red = Unlocked — inverted from the usual "red is bad" reading, because this
// portal's whole goal is 100% of districts *locked* (submission complete); an unlocked district
// is the one still needing attention, so it gets the red. Matches KPI_COLORS' Locked/Unlocked
// card colors below — keep both in sync if this ever changes.
const LOCKED_COLOR = "#10b981";
const UNLOCKED_COLOR = "#ef4444";

// Chart.js loads from a CDN <script lazyOnload> (layout.tsx), so it may not be on
// `window` the instant this mounts — poll briefly instead of assuming it's ready.
function LockStatusDonut({ locked, unlocked }: { locked: number; unlocked: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    function render() {
      if (!canvasRef.current || cancelled) return;
      chartRef.current?.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: "doughnut",
        data: {
          labels: ["Locked", "Unlocked"],
          datasets: [{ data: [locked, unlocked], backgroundColor: [LOCKED_COLOR, UNLOCKED_COLOR], borderWidth: 0 }],
        },
        options: {
          plugins: { legend: { display: false } },
          cutout: "70%",
          maintainAspectRatio: false,
        },
      });
    }

    if (window.Chart) {
      render();
    } else {
      poll = setInterval(() => {
        if (window.Chart) {
          clearInterval(poll);
          render();
        }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      chartRef.current?.destroy();
    };
  }, [locked, unlocked]);

  return (
    <div className="relative h-44 w-44 shrink-0">
      <canvas ref={canvasRef} />
    </div>
  );
}

// Vertical bar chart (Chart.js default 'bar' orientation — category names along the x-axis,
// values as bar height) replacing the old plain-CSS horizontal progress-bar list, so the top-15
// districts get the same real-chart treatment as the lock-status donut instead of looking like a
// lesser, hand-rolled version next to it.
function TopDistrictsBarChart({
  districts,
  onBarClick,
}: {
  districts: { name: string; dues: number }[];
  onBarClick: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    function render() {
      if (!canvasRef.current || cancelled) return;
      chartRef.current?.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels: districts.map((d) => d.name),
          datasets: [
            {
              data: districts.map((d) => d.dues),
              backgroundColor: "#2563eb",
              borderRadius: 4,
              maxBarThickness: 48,
            },
          ],
        },
        options: {
          plugins: { legend: { display: false } },
          maintainAspectRatio: false,
          onHover: (event, elements) => {
            const target = event.native?.target as HTMLElement | undefined;
            if (target) target.style.cursor = elements.length ? "pointer" : "default";
          },
          // Same district-detail navigation every other click-to-detail spot in admin uses
          // (setNavDistrictId + router.push, sessionStorage-based — see adminNav.ts, never a
          // ?id= query string) rather than the dead ?id= link this chart replaces.
          onClick: (_event, elements) => {
            if (elements.length) onBarClick(elements[0].index);
          },
          scales: {
            y: {
              ticks: { callback: (v) => `₹${Number(v).toLocaleString("en-IN")}` },
            },
          },
        },
      });
    }

    if (window.Chart) {
      render();
    } else {
      poll = setInterval(() => {
        if (window.Chart) {
          clearInterval(poll);
          render();
        }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      chartRef.current?.destroy();
    };
  }, [districts, onBarClick]);

  return (
    <div className="relative h-56 w-full max-w-full overflow-hidden sm:h-72">
      <canvas ref={canvasRef} />
    </div>
  );
}

const KPI_COLORS = {
  blue: {
    card: "border-blue-100 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30",
    badge: "bg-blue-600 text-white",
  },
  red: {
    card: "border-red-100 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30",
    badge: "bg-red-600 text-white",
  },
  emerald: {
    card: "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
    badge: "bg-emerald-600 text-white",
  },
  amber: {
    card: "border-amber-100 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
    badge: "bg-amber-500 text-white",
  },
  violet: {
    card: "border-violet-100 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30",
    badge: "bg-violet-600 text-white",
  },
} as const;

function KpiCard({
  label,
  value,
  icon,
  color,
  href,
  onClick,
}: {
  label: string;
  value: string;
  icon: string;
  color: keyof typeof KPI_COLORS;
  href?: string;
  // Alternative to `href` for cards that need to set sessionStorage nav state (see
  // lib/adminNav.ts) before navigating — a plain <Link href> can't carry that side effect,
  // since this app's cross-page filter state travels via sessionStorage, never a URL query
  // string (static export, no server to resolve dynamic paths — see CLAUDE.md).
  onClick?: () => void;
}) {
  const c = KPI_COLORS[color];
  const isNavigable = Boolean(href || onClick);
  const content = (
    <div
      className={`group rounded-lg border p-4 text-left transition-all ${c.card} ${
        isNavigable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${c.badge}`}>
          <i className={`ti ${icon} text-base`} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {isNavigable && (
          <i className="ti ti-chevron-right ml-auto text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
        )}
      </div>
      <p className="mt-2 break-words text-lg font-semibold tabular-nums text-slate-900 sm:text-xl dark:text-slate-100">{value}</p>
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full">
        {content}
      </button>
    );
  }
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function AdminDashboard({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const totalDistricts = rows.length;
  const locked = rows.filter((r) => r.lockStatus === 1).length;
  const unlocked = totalDistricts - locked;

  const sums = Object.fromEntries(
    PAC_FIELD_ORDER.map((field) => [field, rows.reduce((sum, r) => sum + r[field], 0)])
  ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
  // Not summed across years like the other fields — each district's netRecoverable is already a
  // FY 2025-26 cumulative figure that includes every prior year's carried-forward balance, so
  // summing years here would double-count it. See CLAUDE.md's Data model section.
  const netRecoverableTotal = rows.reduce((sum, r) => sum + r.netRecoverable, 0);

  const topDues = [...rows]
    .map((r) => ({ id: r.id, name: r.districtName, dues: r.netRecoverable }))
    .sort((a, b) => b.dues - a.dues)
    .slice(0, 15);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Districts" value={String(totalDistricts)} icon="ti-map-pin" color="blue" href="/admin/districts" />
        {/* Green = Locked, red = Unlocked — see LOCKED_COLOR/UNLOCKED_COLOR above for why this
            is inverted from the usual "red is bad" reading. */}
        <KpiCard
          label="Locked"
          value={String(locked)}
          icon="ti-lock"
          color="emerald"
          onClick={() => {
            setNavStatusFilter("locked");
            router.push("/admin/districts");
          }}
        />
        <KpiCard
          label="Unlocked"
          value={String(unlocked)}
          icon="ti-lock-open"
          color="red"
          onClick={() => {
            setNavStatusFilter("unlocked");
            router.push("/admin/districts");
          }}
        />
        <KpiCard label="Gross Arrears" value={formatMoney(sums.grossArrears)} icon="ti-report-money" color="amber" href="/admin/districts" />
        <KpiCard label="Net Recoverable" value={formatMoney(netRecoverableTotal)} icon="ti-cash" color="violet" href="/admin/districts" />
      </div>

      {/* Two full-width rows (not a side-by-side lg:grid-cols-2) — both the bar chart and the
          donut needed more room than a half-width column gave them. */}
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Top 15 districts by Net Recoverable — as of 31 March 2026
          </h3>
          <TopDistrictsBarChart
            districts={topDues}
            onBarClick={(index) => {
              const d = topDues[index];
              if (!d) return;
              setNavDistrictId(d.id);
              router.push("/admin/districts/detail");
            }}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Lock status</h3>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            <LockStatusDonut locked={locked} unlocked={unlocked} />
            <div className="w-full min-w-0 flex-1">
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="bg-emerald-500" style={{ width: `${(locked / Math.max(1, totalDistricts)) * 100}%` }} />
                <div
                  className="bg-red-500"
                  style={{ width: `${(unlocked / Math.max(1, totalDistricts)) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex gap-5 text-xs text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Locked ({locked})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> Unlocked ({unlocked})
                </span>
              </div>
            </div>
          </div>

          <h3 className="mb-3 mt-5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            All fields — Total ({PERIOD_LABEL})
          </h3>
          {/* plainLabel(), not englishLabel() — this is a summary list, not laid out to mirror
              the government form's field order/grouping, so the form's own numbering
              ("1.", "2. (i)") is just noise here. */}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {PAC_FIELD_ORDER.map((field) => (
              <div key={field} className="flex min-w-0 items-center justify-between gap-2">
                <dt className="truncate text-slate-500 dark:text-slate-400" title={plainLabel(PAC_FIELD_LABELS[field])}>
                  {plainLabel(PAC_FIELD_LABELS[field])}
                </dt>
                <dd className="break-words text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {isMoneyField(field) ? formatMoney(sums[field]) : sums[field].toLocaleString("en-IN")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
