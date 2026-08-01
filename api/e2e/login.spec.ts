import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const API_URL = process.env.E2E_API_URL ?? "https://excisebakaya.exciseup.in";
const SUPERADMIN_EMAIL = "shubhanraj2002@gmail.com";
const API_DIR = path.resolve(__dirname, "..");

// Reads the most recently issued, still-unused magic-link token straight from D1 — avoids
// needing a real inbox in CI. Read-only (SELECT), run via this app's own wrangler config.
function latestUnusedToken(): string {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "excise-revenue-recovery-db",
      "--remote",
      "--json",
      "--command",
      `SELECT token, expires_at FROM magic_link_tokens WHERE used_at IS NULL ORDER BY id DESC LIMIT 1;`,
    ],
    { cwd: API_DIR, encoding: "utf-8" }
  );
  const parsed = JSON.parse(out);
  const row = parsed[0]?.results?.[0];
  if (!row) throw new Error("No unused magic-link token found in D1 — request one first.");
  return row.token as string;
}

test.describe("login page", () => {
  test("CUG tab is the default and the mobile field is visible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "CUG Mobile (DEO)" })).toHaveClass(/text-blue-700/);
    await expect(page.getByLabel("CUG Mobile Number")).toBeVisible();
    await expect(page.getByLabel("CUG Mobile Number")).toBeEditable();
  });

  test("rejects a malformed mobile number inline, no popup", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("CUG Mobile Number").fill("123");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByText("Please enter a valid 10-digit mobile number.")).toBeVisible();
    // Regression guard: no SweetAlert2 popup for routine validation errors.
    await expect(page.locator(".swal2-popup")).toHaveCount(0);
  });

  test("email tab requests a magic link and shows the inline success card", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Email (Admin)" }).click();
    await page.getByLabel("Email Address").fill(SUPERADMIN_EMAIL);
    await page.getByRole("button", { name: "Send Login Link" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
  });
});

test.describe("magic-link verify (live D1 round-trip)", () => {
  test("clicking Verify & Continue signs in without bouncing back to /login", async ({ page, request }) => {
    // Issue a fresh token the same way the login page does, then read it back from D1.
    await request.post(`${API_URL}/api/auth/request-magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: { email: SUPERADMIN_EMAIL },
    });
    const token = latestUnusedToken();

    await page.goto(`/verify?token=${token}`);
    await page.getByRole("button", { name: "Verify & Continue" }).click();

    // The actual bug report: silently landing back on /login is a failure, not a pass-through.
    await page.waitForURL(/\/(admin|login)/, { timeout: 10_000 });
    // Session auth is an HttpOnly `__admin_session` cookie now (see api/lib/session.ts,
    // ROADMAP.md's Milestone 36) — not readable from page JS by design, so check via the
    // browser context's cookie jar instead of localStorage.
    const cookies = await page.context().cookies();
    const adminCookie = cookies.find((c) => c.name === "__admin_session");

    if (page.url().includes("/login")) {
      const bannerText = await page.locator("body").innerText();
      throw new Error(
        `Verify bounced back to /login instead of /admin. Admin session cookie present: ${Boolean(
          adminCookie
        )}. Page text: ${bannerText.slice(0, 500)}`
      );
    }

    expect(page.url()).toContain("/admin");
    expect(adminCookie, "__admin_session cookie should be set after a successful verify").toBeTruthy();
    expect(adminCookie?.httpOnly).toBe(true);
  });
});
