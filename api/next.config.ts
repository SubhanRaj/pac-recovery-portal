import type { NextConfig } from "next";

// Security headers ported from the old frontend/public/_headers (Cloudflare Pages-specific
// file, read natively by Pages but not by a Worker) now that this app is a single OpenNext
// Worker serving both the UI and /api/*. No Content-Security-Policy yet, deliberately — this
// app loads Tailwind/SweetAlert2/ExcelJS/Chart.js/Tabler Icons from jsDelivr, Google Fonts, and
// runs a couple of inline <script>/<style> blocks with no nonce infrastructure, so a CSP tight
// enough to matter needs real-browser verification first (see SECURITY.md's open CSP
// recommendation) rather than shipping unverified against a live app.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        // next/og's ImageResponse already sets Content-Type: image/png at runtime (unlike the
        // old static-export build, where the file had no extension and Pages' extension-based
        // detection served it as application/octet-stream) — kept explicit anyway as a
        // belt-and-suspenders guard for link-preview scrapers (Slack/WhatsApp/Twitter/X).
        source: "/opengraph-image",
        headers: [{ key: "Content-Type", value: "image/png" }],
      },
    ];
  },
};

export default nextConfig;
