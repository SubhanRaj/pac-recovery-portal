"use client";

import { useEffect, useState } from "react";
import { resolveInitialTheme, setStoredTheme, applyTheme, type Theme } from "@/lib/theme";

// Reflects whatever the blocking inline script in layout.tsx already applied on load (reading
// resolveInitialTheme() again here just syncs this button's icon — it doesn't re-apply the
// class, since that already happened before paint).
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(resolveInitialTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setStoredTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      <i className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"} text-base`} />
    </button>
  );
}
