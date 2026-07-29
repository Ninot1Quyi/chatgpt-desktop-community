// Generic drag-to-reorder list with FLIP sliding animation: rows slide aside
// as you drag over them, and dropping commits the previewed order.
//
// The insertion slot is computed from the cursor Y against the *untransformed*
// list container — doing it per-row reads transformed rects and feeds back
// into itself (rows ping-pong); the container rect is stable.
import React, { useState } from "react";
import { cx } from "../lib/cx.js";
import { LucideIcon } from "./icons.jsx";

const ROW_H = 40; // h-10, fixed so translateY math lines up

// items: [{ id, label, icon? }] — onChange(nextIds: string[])
export function SortableList({ items, onChange }) {
  const [dragId, setDragId] = useState(null);
  const [insertAt, setInsertAt] = useState(null); // slot among the other rows
  const ids = items.map((it) => it.id);

  const dragging = dragId != null && insertAt != null;
  const preview = dragging
    ? (() => {
        const rest = ids.filter((id) => id !== dragId);
        rest.splice(Math.max(0, Math.min(insertAt, rest.length)), 0, dragId);
        return rest;
      })()
    : ids;

  const onListDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const gap = Math.max(0, Math.min(ids.length, Math.round((e.clientY - rect.top) / ROW_H)));
    const from = ids.indexOf(dragId);
    setInsertAt(gap > from ? gap - 1 : gap);
  };

  const endDrag = (commit) => {
    if (commit && dragging && preview.join() !== ids.join()) onChange?.(preview);
    setDragId(null);
    setInsertAt(null);
  };

  return (
    <div onDragOver={onListDragOver} onDrop={(e) => { e.preventDefault(); endDrag(true); }}>
      {items.map((it) => {
        const shift = dragging ? preview.indexOf(it.id) - ids.indexOf(it.id) : 0;
        return (
          <div
            key={it.id}
            draggable
            onDragStart={(e) => { setDragId(it.id); setInsertAt(ids.indexOf(it.id)); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => endDrag(false)}
            style={{ transform: shift ? `translateY(${shift * ROW_H}px)` : undefined }}
            className={cx(
              "flex h-10 cursor-grab items-center gap-2.5 px-4 select-none active:cursor-grabbing",
              dragging && "transition-transform duration-150 ease-out",
              dragging && it.id === dragId && "opacity-30",
            )}
          >
            <LucideIcon name="GripVertical" size={14} className="shrink-0 text-(--fg-faint)" />
            {it.icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{it.icon}</span>}
            <span className="text-[13px]">{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}
