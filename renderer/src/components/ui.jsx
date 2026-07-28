// Generic UI primitives: dropdown menu, popover, modal dialog, toasts.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/cx.js";
import { useStore } from "../store.js";
import { IconX } from "./icons.jsx";

export function ActivityDisclosure({ open, children }) {
  return open ? <div>{children}</div> : null;
}

// ---------------------------------------------------------------------------
// Menu: anchored dropdown. `anchor` = getter returning DOM rect of trigger.
// items: [{id, label, hint?, icon?, danger?, checked?, onSelect} | {sep:true}]
// ---------------------------------------------------------------------------
export function Menu({ open, anchor, items, onClose, width = 220, align = "start" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [sub, setSub] = useState(null); // { id, rect }
  const subTimer = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const r = anchor?.();
    if (!r) return;
    const menuW = width;
    let left = (align === "end" ? r.right - menuW : r.left) + 1;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    let top = r.bottom + 1;
    const estH = Math.min(
      420,
      items.reduce((height, item) => {
        if (item.sep) return height + 9;
        if (item.header) return height + 31;
        return height + 28.57;
      }, 8),
    );
    if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 1);
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) setSub(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openSub = (it, e) => {
    clearTimeout(subTimer.current);
    setSub({ id: it.id, rect: e.currentTarget.getBoundingClientRect(), items: it.children });
  };
  const closeSubSoon = () => {
    clearTimeout(subTimer.current);
    subTimer.current = setTimeout(() => setSub(null), 180);
  };
  const staySub = () => clearTimeout(subTimer.current);

  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="popover-in fixed z-50 overflow-hidden rounded-[15px] p-1 backdrop-blur-sm"
      style={{
        left: pos.left,
        top: pos.top,
        width,
        background: "color-mix(in srgb, var(--surface-raised) 90%, transparent)",
        boxShadow: "rgba(26, 28, 31, 0.08) 0 0 0 0.5px, rgba(26, 28, 31, 0.08) 0 0 0 0.5px, rgba(0, 0, 0, 0.12) 0 8px 16px -4px",
      }}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="my-1 h-px bg-(--border-light)" />
        ) : it.header ? (
          <div key={i} className="px-3 pt-2 pb-1 text-xs font-medium text-(--fg-tertiary)">{it.header}</div>
        ) : it.children ? (
          <button
            key={it.id ?? i}
            role="menuitem"
            disabled={it.disabled}
            onClick={(e) => openSub(it, e)}
            onMouseEnter={(e) => openSub(it, e)}
            onMouseLeave={closeSubSoon}
            className={cx(
              "flex h-[28.57px] w-full items-center gap-2 rounded-[12.5px] px-2 text-left text-[13px] leading-[18.57px] font-normal outline-none",
              it.danger ? "text-(--danger)" : "text-(--fg)",
              it.disabled ? "opacity-40" : "hover:bg-(--surface-hover)"
            )}
          >
            {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
          </button>
        ) : (
          <button
            key={it.id ?? i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { it.onSelect?.(); if (!it.keepOpen) onClose(); }}
            onMouseEnter={closeSubSoon}
            className={cx(
              "flex h-[28.57px] w-full items-center gap-2 rounded-[12.5px] px-2 text-left text-[13px] leading-[18.57px] font-normal outline-none",
              it.danger ? "text-(--danger)" : "text-(--fg)",
              it.disabled ? "opacity-40" : "hover:bg-(--surface-hover)"
            )}
          >
            {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.hint && <span className="shrink-0 text-xs text-(--fg-tertiary)">{it.hint}</span>}
            {it.checked && <span className="shrink-0 text-(--accent)">✓</span>}
          </button>
        )
      )}
      {sub && (
        <SubMenu rect={sub.rect} items={sub.items} onClose={onClose} onEnter={staySub} onLeave={closeSubSoon} />
      )}
    </div>,
    document.body
  );
}

// Nested flyout for `children` items, opening to the side of its parent row.
function SubMenu({ rect, items, onClose, onEnter, onLeave }) {
  const width = 210;
  const left = rect.right + 2 + width > window.innerWidth - 8 ? rect.left - width - 2 : rect.right + 2;
  const top = Math.max(8, Math.min(rect.top - 4, window.innerHeight - items.length * 32 - 16));
  return (
    <div
      role="menu"
      className="popover-in fixed z-50 overflow-hidden rounded-[15px] p-1 backdrop-blur-xl"
      style={{
        left,
        top,
        width,
        background: "color-mix(in srgb, var(--surface-raised) 90%, transparent)",
        boxShadow: "rgba(26, 28, 31, 0.08) 0 0 0 0.5px, rgba(26, 28, 31, 0.08) 0 0 0 0.5px, rgba(0, 0, 0, 0.12) 0 8px 16px -4px",
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="my-1 h-px bg-(--border-light)" />
        ) : (
          <button
            key={it.id ?? i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { it.onSelect?.(); onClose(); }}
            className={cx(
              "flex h-[28.57px] w-full items-center gap-2 rounded-[12.5px] px-2 text-left text-[13px] leading-[18.57px] font-normal outline-none",
              it.danger ? "text-(--danger)" : "text-(--fg)",
              it.disabled ? "opacity-40" : "hover:bg-(--surface-hover)"
            )}
          >
            {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.hint && <span className="shrink-0 text-xs text-(--fg-tertiary)">{it.hint}</span>}
            {it.checked && <span className="shrink-0 text-(--accent)">✓</span>}
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
export function Dialog({ open, title, children, onClose, width = 420 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="fade-in rounded-2xl border border-(--border) bg-(--surface-raised) p-5"
        style={{ width, boxShadow: "var(--shadow-menu)" }}
      >
        {title && <div className="mb-3 text-[15px] font-semibold">{title}</div>}
        {children}
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return createPortal(
    <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "fade-in flex items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px]",
            "border-(--border) bg-(--surface-raised)",
            t.kind === "error" && "border-(--danger) text-(--danger)",
            t.kind === "warn" && "border-(--warning) text-(--warning)"
          )}
          style={{ boxShadow: "var(--shadow-menu)" }}
        >
          <span className="max-w-[420px] truncate">{t.message}</span>
          {t.action && (
            <button
              className="shrink-0 font-medium text-(--accent) hover:underline"
              onClick={() => { t.action.onClick?.(); dismiss(t.id); }}
            >
              {t.action.label}
            </button>
          )}
          <button className="shrink-0 opacity-50 hover:opacity-100" onClick={() => dismiss(t.id)}>
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------
export function IconButton({ icon, title, onClick, active, danger, className, size = 15, disabled, ...buttonProps }) {
  return (
    <button
      {...buttonProps}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "app-no-drag flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
        active ? "bg-(--surface-active) text-(--fg)" : "text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)",
        danger && "hover:text-(--danger)",
        disabled && "opacity-40 pointer-events-none",
        className
      )}
    >
      {React.cloneElement(icon, { size })}
    </button>
  );
}

export function Spinner({ size = 14, className }) {
  return (
    <svg className={cx("animate-spin", className)} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
