"use client";

import { useEffect, useState } from "react";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";

export type AdminUserRow = {
  id: number;
  email: string | null;
  name: string | null;
  designation: string | null;
  createdAt: string;
  isOwner: boolean;
};

type FormState = { name: string; email: string; designation: string };

// Slide-in-from-the-right panel, ported from the sibling excise-revenue-recovery-portal's
// AdminUserDrawer (same "backdrop click / Escape / animate translate-x" shape) — this project's
// own Button/Banner components, no other changes needed. Shared between create and edit (pass
// `user: null` for create), since the form fields are identical either way.
export default function AdminUserDrawer({
  user,
  saving,
  error,
  onClose,
  onSave,
}: {
  user: AdminUserRow | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (form: FormState) => void;
}) {
  const isCreate = user === null;
  const [form, setForm] = useState<FormState>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    designation: user?.designation ?? "",
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 200ms matches the panel's own transition-duration below, so the backdrop/panel have
  // finished animating out before the parent unmounts this component.
  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const emailLocked = !isCreate && user.isOwner;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />
      <div
        className={`relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-200 ease-out dark:bg-slate-900 ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {isCreate ? "New Admin Account" : "Edit Admin Account"}
            </p>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {isCreate ? "Add a user" : (user.name ?? user.email)}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <i className="ti ti-x text-lg" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && <Banner variant="error">{error}</Banner>}

          {emailLocked && (
            <Banner variant="success">
              This is the owner account. Its sign-in email is fixed by server configuration —
              only name and designation can be changed here.
            </Banner>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Full Name {isCreate && <span className="text-red-600">*</span>}
            </label>
            <input
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. Anjali Verma"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Email {isCreate && <span className="text-red-600">*</span>}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={set("email")}
              disabled={emailLocked}
              placeholder="officer@up-excise.gov.in"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              style={emailLocked ? { cursor: "not-allowed" } : undefined}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Designation <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              value={form.designation}
              onChange={set("designation")}
              placeholder="e.g. Excise Commissioner"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {isCreate && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No email is sent automatically. Share the login link with this person — they sign
              in via magic link sent to the email above.
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <Button size="sm" className="flex-1" disabled={saving} onClick={() => onSave(form)}>
            {saving ? "Saving..." : isCreate ? "Create Account" : "Save Changes"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
