"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, type DraftYear, type DraftRcDetail } from "@/lib/client-db";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, computeNetRecoverableSeries } from "@/lib/pac-fields";
import { apiFetch, apiFetchForm, ApiError } from "@/lib/api";
import { clearLastRole, consumeJustAuthed } from "@/lib/client-session";
import { formatIST } from "@/lib/format";
import {
  confirmFinalSubmit,
  promptDeoNameAndLock,
  confirmClearYear,
  confirmClearAll,
  confirmUnlockRequest,
  notifyToast,
} from "@/lib/alerts";
import YearStepForm, { countAmountErrors, rcDetailsError, syncRcDetailsToCount } from "@/components/YearStepForm";
import MasterView from "@/components/MasterView";
import Button from "@/components/ui/Button";
import AppHeader from "@/components/ui/AppHeader";
import HelpPanel from "@/components/ui/HelpPanel";
import type { Profile } from "@/components/ui/ProfileMenu";
import { SITE_TITLE_EN, SITE_TITLE_HI, DATA_PERIOD_EN } from "@/lib/site";

const BLANK_FIELD_TITLE = "Field left blank / फ़ील्ड खाली है";
const BLANK_FIELD_TEXT =
  "Please do not leave any field blank. Enter 0 if there is no due amount or recovery. / " +
  "कृपया कोई भी फ़ील्ड खाली न छोड़ें। यदि कोई धनराशि या वसूली नहीं है तो 0 दर्ज करें।";

const COUNT_MISMATCH_TITLE = "Count cannot be 0 / संख्या 0 नहीं हो सकती";

const RECOVERED_CAP_TITLE = "Recovered Amount too high / वसूल की गयी धनराशि अधिक है";
const RECOVERED_CAP_TEXT =
  "Recovered Amount cannot exceed Opening Balance + Gross Arrears for this year — you cannot " +
  "recover more than was owed. / वसूल की गयी धनराशि इस वर्ष की प्रारंभिक शेष धनराशि + सकल बकाया " +
  "धनराशि से अधिक नहीं हो सकती — जितना बकाया था उससे अधिक वसूली संभव नहीं है।";

const RC_DETAILS_TITLE = "RC Details incomplete / आर.सी. विवरण अधूरा है";
const RC_DETAILS_TEXT =
  "Every RC Number/Amount must be filled in, and the RC Details total must equal the RC " +
  "Amount entered above. / प्रत्येक आर.सी. नंबर/राशि भरी जानी चाहिए, और आर.सी. विवरण की कुल " +
  "राशि ऊपर दर्ज आर.सी. राशि के बराबर होनी चाहिए।";

// Shape of a row returned by GET /api/pac-data/mine — the raw pac_data table row (numbers, and
// rcDetails as the stored JSON string), as opposed to DraftYear's raw-string fields (see db.ts
// for why those stay strings).
type RemoteYearRow = {
  financialYear: string;
  grossArrears: number;
  rcCount: number;
  rcAmount: number;
  rcDetails: string;
  recoveredAmount: number;
  stayCount: number;
  stayAmount: number;
};

function blankYear(financialYear: (typeof FINANCIAL_YEARS)[number]): DraftYear {
  return {
    financialYear,
    grossArrears: "",
    rcCount: "",
    rcAmount: "",
    rcDetails: [],
    recoveredAmount: "",
    stayCount: "",
    stayAmount: "",
    completed: false,
  };
}

// Parses the stored JSON string back into DraftRcDetail's raw-string-amount shape — best-effort,
// falls back to an empty array for a malformed/missing value rather than throwing (this is a
// re-fetch of the DEO's own previously-submitted data, not a fresh zero-trust boundary).
function parseRemoteRcDetails(raw: string): DraftRcDetail[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((d) => ({
      rcNumber: String(d.rcNumber ?? ""),
      rcAmount: String(d.rcAmount ?? ""),
      stayed: Boolean(d.stayed),
    }));
  } catch {
    return [];
  }
}

