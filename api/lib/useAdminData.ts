"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, type CachedDistrict, type CachedPacDues } from "@/lib/client-db";
import { apiFetch, ApiError } from "@/lib/api";
import { clearLastRole, consumeJustAuthed } from "@/lib/client-session";
import { notifyToast } from "@/lib/alerts";
import type { Profile } from "@/components/ui/ProfileMenu";

// Persisted across page loads/sessions (not just component state) so a returning admin who
// opens a page and gets the Dexie cache instantly (no auto-sync) still sees how stale it is,
// rather than a blank/undefined timestamp until they next click Sync.
const LAST_SYNC_KEY = "pac-recovery-portal:admin-last-sync";

// Shared by every /admin/* page: the admin-only session guard, the Dexie-backed
// districts/pac_dues cache, and the Sync action.
export function useAdminData() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [districts, setDistricts] = useState<CachedDistrict[]>([]);
  const [pacDues, setPacDues] = useState<CachedPacDues[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(LAST_SYNC_KEY)
  );

  // Returns the freshly-synced rows (not just void) so callers that need the *current* data
  // right after syncing — e.g. Export — don't read back their own stale pre-sync render closure.
  async function sync() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ districts: CachedDistrict[]; pacDues: CachedPacDues[] }>(
        "/api/admin/districts",
        undefined,
        "admin"
      );
      await db.transaction("rw", db.adminDistricts, db.adminPacDues, async () => {
        await db.adminDistricts.clear();
        await db.adminPacDues.clear();
        await db.adminDistricts.bulkPut(res.districts);
        await db.adminPacDues.bulkPut(res.pacDues);
      });
      setDistricts(res.districts);
      setPacDues(res.pacDues);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSyncedAt(now);
      return res;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sync failed.");
      return null;
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const p = await apiFetch<Profile>("/api/auth/me?role=admin", undefined, "admin");
        setProfile(p);
        if (consumeJustAuthed()) {
          notifyToast({ icon: "success", title: `Welcome, ${p.name ?? p.designation ?? "Admin"}` });
        }
      } catch {
        clearLastRole("admin");
        router.replace("/login");
        return;
      }

      const [cachedDistricts, cachedPacDues] = await Promise.all([
        db.adminDistricts.toArray(),
        db.adminPacDues.toArray(),
      ]);
      if (cachedDistricts.length > 0) {
        setDistricts(cachedDistricts);
        setPacDues(cachedPacDues);
        setReady(true);
      } else {
        setReady(true);
        await sync();
      }
    })();
  }, [router]);

  // Patches only the (districtId, period) row that was unlocked — the rest of that district's
  // pac_dues rows (other periods) are untouched, same "unlock never clears data" rule as the
  // reference project.
  async function unlock(districtId: number, period: string, reason: string) {
    await apiFetch("/api/admin/unlock", { method: "POST", body: JSON.stringify({ districtId, period, reason }) }, "admin");
    const patch = {
      lockStatus: 0,
      unlockedAt: new Date().toISOString(),
      unlockReason: reason,
      unlockedBy: profile?.name ?? profile?.email ?? null,
    };
    setPacDues((prev) => prev.map((p) => (p.districtId === districtId && p.period === period ? { ...p, ...patch } : p)));
    const row = await db.adminPacDues.where({ districtId, period }).first();
    if (row) await db.adminPacDues.update(row.id, patch);
  }

  async function truncateDemo() {
    await apiFetch("/api/admin/truncate-demo-data", { method: "POST" }, "admin");
    await sync();
  }

  return { ready, profile, districts, pacDues, setDistricts, setPacDues, sync, syncing, lastSyncedAt, unlock, truncateDemo, error, setError };
}
