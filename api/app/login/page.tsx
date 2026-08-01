"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { sha256Hex } from "@/lib/crypto";
import { markLastRole, markJustAuthed } from "@/lib/client-session";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import Banner from "@/components/ui/Banner";
import { SITE_TITLE_EN, SITE_TITLE_HI, DATA_PERIOD_EN } from "@/lib/site";

type Tab = "cug" | "email";

// Client-side cooldown after repeated failed CUG attempts — a UX nicety only, not a security
// boundary (an attacker skips the frontend and hits the API directly). The real enforcement is
// server-side, per-IP, in POST /api/auth/verify-cug (see SECURITY.md's H-01). This just slows
// down a casual retry loop from this one browser tab and surfaces the server's 429 clearly.
const COOLDOWN_AFTER_FAILURES = 3;
const COOLDOWN_SECONDS = 30;

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cug");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
  }

  async function submitCug(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cooldownUntil && Date.now() < cooldownUntil) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return setError(`Too many attempts — please wait ${secondsLeft}s before trying again.`);
    }
    if (!/^\d{10}$/.test(mobile)) {
      return setError("Please enter a valid 10-digit mobile number.");
    }
    setBusy(true);
    try {
      const cugHash = await sha256Hex(mobile);
      const res = await apiFetch<{ role: "deo" | "admin"; districtId: number | null }>(
        "/api/auth/verify-cug",
        { method: "POST", body: JSON.stringify({ cugHash }) }
      );
      setFailedAttempts(0);
      markLastRole(res.role);
      markJustAuthed();
      router.push(res.role === "admin" ? "/admin" : "/deo-data-entry");
    } catch (err) {
      const nextFailures = failedAttempts + 1;
      setFailedAttempts(nextFailures);
      if (err instanceof ApiError && err.status === 429) {
        setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
        setError("Too many attempts — please wait before trying again.");
      } else if (nextFailures >= COOLDOWN_AFTER_FAILURES) {
        setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
        setError(`Too many failed attempts — please wait ${COOLDOWN_SECONDS}s before trying again.`);
      } else {
        setError(err instanceof ApiError ? err.message : "Login failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError("Please enter a valid email address.");
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/request-magic-link", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-50 to-blue-50 px-4 py-12 dark:from-slate-950 dark:to-slate-900">
      {/* Wider than the login card below on purpose — the RC title/data-period text only needs
          to avoid wrapping on real desktop widths (a 24" monitor has plenty of room), it doesn't
          need the login form's own inputs to also stretch that wide. Wrapping (the default) is
          only disabled from `md` up; below that it wraps naturally to the viewport like any
          other text. */}
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-2xl font-bold text-white shadow-lg shadow-blue-200 dark:shadow-none">
          ₹
        </div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Department of Excise, Uttar Pradesh
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Excise Revenue Recovery Portal</p>
        <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-300 md:whitespace-nowrap">
          {SITE_TITLE_EN}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 md:whitespace-nowrap" lang="hi">
          {SITE_TITLE_HI}
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{DATA_PERIOD_EN}</p>
      </div>

      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
            <button
              className={`flex-1 rounded-md py-2 font-medium transition-colors ${
                tab === "cug"
                  ? "bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-400"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              onClick={() => switchTab("cug")}
              type="button"
            >
              CUG Mobile (DEO)
            </button>
            <button
              className={`flex-1 rounded-md py-2 font-medium transition-colors ${
                tab === "email"
                  ? "bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-400"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              onClick={() => switchTab("email")}
              type="button"
            >
              Email (Admin)
            </button>
          </div>

          {tab === "cug" ? (
            <form onSubmit={submitCug} className="space-y-4">
              <TextField
                label="CUG Mobile Number"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit CUG mobile number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              />
              {error && <Banner variant="error">{error}</Banner>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in..." : "Login"}
              </Button>
            </form>
          ) : sent ? (
            <Banner variant="success">
              <p className="font-medium">Check your email</p>
              <p className="mt-0.5 font-normal text-emerald-600 dark:text-emerald-400">
                If <strong>{email}</strong> is registered, a sign-in link has been sent. It expires in 15 minutes.
              </p>
            </Banner>
          ) : (
            <form onSubmit={submitEmail} className="space-y-4">
              <TextField
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && <Banner variant="error">{error}</Banner>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Sending..." : "Send Login Link"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
