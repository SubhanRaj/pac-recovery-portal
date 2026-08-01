"use client";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark" | "danger" | "dangerSoft" | "blue" | "amber";
  size?: "xs" | "sm" | "md" | "lg";
};

const VARIANTS: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-500",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300 " +
    "dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800",
  // For serious-but-not-alarming actions (e.g. the final lock) — conveys gravity without the
  // "something is wrong" connotation a red button carries.
  dark: "bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 focus-visible:ring-slate-400 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300",
  // Soft-tinted variants for secondary toolbar actions that still deserve some color (e.g. the
  // DEO template download/upload buttons) — less flat than `secondary`'s plain gray outline,
  // without competing with `primary` for visual weight.
  blue: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 focus-visible:ring-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900 dark:hover:bg-blue-900",
  amber:
    "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 focus-visible:ring-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-900",
  // Same soft-tint pattern as blue/amber above, for destructive-but-frequent toolbar actions
  // (the DEO "Clear"/"Clear All" buttons) where a solid `danger` red reads as too heavy/alarming
  // sitting next to slim pill nav buttons — the confirm popup already carries the warning
  // weight, so the button itself doesn't need to shout.
  dangerSoft:
    "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 focus-visible:ring-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-900 dark:hover:bg-red-900",
};

// Kept out of the base class string and off the `className` override path deliberately —
// two conflicting Tailwind utilities for the same CSS property (e.g. `py-2.5` from here and
// a `py-4` passed via `className`) both landing in one class list has unreliable precedence,
// since the Tailwind CDN's JIT scans the whole document rather than respecting className
// prop order. A `size` variant avoids ever having two padding/text-size utilities in play.
//
// Radius and shadow are set per-size for specificity but remain consistent across the board.
// We use a uniform `rounded-md` and balanced padding for a sleek, consistent look that
// perfectly matches our updated toolbar dropdowns. Icon scaling is globally forced via
// `[&_i.ti]:!text-[1.25em]` on the button base to ensure crisp, distinguishable icons.
const SIZES: Record<NonNullable<Props["size"]>, string> = {
  xs: "px-3 py-1.5 text-xs gap-1.5 rounded-md font-medium shadow-sm",
  sm: "px-4 py-2 text-sm gap-2 rounded-md font-medium shadow-sm",
  md: "px-5 py-2.5 text-sm gap-2 rounded-md font-semibold shadow-sm",
  lg: "px-6 py-3 text-base gap-2 rounded-md font-semibold shadow-sm",
};

export default function Button({ variant = "primary", size = "md", className = "", disabled, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      // ponytail: Tailwind's preflight sets `button { cursor: pointer }` unconditionally in
      // this version, which beats the disabled:cursor-not-allowed utility — so the cursor is
      // set directly from the disabled prop instead of relying on the :disabled variant.
      style={disabled ? { cursor: "not-allowed" } : undefined}
      // flex-row + whitespace-nowrap spelled out explicitly (not left to inline-flex's
      // default) so icon+label can never wrap onto separate lines regardless of button width.
      // [&_i.ti]:!text-[1.25em] forces Tabler icons to always be 25% larger than the button's text size.
      className={`inline-flex flex-row flex-nowrap items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 [&_i.ti]:!text-[1.25em] ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    />
  );
}
