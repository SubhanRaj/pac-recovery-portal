// Admin-only client-side navigation state, kept out of the URL entirely (no ?id=, no
// ?status= query strings) — sessionStorage instead, same "set before navigating, read on
// the destination page" shape as markJustAuthed()/consumeJustAuthed() in session.ts.
const DISTRICT_ID_KEY = "excise-portal:nav-district-id";
const STATUS_FILTER_KEY = "excise-portal:nav-status-filter";
const NAV_DISTRICT_EVENT = "excise-portal:nav-district-id-changed";

// router.push("/admin/districts/detail") is a no-op when already on that route (same URL, no
// remount), so the detail page's mount-only useEffect never re-reads sessionStorage — jumping
// to a new district while already viewing one silently kept showing the old district until a
// full page reload. Dispatching this event lets the already-mounted detail page update its
// state directly, without relying on a route change happening at all.
export function setNavDistrictId(id: number) {
  sessionStorage.setItem(DISTRICT_ID_KEY, String(id));
  window.dispatchEvent(new CustomEvent<number>(NAV_DISTRICT_EVENT, { detail: id }));
}

// Not consumed on read: a reload of the detail page should keep showing the same district,
// same as a normal page reload would with a URL param — it's just overwritten by the next click.
export function getNavDistrictId(): number | null {
  const v = sessionStorage.getItem(DISTRICT_ID_KEY);
  return v ? Number(v) : null;
}

export function onNavDistrictIdChange(cb: (id: number) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<number>).detail);
  window.addEventListener(NAV_DISTRICT_EVENT, handler);
  return () => window.removeEventListener(NAV_DISTRICT_EVENT, handler);
}

export type StatusFilter = "locked" | "unlocked";

export function setNavStatusFilter(status: StatusFilter) {
  sessionStorage.setItem(STATUS_FILTER_KEY, status);
}

// Consumed on read (unlike the district id above): landing on /admin/districts via the regular
// nav link, after a KPI card set this on an earlier visit, should default back to "all" rather
// than surprise the admin with a still-filtered table from a different visit.
export function consumeNavStatusFilter(): StatusFilter | null {
  const v = sessionStorage.getItem(STATUS_FILTER_KEY);
  if (v) sessionStorage.removeItem(STATUS_FILTER_KEY);
  return v === "locked" || v === "unlocked" ? v : null;
}
