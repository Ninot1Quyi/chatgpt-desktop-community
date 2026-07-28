// Date grouping + formatting helpers for the thread list.

const DAY = 86400;

function startOfDay(ts) {
  const d = new Date(ts * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
}

// Returns a section label for a unix-second timestamp.
export function sectionLabel(ts) {
  const today = startOfDay(Date.now() / 1000);
  const day = startOfDay(ts);
  const diff = today - day;
  if (diff <= 0) return "Today";
  if (diff <= DAY) return "Yesterday";
  if (diff <= 7 * DAY) return "Previous 7 days";
  if (diff <= 30 * DAY) return "Previous 30 days";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export function shortTime(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  if (startOfDay(ts) === startOfDay(now.getTime() / 1000)) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Group sorted threads (desc) into labeled sections, preserving order.
export function groupThreads(threads, key = "updatedAt") {
  const groups = [];
  let current = null;
  for (const t of threads) {
    const label = sectionLabel(t[key] || t.updatedAt);
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(t);
  }
  return groups;
}

export function formatDuration(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m ${s % 60}s`;
  return `${m}m ${s % 60}s`;
}

export function basename(p) {
  if (!p) return "";
  const parts = p.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

const normalizedWindowsPath = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");

export function isAbsolutePath(p) {
  return /^(?:[A-Za-z]:[\\/]|\\\\)/.test(String(p || ""));
}

export function joinPath(base, child) {
  if (!base || isAbsolutePath(child)) return child || base || "";
  return `${String(base).replace(/[\\/]+$/, "")}\\${String(child || "").replace(/^[\\/]+/, "").replace(/\//g, "\\")}`;
}

export function isPathInside(path, root) {
  const value = normalizedWindowsPath(path).toLowerCase();
  const parent = normalizedWindowsPath(root).toLowerCase();
  return !!parent && (value === parent || value.startsWith(`${parent}/`));
}

export function relativePath(path, root) {
  if (!isPathInside(path, root)) return null;
  const value = normalizedWindowsPath(path);
  const parent = normalizedWindowsPath(root);
  return value.length === parent.length ? "" : value.slice(parent.length + 1);
}

export function shortenPath(p, home) {
  if (!p) return "";
  if (home && p.toLowerCase().startsWith(home.toLowerCase())) {
    return "%USERPROFILE%" + p.slice(home.length);
  }
  return p;
}
