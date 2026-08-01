import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gt } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "@/lib/db";
import { users, magicLinkTokens } from "@/db/schema";
import { magicLinkHtml } from "@/lib/email";
import { withErrorHandling } from "@/lib/with-error-handling";

const TOKEN_TTL_MINUTES = 15;
const MAX_REQUESTS_PER_WINDOW = 3;

export const POST = withErrorHandling("auth/request-magic-link", async (req: NextRequest) => {
  const { email } = (await req.json()) as { email?: unknown };

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Always return 200 regardless of match — do not leak which emails are registered.
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  // Rate limit: MAX_REQUESTS_PER_WINDOW per TOKEN_TTL_MINUTES, keyed by user — protects both
  // against inbox-bombing a specific admin and against exhausting Resend's daily send quota
  // (which would block every admin's real login, not just the target's). No new column needed:
  // every token's TTL is fixed at TOKEN_TTL_MINUTES, so `expiresAt > now` for a row is exactly
  // equivalent to "issued within the last TOKEN_TTL_MINUTES", used or not.
  const [{ recentCount }] = await db
    .select({ recentCount: count() })
    .from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.userId, user.id), gt(magicLinkTokens.expiresAt, new Date().toISOString())));
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
    return NextResponse.json({ ok: true });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();
  await db.insert(magicLinkTokens).values({ userId: user.id, token, expiresAt });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const verifyUrl = `${process.env.FRONTEND_URL}/verify?token=${token}`;

  await resend.emails.send({
    from: `PAC Recovery Portal <${process.env.FROM_EMAIL ?? "onboarding@resend.dev"}>`,
    to: email,
    subject: "PAC Recovery Portal — Login Link",
    html: magicLinkHtml(verifyUrl, TOKEN_TTL_MINUTES),
  });

  return NextResponse.json({ ok: true });
});
