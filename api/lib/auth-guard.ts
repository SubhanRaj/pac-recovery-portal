import { NextRequest } from "next/server";
import { verifySession, cookieName, SessionPayload } from "@/lib/session";

// Reads the session from an HttpOnly cookie (see session.ts's cookieName/setSessionCookie) —
// safe now that frontend and API are a true single origin (excisebakaya.exciseup.in), unlike
// the old *.pages.dev/*.workers.dev split that forced a Bearer token instead (see
// CLAUDE.md's Auth section for the full history).
export async function requireSession(req: NextRequest, role: "deo" | "admin"): Promise<SessionPayload | null> {
  const token = req.cookies.get(cookieName(role))?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session || session.role !== role) return null;
  return session;
}
