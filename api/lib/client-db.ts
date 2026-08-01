import Dexie, { type EntityTable } from "dexie";

// No draftYears table — the reference project's multi-step YearStepForm needed local IndexedDB
// staging across steps/page loads; this domain's DEO form is a single page for one period, so
// ordinary React state is enough (see pac-recovery-migration-plan.md §4).

export type CachedDistrict = {
  id: number;
  districtName: string;
  totalDues: number | null;
  collectedTillDate: number | null;
  deoEmail?: string | null;
  deoUserId?: number | null;
};

export type CachedPacDues = {
  id: number;
  districtId: number;
  period: string;
  openingBalance: number;
  recoveredThisPeriod: number;
  batteKhatteCount: number;
  batteKhatteAmount: number;
  courtCaseCount: number;
  courtStayedAmount: number;
  netRecoverable: number;
  lockStatus: number;
  lockedAt: string | null;
  submittedByName: string | null;
  unlockedAt: string | null;
  unlockReason: string | null;
  unlockedBy: string | null;
};

const db = new Dexie("pac-recovery-portal") as Dexie & {
  adminDistricts: EntityTable<CachedDistrict, "id">;
  adminPacDues: EntityTable<CachedPacDues, "id">;
};

db.version(1).stores({
  adminDistricts: "id",
  adminPacDues: "id, districtId",
});

export { db };
