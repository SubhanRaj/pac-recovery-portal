import { NextRequest, NextResponse } from "next/server";

type Handler = (req: NextRequest) => Promise<NextResponse>;

// Applied to every response (success or error) — see SECURITY.md. These are all JSON responses
// with no HTML rendering, so this is defense-in-depth rather than closing a demonstrated gap
// here, but it's free and every response should carry it regardless.
function addSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

// Wraps a route handler so an unexpected error (a D1 blip, a thrown exception from a third-party
// call like Resend) comes back as this app's own `{ error }` JSON 500 instead of bubbling up to
// the framework's default response — see ROADMAP.md's "Retrofit proper try/catch" backlog item
// for why this exists. Doesn't replace a route's own validation/expected-error responses (400,
// 401, 404, 409, ...) — those are ordinary early `return`s from inside the handler and pass
// through untouched; this only catches what nothing anticipated. `routeName` is just a label for
// the server log line, not shown to the client.
export function withErrorHandling(routeName: string, handler: Handler): Handler {
  return async (req) => {
    try {
      return addSecurityHeaders(await handler(req));
    } catch (err) {
      console.error(`${routeName} failed:`, err);
      return addSecurityHeaders(
        NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 })
      );
    }
  };
}
