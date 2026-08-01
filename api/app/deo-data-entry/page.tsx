"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeNetRecoverable,
  syncRcDetailsToCount,
  validateRcDetails,
  RC_NUMBER_MAX_LENGTH,
  type DuesField,
  type DraftRcDetail,
} from "@/lib/dues-fields";
import { apiFetch, apiFetchForm, ApiError } from "@/lib/api";
import { clearLastRole, consumeJustAuthed } from "@/lib/client-session";
import { formatIST } from "@/lib/format";
import {
  confirmFinalSubmit,
  promptDeoNameAndLock,
  confirmClearForm,
  confirmUnlockRequest,
  notifyToast,
} from "@/lib/alerts";
import Cleave from "cleave.js/react";
import PacFieldInput from "@/components/PacFieldInput";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import AppHeader from "@/components/ui/AppHeader";
import HelpPanel from "@/components/ui/HelpPanel";

type CleaveChangeEvent = React.ChangeEvent<HTMLInputElement> & { target: { rawValue: string } };
import type { Profile } from "@/components/ui/ProfileMenu";
import { SITE_TITLE_EN, SITE_TITLE_HI, DATA_PERIOD_EN, DATA_PERIOD_HI } from "@/lib/site";

const BLANK_FIELD_TITLE = "Field left blank / फ़ील्ड खाली है";
const BLANK_FIELD_TEXT =
  "Please do not leave any field blank. Enter 0 if there is no due amount or recovery. / " +
  "कृपया कोई भी फ़ील्ड खाली न छोड़ें। यदि कोई धनराशि या वसूली नहीं है तो 0 दर्ज करें।";

const COUNT_MISMATCH_TITLE = "Count cannot be 0 / संख्या 0 नहीं हो सकती";

// Raw-string draft of the five DEO-entered fields — kept as strings (not numbers) so an empty
// string ("never typed") stays distinguishable from an explicit "0", same Anti-Blank Rule as
// this repo's original single-snapshot form.
type Draft = Record<DuesField, string>;

function blankDraft(): Draft {
  return {
    rcCount: "",
    rcAmount: "",
    recoveredThisPeriod: "",
    batteKhatteCount: "",
    batteKhatteAmount: "",
    courtCaseCount: "",
    courtStayedAmount: "",
  };
}

type CurrentPeriod = {
  period: string;
  lockStatus: number;
  lockedAt: string | null;
  submittedByName: string | null;
};

