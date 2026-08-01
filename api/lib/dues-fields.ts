// Single source of truth for the DEO-entered pac_dues fields and their bilingual labels —
// equivalent of the reference project's lib/pac-fields.ts, but for one monthly period instead
// of a 5-FY loop (see pac-recovery-migration-plan.md §3).

export type MoneyField = "rcAmount" | "recoveredThisPeriod" | "batteKhatteAmount" | "courtStayedAmount";
export type CountField = "rcCount" | "batteKhatteCount" | "courtCaseCount";
export type DuesField = MoneyField | CountField;

export const MONEY_FIELDS: MoneyField[] = ["rcAmount", "recoveredThisPeriod", "batteKhatteAmount", "courtStayedAmount"];
export const COUNT_FIELDS: CountField[] = ["rcCount", "batteKhatteCount", "courtCaseCount"];

// DRAFT bilingual copy — ported forward from the old single-snapshot form's field 3/5/6, but the
// "8-Jul-26 तक/उपरांत" (PAC-meeting-date) framing doesn't carry over cleanly to a recurring
// monthly period. Flagging for sign-off before this goes in front of a real DEO — the Hindi here
// is my draft, not confirmed government-form language.
export const DUES_FIELD_LABELS: Record<DuesField, string> = {
  rcCount: "3. (i) जारी आर.सी. (R.C.) की संख्या / No. of RCs Issued",
  rcAmount: "3. (ii) आर.सी. में निहित धनराशि / RC Amount",
  recoveredThisPeriod: "4. इस अवधि में वसूल की गई धनराशि / Recovered This Period",
  batteKhatteCount: "6. बट्टे खाते — संख्या / Batte Khatte Count",
  batteKhatteAmount: "6. आयुक्तालय को प्रेषित बट्टे खाते में डाले जाने वाले प्रकरणों की संख्या एवं उसमें निहित धनराशि / Batte Khatte Amount",
  courtCaseCount: "7. न्यायालय द्वारा स्थगित — संख्या / Court Stayed Count",
  courtStayedAmount: "7. सक्षम न्यायालय द्वारा स्थगित प्रकरणों की संख्या एवं उसमें निहित धनराशि / Court Stayed Amount",
};

export const TOTAL_DUES_LABEL = "1. वसूल की जाने वाली सकल धनराशि (31-मार्च-2019 तक) / Gross Dues (as on 31-Mar-2019)";
export const OPENING_BALANCE_LABEL = "2. इस अवधि हेतु प्रारंभिक शेष धनराशि / Opening Balance for this Period";
export const DUES_LEFT_LABEL = "5. कुल बकाया धनराशि / Total Dues Left";
export const NET_RECOVERABLE_LABEL = "8. शुद्ध वसूल की जाने वाली धनराशि / Net Recoverable";

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
  return englishLabel(bilingual).replace(/^\d+\.\s*(\(\w+\)\s*)?/, "");
}

export interface NetRecoverableResult {
  duesLeft: number;
  netRecoverable: number;
}

// Mirrors this repo's existing Calculation Logic (README.md) — duesLeft/netRecoverable formulas
// unchanged, just openingBalance replaces the old static "collected_till_date" baseline so it
// can chain period to period. rcCount/rcAmount are informational only (see schema.ts's comment)
// and never enter this formula, same as the reference project's own RC fields. Server-computed
// only, never trusted from the client.
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

// Per-RC breakdown behind rcCount/rcAmount (see schema.ts's pac_dues.rc_details comment).
// Independent of recoveredThisPeriod/batteKhatteAmount/courtStayedAmount/netRecoverable: an RC
// is issued to inform a defaulter what they owe, for any amount, regardless of what's actually
// recovered. `stayed` (a court staying this specific RC) is a separate concept from the
// aggregate Court Stayed Count/Amount fields above (a court staying recovery of an amount) — no
// cross-check between the two. Ported from the reference project's identical RcDetail type.
export type RcDetail = {
  rcNumber: string;
  rcAmount: number;
  stayed: boolean;
};

export const RC_NUMBER_MAX_LENGTH = 50;

// Zero-trust validator — used both as the DEO form's pre-submit client-side check and the
// submit route's final server-side check on the untrusted request body (hence the runtime
// `typeof` guards below even though RcDetail's TS type already promises these shapes).
export function validateRcDetails(rcCount: number, rcAmount: number, rcDetails: RcDetail[]): string | null {
  if (rcDetails.length !== rcCount) {
    return `RC Details must have exactly ${rcCount} entries (received ${rcDetails.length})`;
  }
  let sum = 0;
  for (let i = 0; i < rcDetails.length; i++) {
    const d = rcDetails[i];
    const rcNumber = typeof d.rcNumber === "string" ? d.rcNumber.trim() : "";
    if (!rcNumber) return `RC #${i + 1}: RC Number cannot be blank`;
    if (rcNumber.length > RC_NUMBER_MAX_LENGTH) {
      return `RC #${i + 1}: RC Number cannot exceed ${RC_NUMBER_MAX_LENGTH} characters`;
    }
    if (typeof d.rcAmount !== "number" || Number.isNaN(d.rcAmount) || d.rcAmount < 0) {
      return `RC #${i + 1}: RC Amount must be a non-negative number`;
    }
    if (typeof d.stayed !== "boolean") {
      return `RC #${i + 1}: stayed must be true or false`;
    }
    sum += d.rcAmount;
  }
  // Small epsilon, not strict equality — these are floating-point rupee amounts.
  if (Math.abs(sum - rcAmount) > 0.01) {
    return `RC Details total (${sum}) must equal RC Amount (${rcAmount})`;
  }
  return null;
}

// Keeps the RC Details row count in sync with rcCount as the DEO edits it — growing appends
// blank rows, shrinking truncates trailing rows. Ported from the reference project's
// syncRcDetailsToCount (YearStepForm.tsx), operating on string-drafts (see DraftRcDetail below).
export type DraftRcDetail = { rcNumber: string; rcAmount: string; stayed: boolean };

export function syncRcDetailsToCount(rcDetails: DraftRcDetail[], rcCount: number): DraftRcDetail[] {
  const count = Math.max(0, rcCount);
  if (rcDetails.length === count) return rcDetails;
  if (rcDetails.length > count) return rcDetails.slice(0, count);
  return [
    ...rcDetails,
    ...Array.from({ length: count - rcDetails.length }, () => ({ rcNumber: "", rcAmount: "", stayed: false })),
  ];
}
