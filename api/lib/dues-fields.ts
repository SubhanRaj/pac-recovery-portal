// Single source of truth for the DEO-entered pac_dues fields and their bilingual labels —
// equivalent of the reference project's lib/pac-fields.ts, but for one monthly period instead
// of a 5-FY loop (see pac-recovery-migration-plan.md §3). No RC-details concept here — dropped,
// no equivalent in this domain.

export type MoneyField = "recoveredThisPeriod" | "batteKhatteAmount" | "courtStayedAmount";
export type CountField = "batteKhatteCount" | "courtCaseCount";
export type DuesField = MoneyField | CountField;

export const MONEY_FIELDS: MoneyField[] = ["recoveredThisPeriod", "batteKhatteAmount", "courtStayedAmount"];
export const COUNT_FIELDS: CountField[] = ["batteKhatteCount", "courtCaseCount"];

// DRAFT bilingual copy — ported forward from the old single-snapshot form's field 3/5/6, but the
// "8-Jul-26 तक/उपरांत" (PAC-meeting-date) framing doesn't carry over cleanly to a recurring
// monthly period. Flagging for sign-off before this goes in front of a real DEO — the Hindi here
// is my draft, not confirmed government-form language.
export const DUES_FIELD_LABELS: Record<DuesField, string> = {
  recoveredThisPeriod: "3. इस अवधि में वसूल की गई धनराशि / Recovered This Period",
  batteKhatteCount: "5. बट्टे खाते — संख्या / Batte Khatte Count",
  batteKhatteAmount: "5. आयुक्तालय को प्रेषित बट्टे खाते में डाले जाने वाले प्रकरणों की संख्या एवं उसमें निहित धनराशि / Batte Khatte Amount",
  courtCaseCount: "6. न्यायालय द्वारा स्थगित — संख्या / Court Stayed Count",
  courtStayedAmount: "6. सक्षम न्यायालय द्वारा स्थगित प्रकरणों की संख्या एवं उसमें निहित धनराशि / Court Stayed Amount",
};

export const TOTAL_DUES_LABEL = "1. वसूल की जाने वाली सकल धनराशि (31-मार्च-2019 तक) / Gross Dues (as on 31-Mar-2019)";
export const OPENING_BALANCE_LABEL = "2. इस अवधि हेतु प्रारंभिक शेष धनराशि / Opening Balance for this Period";
export const DUES_LEFT_LABEL = "4. कुल बकाया धनराशि / Total Dues Left";
export const NET_RECOVERABLE_LABEL = "7. शुद्ध वसूल की जाने वाली धनराशि / Net Recoverable";

export function isMoneyField(field: DuesField): field is MoneyField {
  return (MONEY_FIELDS as string[]).includes(field);
}

// Strips the " / <English>" half off a bilingual label — admin-facing views (Dashboard,
// Districts table, Excel export) don't need the Hindi; only the DEO-facing form mirrors the
// actual bilingual government form and keeps both halves.
export function englishLabel(bilingual: string): string {
  const parts = bilingual.split(" / ");
  return parts[parts.length - 1];
}

// englishLabel() minus the government form's own numbering ("1.", "5.") — used by summary views
// not laid out to mirror the form's field order/grouping, where the numbering is just noise.
export function plainLabel(bilingual: string): string {
  return englishLabel(bilingual).replace(/^\d+\.\s*/, "");
}

export interface NetRecoverableResult {
  duesLeft: number;
  netRecoverable: number;
}

// Mirrors this repo's existing Calculation Logic (README.md) — duesLeft/netRecoverable formulas
// unchanged, just openingBalance replaces the old static "collected_till_date" baseline so it
// can chain period to period. Server-computed only, never trusted from the client (same posture
// as the reference project's computeNetRecoverableSeries).
export function computeNetRecoverable(
  openingBalance: number,
  recoveredThisPeriod: number,
  batteKhatteAmount: number,
  courtStayedAmount: number
): NetRecoverableResult {
  const duesLeft = openingBalance - recoveredThisPeriod;
  return {
    duesLeft,
    netRecoverable: Math.max(0, duesLeft - batteKhatteAmount - courtStayedAmount),
  };
}
