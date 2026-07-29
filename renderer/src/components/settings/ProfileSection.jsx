// Profile: identity header, lifetime usage stats, token activity chart and
// activity insights — all from the app-server where available.
import React, { useEffect, useMemo, useState } from "react";
import * as api from "../../api.js";
import { useStore, planLabel } from "../../store.js";
import { cx } from "../../lib/cx.js";
import { Card, Segmented } from "./shared.jsx";
import { Spinner } from "../ui.jsx";

function fmtTokens(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(sec)}s`;
}

export default function ProfileSection() {
  const profile = useStore((s) => s.profile);
  const account = useStore((s) => s.account);
  const home = useStore((s) => s.appInfo?.home) || "";
  const [usage, setUsage] = useState(null);
  const [skillsCount, setSkillsCount] = useState(null);
  const [chatCount, setChatCount] = useState(null);
  const [topReasoning, setTopReasoning] = useState(null);
  const [mode, setMode] = useState("daily");

  useEffect(() => {
    let live = true;
    api.rpc("account/usage/read", {}).then((r) => live && setUsage(r)).catch(() => {});
    api
      .rpc("skills/list", {})
      .then((r) => {
        if (!live) return;
        // Response is grouped by cwd: [{cwd, skills:[...]}] — sum, deduped by name.
        const groups = r?.skills || r?.data || (Array.isArray(r) ? r : []);
        const names = new Set();
        for (const g of groups) {
          for (const s of g?.skills || []) names.add(s.interface?.displayName || s.name || s.path);
        }
        setSkillsCount(names.size || groups.length);
      })
      .catch(() => {});
    // Exact total from the shared threads db (same store the reference app reads).
    api
      .rpc("command/exec", { command: ["sqlite3", `${home}/.codex/state_5.sqlite`, "SELECT COUNT(*) FROM threads"], timeoutMs: 8000 })
      .then((r) => {
        if (!live) return;
        const n = parseInt(String(r?.stdout ?? "").trim(), 10);
        if (Number.isFinite(n)) setChatCount(n.toLocaleString());
      })
      .catch(() => {
        api.rpc("thread/list", { limit: 100, sortKey: "updated_at", sortDirection: "desc" })
          .then((r) => live && setChatCount(r?.nextCursor ? "100+" : String((r?.data || []).length)))
          .catch(() => {});
      });
    // Dominant reasoning effort across threads, like the reference insight.
    api
      .rpc("command/exec", {
        command: ["sqlite3", "-separator", "|", `${home}/.codex/state_5.sqlite`, "SELECT reasoning_effort, COUNT(*) FROM threads WHERE reasoning_effort != '' GROUP BY reasoning_effort ORDER BY COUNT(*) DESC LIMIT 1; SELECT COUNT(*) FROM threads WHERE reasoning_effort != ''"],
        timeoutMs: 8000,
      })
      .then((r) => {
        if (!live) return;
        const lines = String(r?.stdout ?? "").trim().split("\n").filter(Boolean);
        const [eff, cnt] = (lines[0] || "").split("|");
        const total = parseInt(lines[1] || "0", 10);
        const c = parseInt(cnt || "0", 10);
        if (eff && total > 0) {
          const label = { low: "Light", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max", none: "None", minimal: "Minimal" }[eff] || eff;
          setTopReasoning(`${label} · ${Math.round((100 * c) / total)}%`);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const summary = usage?.summary || {};
  const plan = planLabel(account?.planType);

  // Last ~12 months, aggregated from the daily buckets.
  const months = useMemo(() => {
    const buckets = usage?.dailyUsageBuckets || [];
    const byMonth = new Map();
    for (const b of buckets) {
      const d = new Date(b.startDate || b.date || b.day);
      if (isNaN(d)) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) || 0) + (b.tokens || 0));
    }
    const out = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ key, label: d.toLocaleString("en", { month: "short" }), tokens: byMonth.get(key) || 0 });
    }
    // Chart series per mode: monthly totals, weekly average, or cumulative.
    let run = 0;
    return out.map((m) => {
      run += m.tokens;
      const value = mode === "cumulative" ? run : mode === "weekly" ? m.tokens / 4.3 : m.tokens;
      return { ...m, value };
    });
  }, [usage, mode]);

  const maxVal = Math.max(1, ...months.map((m) => m.value));

  const stats = [
    [fmtTokens(summary.lifetimeTokens), "Lifetime tokens"],
    [fmtTokens(summary.peakDailyTokens), "Peak tokens"],
    [fmtDuration(summary.longestRunningTurnSec), "Longest chat"],
    [summary.currentStreakDays != null ? `${summary.currentStreakDays} days` : "—", "Current streak"],
    [summary.longestStreakDays != null ? `${summary.longestStreakDays} days` : "—", "Longest streak"],
  ];

  return (
    <>
      {/* identity header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--surface-active) text-[16px] font-medium">
          {profile?.photo ? (
            <img src={profile.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            (profile?.name || "?").slice(0, 1)
          )}
        </div>
        <div className="flex items-baseline gap-1.5 text-[15px]">
          <span className="font-medium">{profile?.name || "—"}</span>
          {profile?.username && <span className="text-(--fg-tertiary)">@{profile.username}</span>}
          {plan && (
            <>
              <span className="text-(--fg-faint)">·</span>
              <span className="text-(--fg-secondary) capitalize">{plan}</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            className="flex h-7 items-center rounded-lg border border-(--border) px-2.5 text-[12px] hover:bg-(--surface-hover)"
            onClick={() => {
              navigator.clipboard?.writeText(`https://chatgpt.com/u/${profile?.username || ""}`).catch(() => {});
              useStore.getState().toast("Profile link copied");
            }}
          >
            Share
          </button>
          <button
            className="flex h-7 items-center rounded-lg border border-(--border) px-2.5 text-[12px] hover:bg-(--surface-hover)"
            onClick={() => useStore.getState().toast("Profile is private", "info")}
          >
            Private
          </button>
          <button
            className="flex h-7 items-center rounded-lg border border-(--border) px-2.5 text-[12px] hover:bg-(--surface-hover)"
            onClick={() => api.openExternal("https://chatgpt.com/#settings/Profile")}
          >
            Edit
          </button>
        </div>
      </div>

      {/* usage stat cards */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        {stats.map(([value, label]) => (
          <div key={label} className="rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5">
            <div className="text-[18px] font-semibold">{value}</div>
            <div className="mt-0.5 text-[11px] text-(--fg-tertiary)">{label}</div>
          </div>
        ))}
      </div>

      {/* token activity chart */}
      <Card title="Token activity">
        <div className="px-4 py-3.5">
          <div className="mb-3 flex justify-end">
            <Segmented
              value={mode}
              options={[
                ["daily", "Daily"],
                ["weekly", "Weekly"],
                ["cumulative", "Cumulative"],
              ]}
              onChange={setMode}
            />
          </div>
          {!usage ? (
            <div className="flex justify-center py-6 text-(--fg-tertiary)">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="flex h-[120px] items-end gap-1.5">
                {months.map((m) => (
                  <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center justify-end self-stretch">
                    <div
                      className={cx("w-full rounded-t-sm", m.value > 0 ? "bg-(--accent)" : "bg-(--surface-active)")}
                      style={{ height: `${Math.max(m.value > 0 ? 4 : 2, (m.value / maxVal) * 100)}%` }}
                      title={`${m.label}: ${fmtTokens(m.value)} tokens`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1.5">
                {months.map((m) => (
                  <div key={m.key} className="min-w-0 flex-1 text-center text-[10px] text-(--fg-faint)">
                    {m.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* activity insights */}
      <Card title="Activity insights">
        {[
          ["Most used reasoning", topReasoning || "—"],
          ["Skills explored", skillsCount != null ? String(skillsCount) : "—"],
          ["Total chats", chatCount != null ? chatCount : "—"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-(--fg-secondary)">{label}</span>
            <span className="text-[13px] font-medium">{value}</span>
          </div>
        ))}
      </Card>
    </>
  );
}
