import type { CachedDistrict } from "./client-db";
import type { DuesField } from "./dues-fields";

// Shared by every /admin/* page: a district joined with its latest pac_dues period, flattened
// into one row — this domain has one open period per district, not a multi-year loop, so
// there's no per-FY row explosion like the reference project's admin views.
export const DUES_FIELD_ORDER: DuesField[] = [
  "rcCount",
  "rcAmount",
  "recoveredThisPeriod",
  "batteKhatteCount",
  "batteKhatteAmount",
  "courtCaseCount",
  "courtStayedAmount",
];

export type Row = CachedDistrict &
  Record<DuesField, number> & {
    openingBalance: number;
    netRecoverable: number;
    lockStatus: number;
    period: string | null;
    rcDetails?: string;
  };
