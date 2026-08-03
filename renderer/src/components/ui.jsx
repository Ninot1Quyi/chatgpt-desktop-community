// Generic UI primitives: dropdown menu, popover, modal dialog, toasts.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/cx.js";
import { cssPixelsToRem, rem } from "../lib/cssUnits.js";
import { useStore } from "../store.js";
import { useT } from "../i18n.jsx";
import { IconX } from "./icons.jsx";

export function ActivityDisclosure({ open, children }) {
  const ref = useRef(null);
  const frame = useRef(null);
  const timer = useRef(null);
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!rendered || !element) return undefined;

    cancelAnimationFrame(frame.current);
    clearTimeout(timer.current);

    const duration = 300;
    const easing = "cubic-bezier(0.19, 1, 0.22, 1)";
    element.style.transition = `height ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
    element.style.overflow = "hidden";
    element.style.pointerEvents = open ? "auto" : "none";

    if (open) {
      element.style.height = "0rem";
      element.style.opacity = "0";
      frame.current = requestAnimationFrame(() => {
        element.style.height = `${element.scrollHeight}px`;
        element.style.opacity = "1";
      });
      timer.current = setTimeout(() => {
        if (!ref.current) return;
        ref.current.style.height = "auto";
        ref.current.style.overflow = "visible";
      }, duration);
    } else {
      element.style.height = `${element.getBoundingClientRect().height}px`;
      element.style.opacity = "1";
      frame.current = requestAnimationFrame(() => {
        element.style.height = "0rem";
        element.style.opacity = "0";
      });
      timer.current = setTimeout(() => setRendered(false), duration);
    }

    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(timer.current);
    };
  }, [open, rendered]);

  if (!rendered) return null;
  return (
    <div ref={ref} aria-hidden={!open}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu: anchored dropdown. `anchor` = getter returning DOM rect of trigger.
// items: [{id, label, hint?, icon?, danger?, checked?, onSelect} | {sep:true}]
// ---------------------------------------------------------------------------
export function Menu({ open, anchor, items, onClose, width = 220, align = "start" }) {
  const t = useT();
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
        return height + (item.tall ? 56 : 28.57);
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
      className="popover-in fixed z-50 overflow-hidden rounded-[0.9375rem] p-1 backdrop-blur-sm"
      style={{
        left: cssPixelsToRem(pos.left),
        top: cssPixelsToRem(pos.top),
        width: rem(width),
        background: "color-mix(in srgb, var(--surface-raised) 90%, transparent)",
        boxShadow: "rgba(26, 28, 31, 0.08) 0 0 0 0.03125rem, rgba(26, 28, 31, 0.08) 0 0 0 0.03125rem, rgba(0, 0, 0, 0.12) 0 0.5rem 1rem -0.25rem",
      }}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="my-1 h-[0.0625rem] bg-(--border-light)" />
        ) : it.header ? (
          <div key={i} className="px-3 pt-2 pb-1 text-xs font-medium text-(--fg-tertiary)">{t(it.header)}</div>
        ) : it.children ? (
          <button
            key={it.id ?? i}
            role="menuitem"
            disabled={it.disabled}
            onClick={(e) => openSub(it, e)}
            onMouseEnter={(e) => openSub(it, e)}
            onMouseLeave={closeSubSoon}
            className={cx(
              "flex w-full items-center gap-2 rounded-[0.78125rem] px-2 text-left text-[0.8125rem] leading-[1.160625rem] font-normal outline-none",
              it.tall ? "min-h-14 py-2" : "h-[1.785625rem]",
              it.danger ? "text-(--danger)" : "text-(--fg)",
              it.disabled ? "opacity-40" : "hover:bg-(--surface-hover)"
            )}
            >
              {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
            <span className={cx("min-w-0 flex-1", !it.tall && "truncate")}>{t(it.label)}</span>
          </button>
        ) : (
          <button
            key={it.id ?? i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { it.onSelect?.(); if (!it.keepOpen) onClose(); }}
            onMouseEnter={closeSubSoon}
            className={cx(
              "flex w-full items-center gap-2 rounded-[0.78125rem] px-2 text-left text-[0.8125rem] leading-[1.160625rem] font-normal outline-none",
              it.tall ? "min-h-14 py-2" : "h-[1.785625rem]",
              it.danger ? "text-(--danger)" : "text-(--fg)",
              it.disabled ? "opacity-40" : "hover:bg-(--surface-hover)"
            )}
            >
              {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
            <span className={cx("min-w-0 flex-1", !it.tall && "truncate")}>{t(it.label)}</span>
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
  const t = useT();
  const width = 210;
  const left = rect.right + 2 + width > window.innerWidth - 8 ? rect.left - width - 2 : rect.right + 2;
  const top = Math.max(8, Math.min(rect.top - 4, window.innerHeight - items.length * 32 - 16));
  return (
    <div
      role="menu"
      className="popover-in fixed z-50 overflow-hidden rounded-[0.9375rem] p-1 backdrop-blur-xl"
      style={{
        left: cssPixelsToRem(left),
        top: cssPixelsToRem(top),
        width: rem(width),
        background: "color-mix(in srgb, var(--surface-raised) 90%, transparent)",
        boxShadow: "rgba(26, 28, 31, 0.08) 0 0 0 0.03125rem, rgba(26, 28, 31, 0.08) 0 0 0 0.03125rem, rgba(0, 0, 0, 0.12) 0 0.5rem 1rem -0.25rem",
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="my-1 h-[0.0625rem] bg-(--border-light)" />
        ) : (
          <button
            key={it.id ?? i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { it.onSelect?.(); onClose(); }}
            className={cx(
              "flex h-[1.785625rem] w-full items-center gap-2 rounded-[0.78125rem] px-2 text-left text-[0.8125rem] leading-[1.160625rem] font-normal outline-none",
              it.danger ? "text-(--danger)" : "text-(--fg)",
              it.disabled ? "opacity-40" : "hover:bg-(--surface-hover)"
            )}
          >
            {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{t(it.label)}</span>
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
  const t = useT();
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
        style={{
          width: rem(width),
          maxWidth: "calc(100vw - 2rem)",
          boxShadow: "var(--shadow-menu)",
        }}
      >
        {title && <div className="mb-3 text-[0.9375rem] font-semibold">{t(title)}</div>}
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
  const translateText = useT();
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return createPortal(
    <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "fade-in flex items-center gap-3 rounded-xl border px-4 py-2.5 text-[0.8125rem]",
            "border-(--border) bg-(--surface-raised)",
            t.kind === "error" && "border-(--danger) text-(--danger)",
            t.kind === "warn" && "border-(--warning) text-(--warning)"
          )}
          style={{ boxShadow: "var(--shadow-menu)" }}
        >
          <span className="max-w-[26.25rem] truncate">{translateText(t.message)}</span>
          {t.action && (
            <button
              className="shrink-0 font-medium text-(--accent) hover:underline"
              onClick={() => { t.action.onClick?.(); dismiss(t.id); }}
            >
              {translateText(t.action.label)}
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
  const t = useT();
  const localizedButtonProps = {
    ...buttonProps,
    ...(buttonProps["aria-label"]
      ? { "aria-label": t(buttonProps["aria-label"]) }
      : {}),
  };
  return (
    <button
      {...localizedButtonProps}
      title={t(title)}
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
    <svg className={cx("animate-spin", className)} width={rem(size)} height={rem(size)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
