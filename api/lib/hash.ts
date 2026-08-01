// Server-side counterpart to lib/crypto.ts's sha256Hex (Web Crypto is available in both the
// browser and the Workers runtime) — used by rate-limit.ts to hash the requester's IP before
// storing it. No bulk-provisioning route in this app (dropped, see pac-recovery-migration-plan.md
// §6.2), so this has no raw-CUG-hashing caller unlike the reference project's version.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
