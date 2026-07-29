import { create } from "zustand";
import { useStore } from "@app/store.js";
import { panelHook } from "@app/lib/panelHook.js";
import { setFilePreviewHandler } from "./panel/bus.js";

const VALID_KINDS = new Set([
  "review",
  "terminal",
  "browser",
  "files",
  "sidechat",
]);
const SINGLETON_KINDS = new Set(["review", "browser", "sidechat"]);

let tabSequence = 1;

function loadPanelState() {
  try {
    const value = JSON.parse(localStorage.getItem("panel.tabs.v2"));
    if (value && Array.isArray(value.tabs)) {
      const tabs = value.tabs.filter((tab) => VALID_KINDS.has(tab.kind));
      if (tabs.length) {
        tabSequence = tabs.reduce(
          (maximum, tab) => Math.max(maximum, Number(tab.id) || 0),
          0,
        ) + 1;
        return {
          tabs,
          activeId: tabs.some((tab) => tab.id === value.activeId)
            ? value.activeId
            : tabs[0].id,
        };
      }
    }
  } catch {}
  return { tabs: [], activeId: null };
}

export const usePanelStore = create((set, get) => ({
  ...loadPanelState(),

  _save() {
    const { tabs, activeId } = get();
    try {
      localStorage.setItem("panel.tabs.v2", JSON.stringify({ tabs, activeId }));
    } catch {}
  },

  open(kind, options = {}) {
    if (!VALID_KINDS.has(kind)) return null;
    const { tabs } = get();
    if (SINGLETON_KINDS.has(kind)) {
      const existing = tabs.find((tab) => tab.kind === kind);
      if (existing) {
        set({ activeId: existing.id });
        get()._save();
        return existing.id;
      }
    }
    const id = tabSequence++;
    const tab = { id, kind };
    if (kind === "files" && options.filePath) tab.filePath = options.filePath;
    set({ tabs: [...tabs, tab], activeId: id });
    get()._save();
    useStore.getState().setUi({ rightOpen: true });
    return id;
  },

  close(id) {
    const { tabs, activeId } = get();
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const next = tabs.filter((tab) => tab.id !== id);
    const patch = { tabs: next };
    if (activeId === id) {
      patch.activeId = next.length
        ? next[Math.max(0, index - 1)].id
        : null;
    }
    set(patch);
    get()._save();
    if (!next.length) {
      useStore.getState().setUi({ rightOpen: false, rightExpanded: false });
    }
  },

  activate(id) {
    if (!get().tabs.some((tab) => tab.id === id)) return;
    set({ activeId: id });
    get()._save();
  },

  setFile(id, filePath) {
    set({
      tabs: get().tabs.map((tab) => (
        tab.id === id ? { ...tab, filePath } : tab
      )),
    });
    get()._save();
  },

  move(id, targetId) {
    const current = get().tabs;
    const moving = current.find((tab) => tab.id === id);
    if (!moving || id === targetId) return;
    const rest = current.filter((tab) => tab.id !== id);
    let index = targetId == null
      ? rest.length
      : rest.findIndex((tab) => tab.id === targetId);
    if (index < 0) index = rest.length;
    const next = [
      ...rest.slice(0, index),
      moving,
      ...rest.slice(index),
    ];
    if (next.every((tab, position) => tab.id === current[position]?.id)) return;
    set({ tabs: next });
    get()._save();
  },
}));

export function openFileInPanel(absolutePath) {
  const state = usePanelStore.getState();
  const fileTabs = state.tabs.filter((tab) => tab.kind === "files");
  let id;
  if (fileTabs.length === 1) {
    id = fileTabs[0].id;
    state.setFile(id, absolutePath);
    state.activate(id);
    useStore.getState().setUi({ rightOpen: true });
  } else {
    id = state.open("files", { filePath: absolutePath });
  }
  return id;
}

setFilePreviewHandler(openFileInPanel);
panelHook.open = (kind) => usePanelStore.getState().open(kind);
