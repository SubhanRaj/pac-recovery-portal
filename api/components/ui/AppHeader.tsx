"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearLastRole } from "@/lib/client-session";
import { confirmLogout, notifyToast } from "@/lib/alerts";
import { setNavDistrictId } from "@/lib/adminNav";
import ProfileMenu, { type Profile } from "./ProfileMenu";
import ThemeToggle from "./ThemeToggle";

export type NavLink = { label: string; href: string };
export type SearchableDistrict = { id: number; districtName: string };

type Props = {
  title: string;
  role: "admin" | "deo";
  profile?: Profile | null;
  navLinks?: NavLink[];
  onSync?: () => void;
  syncing?: boolean;
  lastSyncedAt?: string | null;
  districts?: SearchableDistrict[];
};

// Global "jump to a district" search, shown whenever a page passes `districts` (every /admin/*
// page, via useAdminData). Separate from the Districts page's own table search box — this one
// is reachable from anywhere and navigates straight to that district's detail page.
// `mobile` swaps the desktop `hidden lg:block, w-44` sizing for a full-width block — used inside
// the mobile drawer, where this is the only place a phone user can reach it at all (the desktop
// instance stays `lg:block`-gated in the header itself, unrelated to this one).
function DistrictSearch({ districts, mobile }: { districts: SearchableDistrict[]; mobile?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return districts.filter((d) => d.districtName.toLowerCase().includes(q)).slice(0, 8);
  }, [query, districts]);

  function goTo(id: number) {
    setQuery("");
    setOpen(false);
    setNavDistrictId(id);
    router.push("/admin/districts/detail");
  }

  // No leading search icon here — a Tabler <i> icon overlapping live input text renders via an
  // async-loading CSS ::before glyph, which can flash a fallback tofu box on top of the text
  // before the font loads (see the identical fix on TextField.tsx and the earlier admin
  // district search input, both of which dropped their icon for the same reason).
  return (
    <div className={`relative shrink-0 ${mobile ? "w-full" : "hidden w-44 lg:block"}`}>
      <input
        type="text"
        placeholder="Jump to district..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) goTo(matches[0].id);
        }}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {matches.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => goTo(d.id)}
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-50 dark:text-slate-300 dark:hover:bg-blue-950"
              >
                {d.districtName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AppHeader({ title, role, profile, navLinks, onSync, syncing, lastSyncedAt, districts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    if (!(await confirmLogout())) return;
    await apiFetch(`/api/auth/logout?role=${role}`, { method: "POST" }, role).catch(() => {});
    clearLastRole(role);
    notifyToast({ icon: "info", title: "Logged out" });
    router.replace("/login");
  }

  // Only admin pages pass navLinks (Dashboard/Districts/Unlock Requests/Audit Log, plus Sync
  // and the district-jump search). Below `sm` there's no room to fit all of that in one row, so
  // every one of those items — nav links, search, Sync, the theme toggle, the profile pill —
  // moves into this left-side drawer, and the header itself shrinks to just the hamburger +
  // title. DEO pages (no navLinks, no Sync, no districts) never had more than the theme toggle
  // and profile pill to begin with, so they stay inline unchanged — nothing to hide there.
  const hasDrawer = Boolean(navLinks);

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        {hasDrawer && (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
            aria-label="Open navigation menu"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <i className="ti ti-menu-2 text-lg" />
          </button>
        )}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-base font-bold text-white">
          ₹
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
            Excise Revenue Recovery Portal
          </p>
        </div>

        {/* Everything else lives in one right-aligned group — deliberately not spread across
            the full header width, which read as cluttered once nav links, search, Sync, the
            theme toggle, and the profile menu all needed a place to live. Hidden below `sm`
            whenever a drawer exists to hold the same items instead (see hasDrawer above). */}
        <div className={`ml-auto items-center gap-2 ${hasDrawer ? "hidden sm:flex" : "flex"}`}>
          {navLinks && (
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
          {districts && <DistrictSearch districts={districts} />}
          {onSync && (
            <button
              onClick={onSync}
              disabled={syncing}
              title="Sync latest data from the server"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <i className={`ti ti-refresh text-base ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline">{syncing ? "Syncing..." : "Sync"}</span>
            </button>
          )}
          <ThemeToggle />
          <ProfileMenu profile={profile ?? null} onLogout={logout} lastSyncedAt={onSync ? lastSyncedAt : undefined} />
        </div>
      </div>
    </header>

      {/* Rendered as a sibling of <header>, not nested inside it — <header> has backdrop-blur
          (backdrop-filter), which per spec makes it a containing block for `fixed` descendants,
          so a fixed drawer nested inside it would size against the header's own ~60px height
          instead of the viewport. Verified empirically (computed height came back 60px, not
          the viewport height) before moving this out — don't renest it inside <header> without
          re-checking that. */}
      {hasDrawer && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-white p-4 shadow-xl sm:hidden dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Menu</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <i className="ti ti-x text-lg" />
              </button>
            </div>

            <ProfileMenu profile={profile ?? null} onLogout={logout} lastSyncedAt={onSync ? lastSyncedAt : undefined} />

            {navLinks && (
              <nav className="flex flex-col gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      pathname === link.href
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}

            {districts && (
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <DistrictSearch districts={districts} mobile />
              </div>
            )}

            {onSync && (
              <button
                onClick={() => {
                  onSync();
                  setMobileOpen(false);
                }}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-md border-t border-slate-100 px-3 pt-3 text-sm font-medium text-slate-600 disabled:opacity-50 dark:border-slate-800 dark:text-slate-400"
              >
                <i className={`ti ti-refresh text-base ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync latest data"}
              </button>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </>
      )}
    </>
  );
}
