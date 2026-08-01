// Bridges wrangler's generated `Env` (worker-configuration.d.ts) into the global
// `CloudflareEnv` interface that @opennextjs/cloudflare's getCloudflareContext() returns
// (declared via `declare global` in that package, not exported from the module).
declare global {
  interface CloudflareEnv extends Env {}
}

export {};
