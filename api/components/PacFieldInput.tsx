"use client";

import Cleave from "cleave.js/react";

type CleaveChangeEvent = React.ChangeEvent<HTMLInputElement> & { target: { rawValue: string } };

type Props = {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  money: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  // Bilingual, shown only once the field has been blurred — see CLAUDE.md's UI conventions
  // ("Feedback": field-specific errors render inline under the field, bold, after blur).
  error?: string;
};

// Indian numeral grouping (Lakh/Crore) with a ₹ prefix for money fields, via Cleave.js —
// native `numeralThousandsGroupStyle: "lakh"` support, no custom formatting logic needed.
export default function PacFieldInput({ label, value, onChange, money, disabled, onBlur, error }: Props) {
  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900 dark:disabled:bg-slate-800";

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {money ? (
        <Cleave
          value={value}
          disabled={disabled}
          onBlur={onBlur}
          options={{
            numeral: true,
            numeralThousandsGroupStyle: "lakh",
            numeralDecimalScale: 2,
            prefix: "₹",
            rawValueTrimPrefix: true,
          }}
          onChange={(e: CleaveChangeEvent) => onChange(e.target.rawValue)}
          className={inputClass}
        />
      ) : (
        <Cleave
          value={value}
          disabled={disabled}
          onBlur={onBlur}
          options={{ numeral: true, numeralThousandsGroupStyle: "lakh", numeralDecimalScale: 0 }}
          onChange={(e: CleaveChangeEvent) => onChange(e.target.rawValue)}
          className={inputClass}
        />
      )}
      {error ? <span className="mt-1 block text-xs font-bold text-red-600 dark:text-red-400">{error}</span> : null}
    </label>
  );
}
