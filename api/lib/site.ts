// Portal identity strings shared by the browser tab title/meta description (layout.tsx), the
// login page, the DEO title bar (deo-data-entry/page.tsx), and the Excel export title rows
// (export.ts) — kept in one place so all these stay in sync instead of drifting copies.
export const SITE_TITLE_EN = "PAC Recovery Portal";
export const SITE_TITLE_HI = "पीएसी वसूली पोर्टल";

// Static scope banner — mirrors this repo's original single-snapshot disclaimer (README.md's
// "Data-entry scope"): the portal only ever tracks dues from cases originating up to FY ending
// 31-Mar-2019 — no new dues, and no recovery credited against anything accrued from 1-Apr-2019
// onwards, even though recovery entries themselves are made in real time, monthly. Not a live
// date check — dues can predate the 1970s.
export const DATA_PERIOD_EN = "Scope: Dues from cases originating up to FY ending 31 March 2019 only";
export const DATA_PERIOD_HI = "कार्यक्षेत्र: केवल 31 मार्च 2019 को समाप्त वित्तीय वर्ष तक उत्पन्न मामलों की बकाया धनराशि";
