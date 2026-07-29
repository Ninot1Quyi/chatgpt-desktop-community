// Shared building blocks for settings sections: card, row, toggle, dropdown,
// plus localStorage helpers for persisted prefs.
import React, { useRef, useState } from "react";
import { cx } from "@app/lib/cx.js";
import { Menu } from "@app/components/ui.jsx";
import { IconChevronDown } from "@app/components/icons.jsx";

export const lsGet = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
export const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export function Card({ title, children }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-2 px-1 text-[13px] font-medium text-(--fg-secondary)">{title}</h2>}
      <div className="divide-y divide-(--border-light) rounded-2xl border border-(--border-light) bg-(--surface-under)">
        {children}
      </div>
    </section>
  );
}

export function Row({ title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[13px]">{title}</div>
        {desc && <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-(--fg-tertiary)">{desc}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      onClick={() => onChange?.(!on)}
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150",
        on ? "bg-(--accent)" : "bg-(--surface-active)"
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150",
          on && "translate-x-4"
        )}
      />
    </button>
  );
}

export function Dropdown({ value, options, onChange, disabled }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <>
      <button
        ref={btnRef}
        className={cx(
          "flex h-7 items-center gap-1.5 rounded-lg border border-(--border-light) bg-(--surface) px-2.5 text-[12px] text-(--fg-secondary)",
          disabled ? "cursor-default opacity-50" : "hover:bg-(--surface-hover)"
        )}
        onClick={() => !disabled && setOpen(!open)}
      >
        {current?.label}
        <IconChevronDown size={12} className="text-(--fg-tertiary)" />
      </button>
      <Menu
        open={open}
        anchor={() => btnRef.current?.getBoundingClientRect()}
        onClose={() => setOpen(false)}
        align="end"
        items={options.map((o) => ({
          id: o.id,
          label: o.label,
          checked: o.id === value,
          onSelect: () => onChange(o.id),
        }))}
      />
    </>
  );
}

// Segmented two-or-more option control (e.g. Bottom | Right).
export function Segmented({ value, options, onChange }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-(--border-light) bg-(--surface) p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          className={cx(
            "rounded-md px-2.5 py-1 text-[12px]",
            value === id ? "bg-(--surface-active) font-medium" : "text-(--fg-secondary) hover:text-(--fg)"
          )}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Small secondary button used across settings rows.
export function Btn({ children, onClick, danger, disabled }) {
  return (
    <button
      className={cx(
        "rounded-lg border px-3 py-1.5 text-[13px]",
        danger
          ? "border-(--danger) text-(--danger) hover:bg-(--danger-soft)"
          : "border-(--border) hover:bg-(--surface-hover)",
        disabled && "cursor-default opacity-50"
      )}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}
