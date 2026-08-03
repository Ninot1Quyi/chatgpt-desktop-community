// Profile: identity header, lifetime usage stats, token activity chart and
// activity insights — all from the app-server where available.
import React, { useEffect, useMemo, useState } from "react";
import * as api from "@app/api.js";
import { useStore, planLabel } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import { Card, Segmented } from "./shared.jsx";
import { Spinner } from "@app/components/ui.jsx";
import { buildTokenSeries, recentUsageRows } from "./profile-usage.mjs";

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
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState(null);
  const [skillsCount, setSkillsCount] = useState(null);
  const [chatCount, setChatCount] = useState(null);
  const [topReasoning, setTopReasoning] = useState(null);
  const [mode, setMode] = useState("daily");

  useEffect(() => {
    let live = true;
    setUsageLoading(true);
    setUsageError(null);
    api
      .rpc("account/usage/read", null)
      .then((r) => {
        if (!live) return;
        setUsage(r);
      })
      .catch((e) => {
        if (!live) return;
        setUsageError(e.message || "Usage data is not available");
      })
      .finally(() => {
        if (live) setUsageLoading(false);
      });
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
        api.rpc("thread/list", {
          limit: 100,
          sortKey: "updated_at",
          sortDirection: "desc",
          useStateDbOnly: true,
        })
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

  const series = useMemo(() => buildTokenSeries(usage, mode), [usage, mode]);
  const rows = useMemo(() => recentUsageRows(usage), [usage]);
  const maxVal = Math.max(1, ...series.map((m) => m.value));

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
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--surface-active) text-[1rem] font-medium">
          {profile?.photo ? (
            <img src={profile.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            (profile?.name || "?").slice(0, 1)
          )}
        </div>
        <div className="flex items-baseline gap-1.5 text-[0.9375rem]">
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
            className="flex h-7 items-center rounded-lg border border-(--border) px-2.5 text-[0.75rem] hover:bg-(--surface-hover)"
            onClick={() => {
              navigator.clipboard?.writeText(`https://chatgpt.com/u/${profile?.username || ""}`).catch(() => {});
              useStore.getState().toast("Profile link copied");
            }}
          >
            Share
          </button>
          <button
            className="flex h-7 items-center rounded-lg border border-(--border) px-2.5 text-[0.75rem] hover:bg-(--surface-hover)"
            onClick={() => useStore.getState().toast("Profile is private", "info")}
          >
            Private
          </button>
          <button
            className="flex h-7 items-center rounded-lg border border-(--border) px-2.5 text-[0.75rem] hover:bg-(--surface-hover)"
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
            <div className="text-[1.125rem] font-semibold">{value}</div>
            <div className="mt-0.5 text-[0.6875rem] text-(--fg-tertiary)">{label}</div>
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
          {usageLoading ? (
            <div className="flex justify-center py-6 text-(--fg-tertiary)">
              <Spinner />
            </div>
          ) : usageError ? (
            <div className="py-6 text-center text-[0.75rem] text-(--fg-tertiary)">
              Usage data is not available: {usageError}
            </div>
          ) : (
            <>
              <div className="flex h-[7.5rem] items-end gap-1.5">
                {series.map((m) => (
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
                {series.map((m) => (
                  <div key={m.key} className="min-w-0 flex-1 text-center text-[0.625rem] text-(--fg-faint)">
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-(--border-light)">
                <div className="flex items-center justify-between px-3 py-2 text-[0.6875rem] text-(--fg-tertiary)">
                  <span>Recent daily records</span>
                  <span>Tokens</span>
                </div>
                {rows.length === 0 ? (
                  <div className="px-3 py-2 text-[0.75rem] text-(--fg-faint)">No token records yet.</div>
                ) : (
                  rows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between border-t border-(--border-light) px-3 py-2 text-[0.75rem]">
                      <span className="text-(--fg-secondary)">{row.label}</span>
                      <span className="font-medium">{fmtTokens(row.tokens)}</span>
                    </div>
                  ))
                )}
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
            <span className="text-[0.8125rem] text-(--fg-secondary)">{label}</span>
            <span className="text-[0.8125rem] font-medium">{value}</span>
          </div>
        ))}
      </Card>
    </>
  );
}
