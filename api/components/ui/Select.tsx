"use client";

// Omit the native `size` attribute (number of visible rows) — this component's own `size`
// prop is a padding variant, same idea as Button.tsx's, not the HTML attribute.
type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "sm" | "md";
};

// Kept as a size variant rather than a py-* className override, same reasoning as
// Button.tsx's SIZES: two conflicting padding utilities for the same property in one class
// list have unreliable precedence under the Tailwind CDN's JIT.
const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "py-1.5",
  // The FY filter's digit-heavy options ("FY 2021-22") were still getting cropped at the top
  // at py-2 — bumped again to py-2.5 rather than touching line-height on every dropdown.
  md: "py-2.5",
};

// Native <select> arrows vary in size/position across browsers and don't scale with the rest
// of the toolbar's icons — appearance-none plus our own Tabler chevron keeps every dropdown
// visually identical (and matching Button.tsx's forced icon sizing) instead of each browser's
// own bulky default arrow eating extra padding. One text-sm size for every admin dropdown —
// these used to mix text-xs (status/event filters) and text-sm (FY/rows-per-page filters)
// sitting side by side in the same toolbar row, which is what made them look mismatched.
export default function Select({ className = "", size = "sm", style, ...props }: Props) {
  return (
    <div className="relative inline-block">
      {/* min-w-[8rem]: with appearance-none + border-box (Tailwind's preflight), browsers'
          shrink-to-fit width for a bare <select> doesn't reliably leave room for our own pr-9
          padding — the option text can render right under the chevron icon instead of the
          box growing to fit both. A floor width sidesteps that instead of relying on the
          browser to size around our padding correctly. */}
      <select
        {...props}
        // globals.css forces `select { line-height: 1 }` app-wide (icon/label alignment fix —
        // see CLAUDE.md) via an unlayered rule that no Tailwind leading-* utility can outrank.
        // At line-height: 1, tall glyphs (Devanagari मात्राएँ, some digit renderings) visually
        // clip at the top regardless of how much vertical padding the size variants above add
        // — padding grows the box, it doesn't grow the text's own line box. An inline style is
        // the one thing with enough cascade precedence to beat that unlayered rule; callers can
        // still override it via their own `style` prop.
        style={{ lineHeight: "1.4", ...style }}
        className={`min-w-[8rem] appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-9 text-sm text-slate-700 shadow-sm outline-none hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 ${SIZES[size]} ${className}`}
      />
      <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400" />
    </div>
  );
}
