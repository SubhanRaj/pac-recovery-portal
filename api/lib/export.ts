import type { Cell } from "exceljs";
import { DUES_FIELD_LABELS, MONEY_FIELDS, TOTAL_DUES_LABEL, OPENING_BALANCE_LABEL, DUES_LEFT_LABEL, NET_RECOVERABLE_LABEL, englishLabel } from "./dues-fields";
import { DUES_FIELD_ORDER } from "./dues-row";
import { SITE_TITLE_EN, DATA_PERIOD_EN } from "./site";
import { formatIST } from "./format";
import type { CachedDistrict, CachedPacDues } from "./client-db";

const RUPEE_FORMAT = '"₹"#,##0.00';
// Two extra rows (title + data period) sit above the header row on every sheet.
const TITLE_ROWS = 2;

const HEADER_FILL = "FF1D4ED8";
const TOTAL_FILL = "FFDBEAFE";

const PAGE_SETUP = {
  paperSize: 9,
  orientation: "landscape",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
} as const;

function styleTitleCell(cell: Cell) {
  cell.font = { bold: true, size: 14 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleSubtitleCell(cell: Cell) {
  cell.font = { italic: true, size: 11 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleHeaderCell(cell: Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function styleTotalCell(cell: Cell) {
  cell.font = { bold: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
}

// Filename-safe IST timestamp down to the second — see this file's original reasoning in
// excise-revenue-recovery-portal/api/lib/export.ts.
function istFilenameStamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}-${get("second")}`;
}

async function downloadWorkbook(wb: InstanceType<typeof window.ExcelJS.Workbook>, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// One workbook: a Summary cover sheet, a Districts sheet (every district's latest period, one
// row each), and a Lock Status sheet — much flatter than the reference project's per-FY sheets
// since this domain has one period per district, not a 5-year loop (see
// pac-recovery-migration-plan.md §3). `pacDues` here is every period row cached client-side;
// callers pass the district's *latest* period per row for "current" figures.
export async function exportDistrictsToXlsx(districts: CachedDistrict[], pacDues: CachedPacDues[]) {
  const sortedDistricts = [...districts].sort((a, b) => a.districtName.localeCompare(b.districtName));
  const latestByDistrict = new Map<number, CachedPacDues>();
  for (const p of pacDues) {
    const existing = latestByDistrict.get(p.districtId);
    if (!existing || p.period > existing.period) latestByDistrict.set(p.districtId, p);
  }

  const header = [
    "District",
    englishLabel(TOTAL_DUES_LABEL),
    englishLabel(OPENING_BALANCE_LABEL),
    ...DUES_FIELD_ORDER.map((f) => englishLabel(DUES_FIELD_LABELS[f])),
    englishLabel(DUES_LEFT_LABEL),
    englishLabel(NET_RECOVERABLE_LABEL),
    "Period",
  ];
  const moneyCols0 = [1, 2, ...DUES_FIELD_ORDER.map((f, i) => ((MONEY_FIELDS as readonly string[]).includes(f) ? i + 3 : -1)).filter((c) => c >= 0), header.length - 3];

  const wb = new window.ExcelJS.Workbook();
  const generatedAt = formatIST(new Date().toISOString());

  let totalDues = 0;
  let totalRecovered = 0;
  let totalNetRecoverable = 0;
  for (const d of districts) {
    const p = latestByDistrict.get(d.id);
    totalDues += d.totalDues ?? 0;
    totalRecovered += p?.recoveredThisPeriod ?? 0;
    totalNetRecoverable += p?.netRecoverable ?? 0;
  }
  const lockedCount = sortedDistricts.filter((d) => latestByDistrict.get(d.id)?.lockStatus === 1).length;

  const summaryWs = wb.addWorksheet("Summary", { pageSetup: PAGE_SETUP });
  summaryWs.columns = [{ width: 32 }, { width: 40 }];
  summaryWs.addRow([SITE_TITLE_EN]);
  summaryWs.addRow([DATA_PERIOD_EN]);
  summaryWs.addRow([`Generated: ${generatedAt} IST`]);
  summaryWs.addRow([]);
  const summaryHeaderRow = summaryWs.addRow(["Metric", "Value"]);
  summaryWs.addRow(["Total Districts", districts.length]);
  summaryWs.addRow(["Locked (Current Period)", lockedCount]);
  summaryWs.addRow(["Unlocked (Current Period)", districts.length - lockedCount]);
  const duesRow = summaryWs.addRow(["Total Gross Dues (as on 31-Mar-2019)", totalDues]);
  const recoveredRow = summaryWs.addRow(["Total Recovered (current period)", totalRecovered]);
  const netRow = summaryWs.addRow(["Total Net Recoverable", totalNetRecoverable]);

  summaryWs.mergeCells(1, 1, 1, 2);
  summaryWs.mergeCells(2, 1, 2, 2);
  summaryWs.mergeCells(3, 1, 3, 2);
  styleTitleCell(summaryWs.getCell(1, 1));
  styleSubtitleCell(summaryWs.getCell(2, 1));
  summaryWs.getCell(3, 1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };
  summaryWs.getCell(3, 1).alignment = { horizontal: "center", vertical: "middle" };
  summaryHeaderRow.eachCell((cell) => styleHeaderCell(cell));
  for (const row of [duesRow, recoveredRow, netRow]) row.getCell(2).numFmt = RUPEE_FORMAT;

  const rows: (string | number)[][] = sortedDistricts.map((d) => {
    const p = latestByDistrict.get(d.id);
    return [
      d.districtName,
      d.totalDues ?? 0,
      p?.openingBalance ?? 0,
      ...DUES_FIELD_ORDER.map((f) => (p ? (p[f] as number) : 0)),
      p ? p.openingBalance - p.recoveredThisPeriod : 0,
      p?.netRecoverable ?? 0,
      p?.period ?? "",
    ];
  });
  const totalRowValues: (string | number)[] = ["TOTAL"];
  for (let col = 1; col < header.length - 1; col++) {
    totalRowValues.push(rows.reduce((sum, row) => sum + (Number(row[col]) || 0), 0));
  }
  totalRowValues.push("");

  const ws = wb.addWorksheet("Districts", {
    views: [{ state: "frozen", ySplit: TITLE_ROWS + 1 }],
    pageSetup: { ...PAGE_SETUP, printTitlesRow: `1:${TITLE_ROWS + 1}` },
  });
  ws.columns = header.map(() => ({ width: 18 }));
  ws.getColumn(1).width = 22;
  ws.addRow([SITE_TITLE_EN]);
  ws.addRow([DATA_PERIOD_EN]);
  const headerRow = ws.addRow(header);
  const dataRows = rows.map((row) => ws.addRow(row));
  const totalRow = ws.addRow(totalRowValues);

  ws.mergeCells(1, 1, 1, header.length);
  ws.mergeCells(2, 1, 2, header.length);
  styleTitleCell(ws.getCell(1, 1));
  styleSubtitleCell(ws.getCell(2, 1));
  headerRow.eachCell((cell) => styleHeaderCell(cell));
  for (const row of dataRows) for (const c of moneyCols0) row.getCell(c + 1).numFmt = RUPEE_FORMAT;
  for (const c of moneyCols0) totalRow.getCell(c + 1).numFmt = RUPEE_FORMAT;
  totalRow.eachCell((cell) => styleTotalCell(cell));

  const lockedDistricts = sortedDistricts.filter((d) => latestByDistrict.get(d.id)?.lockStatus === 1);
  const unlockedDistricts = sortedDistricts.filter((d) => latestByDistrict.get(d.id)?.lockStatus !== 1);

  const lockWs = wb.addWorksheet("Lock Status", { pageSetup: PAGE_SETUP });
  lockWs.columns = [{ width: 26 }, { width: 22 }, { width: 26 }, { width: 40 }];
  lockWs.addRow([`${SITE_TITLE_EN} — Lock Status`]);
  lockWs.addRow([DATA_PERIOD_EN]);
  lockWs.mergeCells(1, 1, 1, 4);
  lockWs.mergeCells(2, 1, 2, 4);
  styleTitleCell(lockWs.getCell(1, 1));
  styleSubtitleCell(lockWs.getCell(2, 1));
  lockWs.addRow([]);

  lockWs.addRow([`Locked (${lockedDistricts.length})`]).getCell(1).font = { bold: true, size: 12 };
  const lockedHeaderRow = lockWs.addRow(["District", "Locked At (IST)", "Locked By (DEO Name)", ""]);
  lockedHeaderRow.eachCell((cell) => styleHeaderCell(cell));
  for (const d of lockedDistricts) {
    const p = latestByDistrict.get(d.id);
    lockWs.addRow([d.districtName, p?.lockedAt ? formatIST(p.lockedAt) : "", p?.submittedByName ?? "", ""]);
  }
  lockWs.addRow([]);

  lockWs.addRow([`Unlocked — Not Yet Submitted This Period (${unlockedDistricts.length})`]).getCell(1).font = {
    bold: true,
    size: 12,
  };
  const unlockedHeaderRow = lockWs.addRow(["District", "Last Unlocked At (IST)", "Last Unlock Reason", "Unlocked By (Admin)"]);
  unlockedHeaderRow.eachCell((cell) => styleHeaderCell(cell));
  for (const d of unlockedDistricts) {
    const p = latestByDistrict.get(d.id);
    lockWs.addRow([d.districtName, p?.unlockedAt ? formatIST(p.unlockedAt) : "", p?.unlockReason ?? "", p?.unlockedBy ?? ""]);
  }

  await downloadWorkbook(wb, `pac-recovery-portal-${istFilenameStamp()}.xlsx`);
}

function sqlLiteral(v: string | number | null): string {
  if (v === null) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

// Plain-text SQL restore script for the two tables the admin panel caches client-side
// (districts, pac_dues) — a backup/restore aid, not a full DB dump. Column names/order match
// api/db/schema.ts.
export function exportDistrictsToSql(districts: CachedDistrict[], pacDues: CachedPacDues[]) {
  const lines: string[] = [
    `-- ${SITE_TITLE_EN}`,
    `-- SQL backup generated ${new Date().toISOString()} (UTC)`,
    `-- Covers districts + pac_dues only (the tables cached in the admin panel) —`,
    `-- not users, audit_log, unlock_requests, or magic_link_tokens.`,
    "",
  ];

  for (const d of [...districts].sort((a, b) => a.id - b.id)) {
    lines.push(
      `INSERT INTO districts (id, district_name, total_dues, collected_till_date) VALUES ` +
        `(${d.id}, ${sqlLiteral(d.districtName)}, ${d.totalDues ?? "NULL"}, ${d.collectedTillDate ?? "NULL"});`
    );
  }
  lines.push("");

  for (const p of [...pacDues].sort((a, b) => a.id - b.id)) {
    lines.push(
      `INSERT INTO pac_dues (id, district_id, period, opening_balance, rc_count, rc_amount, rc_details, recovered_this_period, batte_khatte_count, batte_khatte_amount, court_case_count, court_stayed_amount, net_recoverable, lock_status, locked_at, submitted_by_name, unlocked_at, unlock_reason, unlocked_by) VALUES ` +
        `(${p.id}, ${p.districtId}, ${sqlLiteral(p.period)}, ${p.openingBalance}, ${p.rcCount}, ${p.rcAmount}, ${sqlLiteral(p.rcDetails)}, ${p.recoveredThisPeriod}, ${p.batteKhatteCount}, ${p.batteKhatteAmount}, ${p.courtCaseCount}, ${p.courtStayedAmount}, ${p.netRecoverable}, ${p.lockStatus}, ${sqlLiteral(p.lockedAt)}, ${sqlLiteral(p.submittedByName)}, ${sqlLiteral(p.unlockedAt)}, ${sqlLiteral(p.unlockReason)}, ${sqlLiteral(p.unlockedBy)});`
    );
  }

  const blob = new Blob([lines.join("\n") + "\n"], { type: "application/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pac-recovery-portal-${istFilenameStamp()}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}
