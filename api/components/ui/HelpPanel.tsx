"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  pageKey: string;
  title: string;
  children: React.ReactNode;
  // Optional Hindi translation of `children` — when provided, a small English/हिंदी toggle
  // appears next to the title and switches which one renders. Omit to keep a page's help
  // English-only (e.g. the Admin pages, which stay English-only chrome) — the toggle itself
  // only shows up where a translation actually exists.
  childrenHi?: React.ReactNode;
};

// A fixed round help button pinned bottom-right on every gated page (stays in place while
// the page scrolls) — never opens on its own, only when clicked. Opens upward-left since
// it sits at the bottom of the viewport. Two separate dismiss actions: the X just closes the
// balloon for now (the button stays, reopenable any time); "Don't show this again"
// additionally persists a per-page localStorage flag that clears the unread dot — it never
// hides or disables the button itself, so help stays reachable.
export default function HelpPanel({ pageKey, title, children, childrenHi }: Props) {
  const storageKey = `help_done_${pageKey}`;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384);
  const [panelMaxHeight, setPanelMaxHeight] = useState(320);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setDone(localStorage.getItem(storageKey) === "true");
    } catch {}
  }, [storageKey]);

  // Runs before paint: the button lives bottom-right, so the balloon always opens upward from
  // it — cap its width/height to whatever room is actually above the button so it only
  // scrolls internally if the display genuinely doesn't have room, not by default.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setPanelWidth(Math.min(384, window.innerWidth - 32));
    setPanelMaxHeight(Math.max(160, rect.top - 24));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function dismissForever() {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {}
    setDone(true);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="group fixed bottom-6 right-6 z-40">
      {!open && (
        <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          Help / Instructions
        </span>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help and instructions"}
        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 shadow-lg transition-colors hover:bg-blue-100 active:bg-blue-200 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900 dark:active:bg-blue-800"
      >
        <i className="ti ti-help-circle text-2xl" />
        {!done && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
      </button>

      {/* Anchored bottom-right, so it always opens upward and to the left of the button. */}
      {open && (
        <div
          role="region"
          aria-label={`Help: ${title}`}
          style={{ width: panelWidth, maxHeight: panelMaxHeight }}
          className="absolute bottom-full right-0 mb-3 flex flex-col space-y-3 rounded-lg border border-blue-100 bg-white p-4 shadow-2xl dark:border-blue-900 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">{title}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close help panel"
              className="shrink-0 rounded-md p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <i className="ti ti-x text-base" />
            </button>
          </div>

          {childrenHi && (
            <div className="flex shrink-0 rounded-md bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
                  lang === "en"
                    ? "bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang("hi")}
                lang="hi"
                className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
                  lang === "hi"
                    ? "bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                हिंदी
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm text-slate-700 dark:text-slate-300">
            {childrenHi && lang === "hi" ? <div lang="hi">{childrenHi}</div> : children}
          </div>

          {!done && (
            <button
              type="button"
              onClick={dismissForever}
              className="shrink-0 self-start rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              Don&apos;t show this again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
