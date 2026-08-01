export type Role = "deo" | "admin";

// The real credential is an HttpOnly cookie now (see api/lib/session.ts) — invisible to this
// frontend JS by design, and a true single origin (excisebakaya.exciseup.in) makes that safe
// (see CLAUDE.md's Auth section). This file only keeps a same-purpose-as-before "last role" hint for
// the root page's first-paint redirect guess (which of /admin or /deo-data-entry to send a bare
// "/" visit to) — it is never a source of truth for anything gated. Every gated page still
// calls GET /api/auth/me before trusting anything; a missing/expired cookie 401s there exactly
// like before.
const LAST_ROLE_KEY = "excise-portal:last-role";

export function markLastRole(role: Role) {
  localStorage.setItem(LAST_ROLE_KEY, role);
}

export function getLastRole(): Role | null {
  return localStorage.getItem(LAST_ROLE_KEY) as Role | null;
}

export function clearLastRole(role: Role) {
  if (localStorage.getItem(LAST_ROLE_KEY) === role) localStorage.removeItem(LAST_ROLE_KEY);
}

// One-shot flag set right before redirecting away from /login or /verify, so the destination
// page can show a "Welcome" toast exactly once per sign-in rather than on every reload.
const JUST_AUTHED_KEY = "excise-portal:just-authed";

export function markJustAuthed() {
  sessionStorage.setItem(JUST_AUTHED_KEY, "1");
}

export function consumeJustAuthed(): boolean {
  const flagged = sessionStorage.getItem(JUST_AUTHED_KEY) === "1";
  if (flagged) sessionStorage.removeItem(JUST_AUTHED_KEY);
  return flagged;
}