export default function EntryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [totalDues, setTotalDues] = useState<number | null>(null);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [rcDetails, setRcDetails] = useState<DraftRcDetail[]>([]);
  const [rcDetailsTouched, setRcDetailsTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockedInfo, setLockedInfo] = useState<CurrentPeriod | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{ requestedAt: string; reason: string } | null>(null);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
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

      if (p.currentPeriod?.lockStatus === 1) {
        setLocked(true);
        setLockedInfo(p.currentPeriod);
        setPendingRequest(p.pendingUnlockRequest ?? null);
        setReady(true);
        return;
      }

      try {
        const mine = await apiFetch<{
          totalDues: number | null;
          collectedTillDate: number | null;
          current: ({ openingBalance: number; rcDetails: string } & Record<DuesField, number>) | null;
        }>("/api/pac-dues/mine", undefined, "deo");
        setTotalDues(mine.totalDues);
        if (mine.current) {
          setOpeningBalance(mine.current.openingBalance);
          setDraft({
            rcCount: String(mine.current.rcCount),
            rcAmount: String(mine.current.rcAmount),
            recoveredThisPeriod: String(mine.current.recoveredThisPeriod),
            batteKhatteCount: String(mine.current.batteKhatteCount),
            batteKhatteAmount: String(mine.current.batteKhatteAmount),
            courtCaseCount: String(mine.current.courtCaseCount),
            courtStayedAmount: String(mine.current.courtStayedAmount),
          });
          try {
            const parsed = JSON.parse(mine.current.rcDetails || "[]") as { rcNumber: string; rcAmount: number; stayed: boolean }[];
            setRcDetails(
              syncRcDetailsToCount(
                parsed.map((d) => ({ rcNumber: d.rcNumber, rcAmount: String(d.rcAmount), stayed: d.stayed })),
                mine.current.rcCount
              )
            );
          } catch {
            setRcDetails(syncRcDetailsToCount([], mine.current.rcCount));
          }
        }
      } catch {
        // Best-effort — form just starts blank.
      }
      setReady(true);
    })();
  }, [router]);

  function updateField(field: DuesField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (field === "rcCount") {
      setRcDetails((prev) => syncRcDetailsToCount(prev, Number(value) || 0));
    }
  }

  function updateRcDetail(index: number, field: keyof DraftRcDetail, value: string | boolean) {
    setRcDetails((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

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

  async function clearForm() {
    if (!(await confirmClearForm())) return;
    setDraft(blankDraft());
    setRcDetails([]);
    setRcDetailsTouched(false);
  }

  const { duesLeft, netRecoverable } = computeNetRecoverable(
    openingBalance,
    Number(draft.recoveredThisPeriod) || 0,
    Number(draft.batteKhatteAmount) || 0,
    Number(draft.courtStayedAmount) || 0
  );

  async function submitAll() {
    const blank = (Object.keys(draft) as DuesField[]).some((f) => draft[f].trim() === "");
    if (blank) return notifyToast({ icon: "error", title: BLANK_FIELD_TITLE, text: BLANK_FIELD_TEXT });

    const batteKhatteAmount = Number(draft.batteKhatteAmount) || 0;
    const batteKhatteCount = Number(draft.batteKhatteCount) || 0;
    const courtStayedAmount = Number(draft.courtStayedAmount) || 0;
    const courtCaseCount = Number(draft.courtCaseCount) || 0;
    if (batteKhatteAmount > 0 && batteKhatteCount === 0) {
      return notifyToast({
        icon: "error",
        title: COUNT_MISMATCH_TITLE,
        text: "Batte Khatte Count cannot be 0 when Amount is entered.",
      });
    }
    if (courtStayedAmount > 0 && courtCaseCount === 0) {
      return notifyToast({
        icon: "error",
        title: COUNT_MISMATCH_TITLE,
        text: "Court Case Count cannot be 0 when Stayed Amount is entered.",
      });
    }
    if (batteKhatteAmount > duesLeft) {
      return notifyToast({
        icon: "error",
        title: "Amount too high / राशि अधिक है",
        text: "Batte Khatte Amount cannot exceed Total Dues Left.",
      });
    }
    if (courtStayedAmount > duesLeft - batteKhatteAmount) {
      return notifyToast({
        icon: "error",
        title: "Amount too high / राशि अधिक है",
        text: "Court Stayed Amount cannot exceed Total Dues Left minus Batte Khatte Amount.",
      });
    }

    const rcCount = Number(draft.rcCount) || 0;
    const rcAmount = Number(draft.rcAmount) || 0;
    const rcDetailsPayload = rcDetails.map((d) => ({
      rcNumber: d.rcNumber.trim(),
      rcAmount: Number(d.rcAmount) || 0,
      stayed: d.stayed,
    }));
    const rcError = validateRcDetails(rcCount, rcAmount, rcDetailsPayload);
    if (rcError) {
      setRcDetailsTouched(true);
      return notifyToast({ icon: "error", title: "RC Details / आर.सी. विवरण", text: rcError });
    }

    const confirmed = await confirmFinalSubmit();
    if (!confirmed) return;
    const submittedByName = await promptDeoNameAndLock();
    if (!submittedByName) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiFetch(
        "/api/pac-dues/submit",
        {
          method: "POST",
          body: JSON.stringify({
            submittedByName,
            rcCount,
            rcAmount,
            rcDetails: rcDetailsPayload,
            recoveredThisPeriod: Number(draft.recoveredThisPeriod),
            batteKhatteCount,
            batteKhatteAmount,
            courtCaseCount,
            courtStayedAmount,
          }),
        },
        "deo"
      );
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
            <h1 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {lockedInfo?.period} — Data Already Locked
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              You locked this period&apos;s submission on{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {formatIST(lockedInfo?.lockedAt)} IST
              </span>
              .
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              You cannot make any further changes. If any data was entered incorrectly or needs
              editing, use <strong>Request Unlock</strong> below to send the Admin / Excise
              Headquarters your reason directly — you&apos;ll be notified here once it&apos;s reviewed.
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400" lang="hi">
              आपने इस अवधि का डेटा {formatIST(lockedInfo?.lockedAt)} IST को लॉक कर दिया है। अब
              कोई और बदलाव संभव नहीं है। किसी भी गलत डेटा या संशोधन के लिए नीचे दिए गए{" "}
              <strong>Request Unlock</strong> बटन से एडमिन / आबकारी मुख्यालय को सीधे अपना कारण
              भेजें — समीक्षा होने पर आपको यहीं सूचित किया जाएगा।
            </p>
            {pendingRequest ? (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900 dark:bg-amber-950">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Request pending since {formatIST(pendingRequest.requestedAt)} IST — awaiting
                  Admin review.
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
                    placeholder="Why does this period need to be unlocked?"
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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="DEO Data Entry" role="deo" profile={profile} />
      <HelpPanel
        pageKey="deo-entry"
        title="Filling this form"
        childrenHi={
          <>
            <p>
              सभी फ़ील्ड भरें। कोई भी फ़ील्ड खाली नहीं छोड़ी जानी चाहिए — यदि वास्तव में कोई राशि
              नहीं है तो 0 दर्ज करें। यदि आर.सी. संख्या 0 से अधिक है, तो उतनी ही आर.सी. विवरण
              पंक्तियाँ भरें (आर.सी. नंबर, आर.सी. राशि, क्या न्यायालय द्वारा स्थगित है) — उनकी
              कुल राशि ऊपर दी गई आर.सी. राशि के बराबर होनी चाहिए।
            </p>
            <p>
              यह पोर्टल केवल 31 मार्च 2019 को समाप्त वित्तीय वर्ष तक उत्पन्न मामलों की बकाया
              धनराशि की वसूली ट्रैक करता है — इस अवधि के बाद की कोई नई बकाया या वसूली यहाँ दर्ज
              न करें।
            </p>
            <p>
              यदि <strong>बट्टे खाते</strong> या <strong>न्यायालय द्वारा स्थगित</strong> राशि 0 से
              अधिक है, तो संबंधित संख्या भी 0 से अधिक होनी चाहिए।
            </p>
          </>
        }
      >
        <p>
          Enter every field. None may be left blank — type 0 if there is genuinely no amount, so
          a blank never gets silently treated as zero. If RC Count is more than 0, fill in that
          many RC Detail rows (RC Number, RC Amount, whether a court has stayed that RC) — their
          amounts must add up to the RC Amount above.
        </p>
        <p>
          This portal only tracks recovery of dues from cases originating up to FY ending 31
          March 2019 — do not enter any new dues or recovery from after that period.
        </p>
        <p>
          If <strong>Batte Khatte</strong> or <strong>Court Stayed</strong> amount is more than
          0, the matching count must be more than 0 too.
        </p>
      </HelpPanel>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pt-8 pb-24 sm:pb-8">
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-center dark:border-blue-900 dark:bg-blue-950/40">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{SITE_TITLE_EN}</p>
          <p className="text-xs text-blue-700 dark:text-blue-300" lang="hi">
            {SITE_TITLE_HI}
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{DATA_PERIOD_EN}</p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400" lang="hi">
            {DATA_PERIOD_HI}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                1. वसूल की जाने वाली सकल धनराशि (31-मार्च-2019 तक) / Gross Dues (as on 31-Mar-2019)
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                {totalDues !== null ? `₹${totalDues.toLocaleString("en-IN")}` : "—"}
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                2. इस अवधि हेतु प्रारंभिक शेष धनराशि / Opening Balance for this Period
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                ₹{openingBalance.toLocaleString("en-IN")}
              </div>
            </label>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PacFieldInput
              label="3. (i) जारी आर.सी. (R.C.) की संख्या / No. of RCs Issued"
              value={draft.rcCount}
              money={false}
              onChange={(v) => updateField("rcCount", v)}
            />
            <PacFieldInput
              label="3. (ii) आर.सी. में निहित धनराशि / RC Amount"
              value={draft.rcAmount}
              money
              onChange={(v) => updateField("rcAmount", v)}
            />
          </div>

          {rcDetails.length > 0 && (
            <div className="mb-5 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 border-b border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
                <i className="ti ti-list-details text-base text-blue-600 dark:text-blue-400" />
                RC Details / आर.सी. विवरण ({rcDetails.length})
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <th className="w-8 py-1.5 pr-2">#</th>
                      <th className="w-[34%] py-1.5 pr-2">RC Number</th>
                      <th className="w-[34%] py-1.5 pr-2">RC Amount</th>
                      <th className="w-32 py-1.5 text-center">
                        <span className="block text-[10px] leading-tight font-semibold">Stayed by Court?</span>
                        <span className="mt-0.5 block text-xs leading-normal normal-case" lang="hi">
                          न्यायालय द्वारा स्थगित?
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rcDetails.map((detail, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600 dark:text-slate-400">{i + 1}</td>
                        <td className="py-1.5 pr-2">
                          <input
                            type="text"
                            maxLength={RC_NUMBER_MAX_LENGTH}
                            placeholder="RC Number"
                            value={detail.rcNumber}
                            onChange={(e) => updateRcDetail(i, "rcNumber", e.target.value)}
                            onBlur={() => setRcDetailsTouched(true)}
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Cleave
                            value={detail.rcAmount}
                            onBlur={() => setRcDetailsTouched(true)}
                            options={{
                              numeral: true,
                              numeralThousandsGroupStyle: "lakh",
                              numeralDecimalScale: 2,
                              prefix: "₹",
                              rawValueTrimPrefix: true,
                            }}
                            onChange={(e: CleaveChangeEvent) => updateRcDetail(i, "rcAmount", e.target.rawValue)}
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="py-1.5">
                          <Select
                            size="md"
                            value={detail.stayed ? "yes" : "no"}
                            onChange={(e) => updateRcDetail(i, "stayed", e.target.value === "yes")}
                            className="w-full min-w-0"
                          >
                            <option value="no">No / नहीं</option>
                            <option value="yes">Yes / हाँ</option>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rcDetailsTouched &&
                  Math.abs(rcDetails.reduce((s, d) => s + (Number(d.rcAmount) || 0), 0) - (Number(draft.rcAmount) || 0)) > 0.01 && (
                    <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400" lang="hi">
                      आर.सी. विवरण की कुल राशि, आर.सी. राशि के बराबर होनी चाहिए। / RC Details total must equal RC Amount.
                    </p>
                  )}
              </div>
            </div>
          )}

          <div className="mb-5">
            <PacFieldInput
              label="4. इस अवधि में वसूल की गई धनराशि / Recovered This Period"
              value={draft.recoveredThisPeriod}
              money
              onChange={(v) => updateField("recoveredThisPeriod", v)}
            />
          </div>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              5. कुल बकाया धनराशि / Total Dues Left
            </span>
            <div className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100">
              ₹{duesLeft.toLocaleString("en-IN")}
            </div>
          </label>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PacFieldInput
              label="6. बट्टे खाते — संख्या / Batte Khatte Count"
              value={draft.batteKhatteCount}
              money={false}
              onChange={(v) => updateField("batteKhatteCount", v)}
            />
            <PacFieldInput
              label="6. बट्टे खाते — धनराशि / Batte Khatte Amount"
              value={draft.batteKhatteAmount}
              money
              onChange={(v) => updateField("batteKhatteAmount", v)}
            />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PacFieldInput
              label="7. न्यायालय द्वारा स्थगित — संख्या / Court Stayed Count"
              value={draft.courtCaseCount}
              money={false}
              onChange={(v) => updateField("courtCaseCount", v)}
            />
            <PacFieldInput
              label="7. न्यायालय द्वारा स्थगित — धनराशि / Court Stayed Amount"
              value={draft.courtStayedAmount}
              money
              onChange={(v) => updateField("courtStayedAmount", v)}
            />
          </div>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-sm font-bold text-emerald-700 dark:text-emerald-400">
              8. शुद्ध वसूल की जाने वाली धनराशि / Net Recoverable
            </span>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-lg font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
              ₹{netRecoverable.toLocaleString("en-IN")}
            </div>
          </label>

          {submitError && <p className="mb-4 text-sm font-bold text-red-600 dark:text-red-400">{submitError}</p>}

          <div className="flex gap-2">
            <Button variant="primary" size="lg" className="flex-1" onClick={submitAll} disabled={submitting}>
              {submitting && <i className="ti ti-loader animate-spin text-sm" />}
              {submitting ? "Submitting..." : "Verify & Lock Record"}
            </Button>
            <Button variant="secondary" size="lg" onClick={clearForm} disabled={submitting}>
              <i className="ti ti-trash text-sm" />
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
