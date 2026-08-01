import { ImageResponse } from "next/og";

// Required for `output: "export"` (next.config.ts) — otherwise Next treats this route as
// potentially dynamic and refuses to prerender it into the static build.
export const dynamic = "force-static";

export const alt = "Excise Revenue Recovery Portal — Department of Excise, Government of Uttar Pradesh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Statically generated at build time (no dynamic params on this route) — works fine under
// `output: "export"`, same as any other prerendered static asset. English-only text, matching
// this app's "UI chrome is English only" convention (CLAUDE.md) — the six PAC field labels are
// the only place Hindi is used, not chrome like a social-preview card.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)",
          fontFamily: "sans-serif",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 110,
            height: 110,
            borderRadius: 28,
            background: "#ffffff",
            color: "#1d4ed8",
            fontSize: 64,
            fontWeight: 700,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          ₹
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 700,
            color: "#ffffff",
            textAlign: "center",
          }}
        >
          Excise Revenue Recovery Portal
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 26,
            color: "#bfdbfe",
            textAlign: "center",
          }}
        >
          Department of Excise, Government of Uttar Pradesh
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 22,
            color: "#e0e7ff",
            textAlign: "center",
          }}
        >
          Data Period: 1 April 2021 to 31 March 2026
        </div>
      </div>
    ),
    { ...size }
  );
}
