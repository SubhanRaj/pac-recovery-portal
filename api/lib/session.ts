import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export type SessionPayload = {
  userId: number;
  role: "deo" | "admin";
  districtId: number | null;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Two separate cookie names (not one shared __session) so an Admin and a DEO session can
// coexist in the same browser without clobbering each other — same split as the old
// two-localStorage-key design this replaces.
export function cookieName(role: "deo" | "admin"): string {
  return role === "admin" ? "__admin_session" : "__deo_session";
}

// HttpOnly so frontend JS never touches the token; Secure + SameSite=Lax is real CSRF hardening
// now that frontend and API are a true single origin (excisebakaya.exciseup.in — see
// ROADMAP.md's Milestone 35). No Domain= attribute: a host-only cookie can't leak to sibling
// subdomains like sro.exciseup.in.
export function setSessionCookie(res: NextResponse, role: "deo" | "admin", token: string) {
  res.cookies.set(cookieName(role), token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse, role: "deo" | "admin") {
  res.cookies.set(cookieName(role), "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
