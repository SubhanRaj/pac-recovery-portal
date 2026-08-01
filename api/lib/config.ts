// UI and /api/* routes are served by the same Next.js/OpenNext app now (no more separate
// frontend/api deployments) — always same-origin, in every environment (next dev, wrangler
// preview, and production), so this always resolves relative to whatever host served the page.
export const API_BASE_URL = "";
