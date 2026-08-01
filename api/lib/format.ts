// All timestamps are stored as UTC ISO strings (new Date().toISOString() on the API side) —
// this is the one place that converts to IST for display. Explicit timeZone is required:
// toLocaleString('en-IN') alone only sets locale conventions, not the timezone, so it
// silently renders in the server/browser's local zone instead of IST unless overridden here.
export function formatIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
