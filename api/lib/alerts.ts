// SweetAlert2 loaded via CDN (see app/layout.tsx) — strictly no native window.alert/confirm.
// Reserved for interactions that warrant a blocking modal (irreversible actions, logout) and
// brief auth-transition toasts (modeled on the sibling excise-bakaya-record project's
// `toast: true, position: 'top-end'` pattern). Everything else (validation, routine
// errors/success) is inline SPA state — see components/ui/Banner.tsx — not a popup.
export async function confirmFinalSubmit(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: "Are you sure?",
    html:
      "Please verify every field is correct before continuing. Once submitted, this entry " +
      "<strong>cannot be edited or deleted</strong> — you can always submit a further update " +
      "later, but this entry itself is permanent." +
      '<br><br><span lang="hi">कृपया आगे बढ़ने से पहले सुनिश्चित करें कि सभी जानकारी सही है। ' +
      "एक बार सबमिट होने के बाद इसे <strong>संपादित या हटाया नहीं जा सकता</strong> — आप बाद में एक और " +
      "अपडेट सबमिट कर सकते हैं, लेकिन यह प्रविष्टि स्थायी है।</span>",
    showCancelButton: true,
    confirmButtonText: "Yes, data is correct",
    cancelButtonText: "Let me check again",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}

// Only letters, spaces, and the punctuation real names actually use (dots for initials,
// hyphens/apostrophes for compound names) — deliberately excludes digits so a DEO can't paste
// their CUG number in here, which has happened before.
const NAME_CHARS_RE = /^[A-Za-z][A-Za-z.\-' ]*$/;
// Catches designations typed instead of a name (the other recurring mistake — e.g. "DEO
// Shajapur" instead of the officer's actual name), as a whole word so it doesn't false-positive
// on names that happen to contain those letters.
const DESIGNATION_RE = /\b(deo|adeo|d\.?e\.?o\.?|excise\s*officer|officer|admin)\b/i;

function validateDeoName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Please enter your full name. / कृपया अपना पूरा नाम दर्ज करें।";
  }
  if (/\d/.test(trimmed)) {
    return "Name must not contain numbers — do not type your CUG number here. / नाम में अंक नहीं होने चाहिए — कृपया यहाँ अपना CUG नंबर न लिखें।";
  }
  if (DESIGNATION_RE.test(trimmed)) {
    return 'Please enter your actual name, not your designation (e.g. "DEO"). / कृपया अपना पद नहीं, अपना वास्तविक नाम दर्ज करें।';
  }
  if (!NAME_CHARS_RE.test(trimmed)) {
    return "Please enter your name in English letters only (dots/hyphens allowed). / कृपया केवल अंग्रेज़ी अक्षरों में अपना नाम दर्ज करें।";
  }
  return undefined;
}

// Second step of the submit flow (after confirmFinalSubmit): a SweetAlert2 text-input dialog,
// modeled on the sibling excise-bakaya-record project's "Verify & Lock Record" prompt — same
// small-scale pattern (Swal.fire({ input: "text", inputValidator }) instead of a custom form),
// with a liability disclaimer added and a stricter validator (that project only checked for
// non-empty). Returns the trimmed name, or null if the DEO cancelled.
export async function promptDeoNameAndLock(): Promise<string | null> {
  const result = await window.Swal.fire({
    title: "Verify & Submit",
    html:
      "Enter the full name of the District Excise Officer confirming this submission. " +
      "By submitting, you confirm the data is accurate — <strong>any incorrect data or error is " +
      "the submitting DEO's individual responsibility</strong>, who will be personally liable " +
      "for it." +
      '<br><br><span lang="hi">इस सबमिशन की पुष्टि करने वाले जिला आबकारी अधिकारी का पूरा नाम दर्ज करें। ' +
      "सबमिट करने पर, आप पुष्टि करते हैं कि डेटा सही है — <strong>किसी भी गलत डेटा या त्रुटि की जिम्मेदारी " +
      "व्यक्तिगत रूप से संबंधित डीईओ की होगी</strong>, जो इसके लिए व्यक्तिगत रूप से उत्तरदायी होंगे।</span>",
    input: "text",
    inputPlaceholder: "Full Name (English)",
    showCancelButton: true,
    confirmButtonText: "Submit Entry",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
    allowOutsideClick: false,
    inputValidator: (value: string) => validateDeoName(value ?? ""),
  });
  return result.isConfirmed ? (result.value as string).trim() : null;
}

export async function confirmLogout(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "question",
    title: "Log out?",
    text: "You'll need to sign in again to continue.",
    showCancelButton: true,
    confirmButtonText: "Yes, Logout",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#1d4ed8",
  });
  return result.isConfirmed;
}

