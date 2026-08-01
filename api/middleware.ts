import { NextResponse } from "next/server";

// No-op now: frontend and API are a true single origin (excisebakaya.exciseup.in — see
// ROADMAP.md's Milestone 35), so no cross-origin request ever reaches this Worker and no CORS
// headers/OPTIONS preflight handling is needed. Session auth moved from a Bearer token to an
// HttpOnly cookie in the same rollout (lib/session.ts / lib/auth-guard.ts). Kept as an empty
// file (not deleted) only because `api/middleware.ts` — not `proxy.ts` — is a load-bearing
// filename constraint under this Next.js version (see DEPLOY.md's redeploy section); there's
// no other reason for this file to exist right now.
export function middleware() {
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
