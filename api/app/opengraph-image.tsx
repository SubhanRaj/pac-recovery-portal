import { ImageResponse } from "next/og";

// Statically generated at build time (no dynamic params on this route).
export const dynamic = "force-static";

export const alt = "PAC Recovery Portal — Department of Excise, Government of Uttar Pradesh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// English-only text — UI chrome outside the DEO-facing form stays English, same convention
// this repo's original single-snapshot version used (CLAUDE.md's UI conventions).
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
          PAC Recovery Portal
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
          Dues from cases up to FY ending 31 March 2019
        </div>
      </div>
    ),
    { ...size }
  );
}