// Admin resetting a district: a confirm + reason prompt, same shape as the DEO's submit flow
// above (blocking, since this permanently wipes every entry the DEO has ever submitted for the
// district) — the reason is stored server-side in audit_log as why the reset happened. The
// wiped entries themselves are preserved in that same audit_log row's metadata (see PLAN.md),
// not truly destroyed, but the district's active ledger goes back to empty. Returns the trimmed
// reason, or null if the admin cancelled.
export async function promptResetReason(districtName: string): Promise<string | null> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: `Reset ${districtName} to baseline?`,
    html:
      "This permanently clears every recovery entry this district has ever submitted, back to " +
      "the originally uploaded baseline — the District Excise Officer will start fresh. This " +
      "cannot be undone from the app (the wiped entries are only preserved in the audit log). " +
      "Please record why this district is being reset." +
      '<br><br><span lang="hi">इससे इस जिले द्वारा अब तक सबमिट की गई सभी वसूली प्रविष्टियाँ स्थायी रूप ' +
      "से मिट जाएंगी और मूल अपलोड किए गए बेसलाइन पर वापस आ जाएंगी — जिला आबकारी अधिकारी को फिर से शुरू " +
      "करना होगा। यह ऐप से पूर्ववत नहीं किया जा सकता। कृपया दर्ज करें कि इस जिले को रीसेट क्यों किया जा " +
      "रहा है।</span>",
    input: "textarea",
    inputPlaceholder: "Reason for resetting (required)",
    showCancelButton: true,
    confirmButtonText: "Reset",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
    allowOutsideClick: false,
    inputValidator: (value: string) =>
      value && value.trim() ? undefined : "Please enter a reason for resetting. / कृपया रीसेट करने का कारण दर्ज करें।",
  });
  return result.isConfirmed ? (result.value as string).trim() : null;
}

// Clears only this component's in-memory React state, nothing server-side — no Dexie draft to
// restore (this domain's form has no multi-step draft, unlike the reference project's 5-year
// wizard). The form stays reachable after every submit (no lock), so this button is always live.
export async function confirmClearForm(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: "Clear this form?",
    html:
      "This will erase everything entered on this page. This cannot be undone." +
      '<br><br><span lang="hi">इससे इस पृष्ठ पर दर्ज किया गया सभी डेटा मिट जाएगा। यह पूर्ववत ' +
      "नहीं किया जा सकता।</span>",
    showCancelButton: true,
    confirmButtonText: "Yes, clear it",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}

// Before a DEO's reset request actually goes out — a blocking confirm since it notifies the
// Admin and can't be un-sent once submitted (only cancelled by the Admin resolving it).
export async function confirmResetRequest(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "question",
    title: "Submit reset request?",
    html:
      "This asks the Admin / Excise Headquarters to wipe every entry this district has ever " +
      "submitted, back to the uploaded baseline. You'll see the status here once it's approved " +
      "or denied." +
      '<br><br><span lang="hi">इससे एडमिन / आबकारी मुख्यालय से इस जिले द्वारा अब तक सबमिट की गई सभी ' +
      "प्रविष्टियों को मूल बेसलाइन पर वापस लाने का अनुरोध किया जाएगा। स्वीकृत या अस्वीकृत होने पर " +
      "स्थिति यहीं दिखाई देगी।</span>",
    showCancelButton: true,
    confirmButtonText: "Yes, submit request",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#1d4ed8",
  });
  return result.isConfirmed;
}

// Same "blocking confirm before an irreversible/session-ending action" pattern as
// confirmClearForm()/confirmResetRequest() above — add/edit go through AdminUserDrawer instead
// (ported from the sibling excise-revenue-recovery-portal), a routine form action, not a
// SweetAlert2 popup, per CLAUDE.md's "don't add a new blocking modal for a routine validation
// message" UI convention. Delete is the one irreversible step here, so it stays a Swal confirm.
export async function confirmDeleteAdmin(name: string): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: `Remove ${name} as admin?`,
    text: "They will immediately lose admin access. This cannot be undone.",
    showCancelButton: true,
    confirmButtonText: "Yes, Remove",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}

export async function confirmTruncateDemo(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: "Truncate Demo Data?",
    html:
      "This will permanently delete the Demo District from the database. " +
      "This action cannot be undone.",
    showCancelButton: true,
    confirmButtonText: "Yes, Delete it!",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}

// Fire-and-forget corner toast for auth transitions (login/logout) and generic validation
// errors that aren't tied to one specific field (e.g. "a field is blank" — could be any of
// six). Not awaited by callers — its DOM node attaches to <body>, outside the React tree, so
// it survives the client-side route change that typically follows (e.g. logout redirecting
// to /login). Field-specific errors stay inline under the field instead — see YearStepForm.tsx.
export function notifyToast(opts: { icon: "success" | "info" | "error"; title: string; text?: string }) {
  // Wider on desktop (bilingual validation text like "Field left blank" was wrapping to several
  // lines in the default ~300px toast, eating vertical space) and near-full-width on mobile
  // instead of a cramped corner box. showCloseButton adds a manual ✕ alongside the existing
  // auto-dismiss timer — closing early no longer requires waiting it out.
  window.Swal.fire({
    toast: true,
    position: "top-end",
    icon: opts.icon,
    title: opts.title,
    text: opts.text,
    showConfirmButton: false,
    showCloseButton: true,
    timer: opts.text ? 4500 : 2000,
    timerProgressBar: true,
    width: window.innerWidth < 640 ? "94vw" : "28rem",
  });
}