export default function EntryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [years, setYears] = useState<DraftYear[]>(FINANCIAL_YEARS.map(blankYear));
  const [step, setStep] = useState(0); // 0..4 = year steps, 5 = master view
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  // True once we know (from the server, not a cached hint) that this DEO's district is
  // currently locked — a returning DEO who logs back in after locking (nothing prevents that
  // login itself) previously saw a blank form, because the local Dexie draft is wiped on
  // submit and there was nothing checking D1 for the real, current lock state.
  const [locked, setLocked] = useState(false);
  // Self-service unlock request (ROADMAP.md Milestone 28) — separate from `profile` so
  // submitting a request can update this immediately without waiting on a full /api/auth/me
  // re-fetch.
  const [pendingRequest, setPendingRequest] = useState<{ requestedAt: string; reason: string } | null>(null);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Ask the server directly rather than pre-checking a local hint — see the matching
      // comment in lib/useAdminData.ts. This session lives in its own token slot (independent
      // of any admin session in the same browser), so this always reflects this page's own login.
      let p: Profile;
      try {
        p = await apiFetch<Profile>("/api/auth/me?role=deo", undefined, "deo");
        setProfile(p);
        if (consumeJustAuthed()) {
          notifyToast({ icon: "success", title: `Welcome, DEO ${p.districtName ?? ""}`.trim() });
        }
      } catch {
        clearLastRole("deo");
        router.replace("/login");
        return;
      }

      if (p.lockStatus === 1) {
        setLocked(true);
        setPendingRequest(p.pendingUnlockRequest ?? null);
        setReady(true);
        return;
      }

      // Unlocked — either a fresh DEO who's never submitted, or one an Admin just unlocked.
      // In the unlock case D1 still holds the real, previously-submitted figures (an unlock
      // never clears pac_data — see CLAUDE.md) even though the local Dexie draft was wiped at
      // submit time, so fetch it and let it win over any (stale/blank) local draft per year.
      const remoteByYear = new Map<string, DraftYear>();
      try {
        const { years: remoteRows } = await apiFetch<{ years: RemoteYearRow[] }>("/api/pac-data/mine", undefined, "deo");
        for (const row of remoteRows) {
          remoteByYear.set(row.financialYear, {
            financialYear: row.financialYear as (typeof FINANCIAL_YEARS)[number],
            grossArrears: String(row.grossArrears),
            rcCount: String(row.rcCount),
            rcAmount: String(row.rcAmount),
            rcDetails: parseRemoteRcDetails(row.rcDetails),
            recoveredAmount: String(row.recoveredAmount),
            stayCount: String(row.stayCount),
            stayAmount: String(row.stayAmount),
            completed: true,
          });
        }
      } catch {
        // Best-effort — fall back to whatever's already in the local Dexie cache below.
      }

      const stored = await db.draftYears.toArray();
      const merged = FINANCIAL_YEARS.map(
        (fy) => remoteByYear.get(fy) ?? stored.find((y) => y.financialYear === fy) ?? blankYear(fy)
      );
      // Keep Dexie in sync with whatever D1 just gave us, so Clear/Clear All and every other
      // local-only operation on this page keep working against real state on the next reload.
      await db.draftYears.bulkPut(merged);
      setYears(merged);
      const firstIncomplete = merged.findIndex((y) => !y.completed);
      setStep(firstIncomplete === -1 ? 5 : firstIncomplete);
      setReady(true);
    })();
  }, [router]);

  function updateField(index: number, field: keyof DraftYear, value: string) {
    setYears((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value } as DraftYear;
      // Keep the RC Details row count in sync the moment rcCount changes — see
      // YearStepForm.tsx's syncRcDetailsToCount() for why this lives here (that component holds
      // no internal field state, per its own controlled-component convention).
      if (field === "rcCount") {
        updated.rcDetails = syncRcDetailsToCount(updated.rcDetails ?? [], Number(value) || 0);
      }
      next[index] = updated;
      db.draftYears.put(next[index]);
      return next;
    });
  }

  function updateRcDetail(index: number, rcIndex: number, field: keyof DraftRcDetail, value: string | boolean) {
    setYears((prev) => {
      const next = [...prev];
      const details = [...(next[index].rcDetails ?? [])];
      details[rcIndex] = { ...details[rcIndex], [field]: value };
      next[index] = { ...next[index], rcDetails: details };
      db.draftYears.put(next[index]);
      return next;
    });
  }

  async function saveAndContinue(index: number) {
    const year = years[index];
    const rcDetailsBlank = (year.rcDetails ?? []).some(
      (d) => d.rcNumber.trim() === "" || d.rcAmount.trim() === ""
    );
    const blank = PAC_FIELD_ORDER.some((field) => year[field].trim() === "") || rcDetailsBlank;
    if (blank) return notifyToast({ icon: "error", title: BLANK_FIELD_TITLE, text: BLANK_FIELD_TEXT });

    // A non-zero RC/Stay Amount with a 0 count is a data-entry oversight — the inline field
    // error in YearStepForm already shows this once the field is blurred, but a DEO could still
    // click Save & Continue without ever blurring the offending field, so block here too.
    const countErrors = countAmountErrors(year);
    if (countErrors.length > 0) {
      return notifyToast({ icon: "error", title: COUNT_MISMATCH_TITLE, text: countErrors.join(" ") });
    }

    // Can't recover more than was ever owed within this 5-year window — this FY's fresh
    // grossArrears plus whatever carried forward as openingBalance. Mirrored server-side in
    // the submit route (zero-trust). netRecoverableSeries is computed further down this
    // component body, but by the time this handler actually runs (a later click, after a full
    // render already happened) it's initialized — see the comment there.
    const openingBalance = netRecoverableSeries[year.financialYear].openingBalance;
    const gross = Number(year.grossArrears) || 0;
    const recovered = Number(year.recoveredAmount) || 0;
    if (recovered > openingBalance + gross) {
      return notifyToast({ icon: "error", title: RECOVERED_CAP_TITLE, text: RECOVERED_CAP_TEXT });
    }

    // Zero-trust cap mirrored server-side (validateRcDetails() in the submit route) — every RC
    // Details row must be filled in (checked above) and their amounts must sum to RC Amount.
    if (rcDetailsError(year)) {
      return notifyToast({ icon: "error", title: RC_DETAILS_TITLE, text: RC_DETAILS_TEXT });
    }

    const updated = { ...year, completed: true };
    setYears((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    await db.draftYears.put(updated);
    setStep(index + 1 <= 4 ? index + 1 : 5);
  }

  // Both only reachable pre-lock (these buttons/the whole page disappear once submitAll()
  // locks and redirects away) — clears the local Dexie draft only, never touches D1.
  // No confirm() popup here, unlike AppHeader's logout (which does ask first) — once a DEO is on
  // this locked screen, logging out is the *only* thing left to do, so a blocking "are you sure"
  // would just be an extra click in front of a choice with no other option.
  async function logoutLocked() {
    await apiFetch(`/api/auth/logout?role=deo`, { method: "POST" }, "deo").catch(() => {});
    clearLastRole("deo");
    notifyToast({ icon: "info", title: "Logged out" });
    router.replace("/login");
  }

  async function submitUnlockRequest() {
    const reason = requestReason.trim();
    if (!reason) return notifyToast({ icon: "error", title: BLANK_FIELD_TITLE, text: BLANK_FIELD_TEXT });

    if (!(await confirmUnlockRequest())) return;

    setRequestSubmitting(true);
    setRequestError(null);
    try {
      const form = new FormData();
      form.append("reason", reason);
      await apiFetchForm("/api/deo/request-unlock", form, "deo");
      setPendingRequest({ requestedAt: new Date().toISOString(), reason });
      setRequestFormOpen(false);
      setRequestReason("");
    } catch (err) {
      setRequestError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function clearYear(index: number) {
    const confirmed = await confirmClearYear(`FY ${years[index].financialYear}`);
    if (!confirmed) return;
    const blanked = blankYear(years[index].financialYear);
    await db.draftYears.put(blanked);
    setYears((prev) => {
      const next = [...prev];
      next[index] = blanked;
      return next;
    });
    if (step > index) setStep(index);
  }

  async function clearAllData() {
    const confirmed = await confirmClearAll();
    if (!confirmed) return;
    await db.draftYears.clear();
    setYears(FINANCIAL_YEARS.map(blankYear));
    setStep(0);
  }

  function goToStep(target: number) {
    if (target === 0 || years[target - 1]?.completed) setStep(target);
  }

  async function submitAll() {
    // Two-step confirm, both blocking modals since locking is irreversible without an Admin
    // unlock: first a plain "have you checked the data" confirm, then a name-entry prompt
    // with its own liability disclaimer — modeled on the sibling excise-bakaya-record
    // project's single Swal.fire({ input: "text" }) "Verify & Lock Record" prompt.
    const confirmed = await confirmFinalSubmit();
    if (!confirmed) return;
    const submittedByName = await promptDeoNameAndLock();
    if (!submittedByName) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiFetch(
        "/api/pac-data/submit",
        {
          method: "POST",
          body: JSON.stringify({
            submittedByName,
            years: years.map((y) => ({
              financialYear: y.financialYear,
              grossArrears: Number(y.grossArrears),
              rcCount: Number(y.rcCount),
              rcAmount: Number(y.rcAmount),
              rcDetails: (y.rcDetails ?? []).map((d) => ({
                rcNumber: d.rcNumber.trim(),
                rcAmount: Number(d.rcAmount) || 0,
                stayed: d.stayed,
              })),
              recoveredAmount: Number(y.recoveredAmount),
              stayCount: Number(y.stayCount),
              stayAmount: Number(y.stayAmount),
            })),
          }),
        },
        "deo"
      );
      await db.draftYears.clear();
      // Locked — no server-side session to revoke (stateless JWT cookie), so clear the
      // last-role hint client-side right away instead; the district lock itself is what
      // actually stops this DEO from re-entering.
      clearLastRole("deo");
      setSubmitted(true);
      setTimeout(() => router.replace("/login"), 1800);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="DEO Data Entry" role="deo" profile={profile} />
        <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-8 pb-24 sm:pb-8">
          <div className="mb-4 h-24 w-full animate-pulse rounded-lg bg-blue-50/50 dark:bg-blue-950/20" />
          <div className="mb-6 h-12 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-blue-50 px-4 dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300">
            <i className="ti ti-circle-check text-2xl" />
          </div>
          <h1 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Submitted &amp; Locked</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="DEO Data Entry" role="deo" profile={profile} />
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
              <i className="ti ti-lock text-2xl" />
            </div>
            <h1 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Data Already Locked</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              You locked your submission on{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {formatIST(profile?.lockedAt)} IST
              </span>
              .
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              You cannot make any further changes. If any data was entered incorrectly or needs
              editing, use <strong>Request Unlock</strong> below to send the Admin / Excise
              Headquarters your reason directly — you'll be notified here once it's reviewed.
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400" lang="hi">
              आपने अपना डेटा {formatIST(profile?.lockedAt)} IST को लॉक कर दिया है। अब कोई और
              बदलाव संभव नहीं है। किसी भी गलत डेटा या संशोधन के लिए नीचे दिए गए{" "}
              <strong>Request Unlock</strong> बटन से एडमिन / आबकारी मुख्यालय को सीधे अपना कारण
              भेजें — समीक्षा होने पर आपको यहीं सूचित किया जाएगा।
            </p>
            {pendingRequest ? (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900 dark:bg-amber-950">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Request pending since {formatIST(pendingRequest.requestedAt)} IST — awaiting
                  Admin review.
                </p>
                <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-300" lang="hi">
                  अनुरोध {formatIST(pendingRequest.requestedAt)} IST से लंबित है — एडमिन की
                  समीक्षा की प्रतीक्षा है।
                </p>
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{pendingRequest.reason}</p>
              </div>
            ) : requestFormOpen ? (
              <div className="mt-6 space-y-3 rounded-lg border border-slate-200 p-4 text-left dark:border-slate-800">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Reason (Hindi or English) / कारण (हिंदी या अंग्रेज़ी)
                  </label>
                  <textarea
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Why does this district need to be unlocked?"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                {requestError && <p className="text-sm font-bold text-red-600 dark:text-red-400">{requestError}</p>}
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" className="flex-1" onClick={submitUnlockRequest} disabled={requestSubmitting}>
                    {requestSubmitting && <i className="ti ti-loader animate-spin text-sm" />}
                    {requestSubmitting ? "Submitting..." : "Submit Request"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRequestFormOpen(false);
                      setRequestReason("");
                      setRequestError(null);
                    }}
                    disabled={requestSubmitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="dark" size="md" className="mt-6 w-full" onClick={() => setRequestFormOpen(true)}>
                <i className="ti ti-lock-open text-sm" />
                Request Unlock
              </Button>
            )}
            <Button variant="secondary" size="md" className="mt-3 w-full" onClick={logoutLocked}>
              <i className="ti ti-logout text-sm" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Live opening-balance preview for the DEO's in-progress draft — recomputed from the six raw
  // fields on every render rather than stored, since nothing's in D1 yet until final submit (see
  // CLAUDE.md's Data model section).
  const netRecoverableSeries = computeNetRecoverableSeries(
    Object.fromEntries(
      years.map((y) => [
        y.financialYear,
        {
          grossArrears: Number(y.grossArrears) || 0,
          recoveredAmount: Number(y.recoveredAmount) || 0,
          stayAmount: Number(y.stayAmount) || 0,
        },
      ])
    )
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="DEO Data Entry" role="deo" profile={profile} />
      <HelpPanel
        pageKey="deo-entry"
        title="Filling this form"
        childrenHi={
          <>
            <p>
              प्रत्येक वर्ष के लिए सभी छह पीएसी/आरसी फ़ील्ड भरें। कोई भी फ़ील्ड खाली नहीं छोड़ी
              जानी चाहिए — यदि वास्तव में कोई राशि नहीं है तो 0 दर्ज करें, ताकि खाली फ़ील्ड को कभी
              भी शून्य न माना जाए।
            </p>
            <p>
              <strong>वसूल की गयी धनराशि</strong> और <strong>आर.सी. राशि</strong> स्वतंत्र आंकड़े
              हैं — प्रत्येक को अपनी वास्तविक संख्या के रूप में दर्ज करें, दोनों के बीच कोई
              ऑटो-फिल नहीं है। वसूल की गयी धनराशि उस वर्ष की प्रारंभिक शेष धनराशि + सकल बकाया
              धनराशि से अधिक नहीं हो सकती।
            </p>
            <p>
              यदि <strong>आर.सी. की संख्या</strong> 0 से अधिक है, तो एक{" "}
              <strong>आर.सी. विवरण</strong> अनुभाग दिखाई देगा — प्रत्येक आर.सी. की अपनी संख्या और
              राशि दर्ज करें, और &quot;सक्षम न्यायालय द्वारा स्थगित?&quot; ड्रॉपडाउन से चुनें
              (डिफ़ॉल्ट रूप से नहीं — केवल तभी हाँ चुनें जब उस विशेष आर.सी. को किसी सक्षम
              न्यायालय द्वारा स्थगित किया गया हो)। सभी आर.सी. राशियों का योग ऊपर दर्ज आर.सी.
              राशि के बराबर होना चाहिए।
            </p>
            <p>
              <strong>प्रारंभिक शेष धनराशि</strong> पिछले वर्ष की शुद्ध वसूली योग्य धनराशि से आगे
              बढ़ती है, और टाइप करते समय <strong>शुद्ध वसूली योग्य धनराशि</strong> तुरंत अपडेट
              होती है — लॉक करने पर दोनों आपकी सबमिशन में सहेजी जाती हैं।
            </p>
            <p>
              प्रत्येक वित्तीय वर्ष तभी अनलॉक होता है जब पिछला वर्ष सहेजा जा चुका हो।
              मास्टर व्यू पर &quot;फाइनल सबमिट एंड लॉक&quot; एडमिन अनलॉक के बिना अपरिवर्तनीय है।
            </p>
          </>
        }
      >
        <p>
          Enter all six PAC/RC fields for each year. None may be left blank — type 0 if there
          is genuinely no amount, so a blank never gets silently treated as zero.
        </p>
        <p>
          <strong>Recovered Amount</strong> and <strong>RC Amount</strong> are independent
          figures — enter each one as its own real number, no auto-fill between them. Recovered
          Amount cannot exceed Opening Balance + Gross Arrears for that year.
        </p>
        <p>
          If <strong>RC Count</strong> is more than 0, an <strong>RC Details</strong> section
          appears — enter each RC&apos;s own Number and Amount, and select from the
          &quot;Stayed by Court?&quot; dropdown (defaults to No — choose Yes only if a
          competent court has stayed that specific RC). Every RC Amount must add up to the RC
          Amount entered above.
        </p>
        <p>
          <strong>Opening Balance</strong> carries forward from the previous year&apos;s Net
          Recoverable, and <strong>Net Recoverable</strong> updates live as you type — both are
          saved to your submission once you lock it.
        </p>
        <p>
          Each financial year unlocks only once the previous one is saved.
          &quot;Final Submit &amp; Lock&quot; on the Master View is irreversible without an
          Admin unlock.
        </p>
      </HelpPanel>
      {/* Same max-w-6xl regardless of step — this used to shrink to max-w-4xl outside the Master
          View, which made switching between a year's form and the (correctly wide) summary
          table page-jump/resize oddly. w-full still caps it at the viewport on mobile. */}
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24 sm:pb-8">
        {/* Tells the DEO what they're filing before they see any form fields — sits below the
            header/help button and above the year pills, not inside the sticky nav itself, so it
            scrolls away once they're deep into a year's fields instead of permanently eating
            sticky-bar height. */}
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-center dark:border-blue-900 dark:bg-blue-950/40">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{SITE_TITLE_EN}</p>
          <p className="text-xs text-blue-700 dark:text-blue-300" lang="hi">
            {SITE_TITLE_HI}
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{DATA_PERIOD_EN}</p>
          <p className="mt-2 text-xs font-medium text-blue-700 dark:text-blue-300">
            Enter only dues/recoveries that fall within each financial year&apos;s own scope —
            do not include arrears from before 1 April 2021 or after 31 March 2026, and do not
            enter recovery of dues from years outside this period.
          </p>
          <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300" lang="hi">
            कृपया केवल उसी वित्तीय वर्ष के दायरे में आने वाली बकाया/वसूली दर्ज करें — 1 अप्रैल 2021
            से पूर्व या 31 मार्च 2026 के बाद की बकाया राशि दर्ज न करें, और न ही इस अवधि से बाहर के
            वर्षों की बकाया की वसूली यहाँ दर्ज करें।
          </p>
        </div>
        <nav className="sticky top-16 z-10 mb-6 flex flex-col items-stretch gap-2 border-b border-slate-100 bg-slate-50/95 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 sm:flex-wrap sm:gap-2">
            {FINANCIAL_YEARS.map((fy, i) => {
              const done = years[i]?.completed;
              const locked = i !== 0 && !years[i - 1]?.completed;
              return (
                <button
                  key={fy}
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={locked}
                  style={locked ? { cursor: "not-allowed" } : undefined}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors sm:flex-none sm:justify-start sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm ${
                    step === i
                      ? "bg-blue-600 text-white shadow-sm"
                      : done
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  } disabled:opacity-40`}
                >
                  FY {fy}
                </button>
              );
            })}
          </div>
          {/* flex-1 on both so they split the row edge-to-edge on mobile (rather than sitting
              compact/left-aligned with dead space on the right) — sm:flex-none once there's a
              sticky nav row wide enough that hugging their own content (Master View pinned via
              sm:ml-auto) looks right instead. */}
          <div className="flex items-center gap-2 sm:ml-auto">
            {/* Hand-styled (not Button.tsx) to match the rounded-full pill shape of its FY-pill/
                Master View neighbors in this bar — Button.tsx's shared SIZES bake in rounded-md
                for toolbar buttons elsewhere in the app, which reads as an odd square patch
                sitting between two pills right next to it. */}
            <button
              type="button"
              onClick={clearAllData}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 sm:flex-none sm:justify-start dark:border-red-900 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
            >
              <i className="ti ti-trash text-sm" />
              Clear All
            </button>
            <button
              type="button"
              onClick={() => goToStep(5)}
              disabled={!years.every((y) => y.completed)}
              style={!years.every((y) => y.completed) ? { cursor: "not-allowed" } : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:justify-start ${
                step === 5
                  ? "bg-blue-600 text-white shadow-sm"
                  : years.every((y) => y.completed)
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              } disabled:opacity-40`}
            >
              <i className="ti ti-clipboard-list text-base" />
              Master View
            </button>
          </div>
        </nav>

        <div key={step} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-in fade-in slide-in-from-right-2 duration-300">
          {step < 5 ? (
            <YearStepForm
              year={years[step]}
              openingBalance={netRecoverableSeries[years[step].financialYear].openingBalance}
              onFieldChange={(field, value) => updateField(step, field, value)}
              onRcDetailChange={(rcIndex, field, value) => updateRcDetail(step, rcIndex, field, value)}
              onSaveAndContinue={() => saveAndContinue(step)}
              onBack={step > 0 ? () => setStep(step - 1) : undefined}
              onClear={() => clearYear(step)}
              isLastYear={step === 4}
            />
          ) : (
            <MasterView
              years={years}
              districtName={profile?.districtName}
              onSubmit={submitAll}
              busy={submitting}
              error={submitError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
