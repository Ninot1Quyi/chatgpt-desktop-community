// Plugins settings — the reference manage view: subtitle "Manage plugins,
// skills, and MCPs" plus tabs with live counts (Plugins / Apps / MCPs /
// Skills / Marketplace), a search field, and flat rows with … and toggles.
// Data: plugin/list, app/list, mcpServerStatus/list, skills/list.
// Toggles: config/value/write for plugins & MCPs, skills/config/write for
// skills — the same writes the reference performs.
import React, { useEffect, useMemo, useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import { Toggle } from "./shared.jsx";
import { Spinner, Menu } from "@app/components/ui.jsx";
import {
  PluginDetailView,
  PluginIcon,
  pluginName,
  skillName,
} from "@modules/projects-navigation/plugin-views";
import { IconSearch, IconMore, IconSkillCube } from "@app/components/icons.jsx";

export default function PluginsSection() {
  const toast = useStore((s) => s.toast);
  const home = useStore((s) => s.appInfo?.home) || "";
  const [plugins, setPlugins] = useState(null);
  const [apps, setApps] = useState(null);
  const [mcps, setMcps] = useState(null);
  const [skills, setSkills] = useState(null);
  const [marketplaces, setMarketplaces] = useState(null);
  const [tab, setTab] = useState("plugins");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  const [overflow, setOverflow] = useState(null); // {rect, plugin}
  const [detail, setDetail] = useState(null); // plugin open in the detail page

  const loadPlugins = () =>
    api.rpc("plugin/list", {}).then((r) => {
      const flat = [];
      for (const mp of r?.marketplaces || []) for (const p of mp.plugins || []) flat.push({ ...p, _marketplace: mp.name, _marketplacePath: mp.path });
      setPlugins(flat);
      return flat;
    });

  useEffect(() => {
    let live = true;
    loadPlugins().catch(() => live && setPlugins([]));
    api.rpc("app/list", { cursor: null, limit: 50, threadId: null, forceRefetch: false })
      .then((r) => live && setApps(r?.data || r?.apps || []))
      .catch(() => live && setApps([]));
    api.rpc("mcpServerStatus/list", { cursor: null, limit: 50, detail: "full", threadId: null })
      .then(async (r) => {
        if (!live) return;
        const all = r?.data || [];
        // The reference lists only user-configured servers (config.toml
        // [mcp_servers]), not built-ins like codex_apps.
        let configured = null;
        try {
          const cfg = await api.rpc("config/read", {});
          const servers = cfg?.config?.mcp_servers || cfg?.config?.mcpServers;
          if (servers && typeof servers === "object") configured = new Set(Object.keys(servers));
        } catch {}
        setMcps(configured ? all.filter((m) => configured.has(m.name)) : all);
      })
      .catch(() => live && setMcps([]));
    api.rpc("skills/list", { cwds: [home] })
      .then((r) => {
        if (!live) return;
        const dirs = [`${home}/.codex/skills/`, `${home}/.agents/skills/`];
        const byName = new Map();
        for (const g of r?.data || []) {
          for (const s of g.skills || []) {
            if (s.scope === "user" && dirs.some((d) => (s.path || "").startsWith(d)) && !byName.has(s.name)) byName.set(s.name, s);
          }
        }
        setSkills([...byName.values()]);
      })
      .catch(() => live && setSkills([]));
    // Marketplace tab: user-managed marketplaces (personal).
    api.rpc("plugin/list", {}).then((r) => {
      if (!live) return;
      setMarketplaces((r?.marketplaces || []).filter((m) => m.name === "personal"));
    }).catch(() => live && setMarketplaces([]));
    return () => { live = false; };
  }, [home]);

  const q = query.trim().toLowerCase();
  const installed = useMemo(
    () => (plugins || []).filter((p) => p.installed && (!q || pluginName(p).toLowerCase().includes(q) || (p.interface?.shortDescription || "").toLowerCase().includes(q))),
    [plugins, q]
  );
  const appsFiltered = useMemo(() => (apps || []).filter((a) => !q || (a.name || "").toLowerCase().includes(q)), [apps, q]);
  const mcpsFiltered = useMemo(() => (mcps || []).filter((m) => !q || (m.name || "").toLowerCase().includes(q)), [mcps, q]);
  const skillsFiltered = useMemo(
    () => (skills || []).filter((s) => !q || skillName(s).toLowerCase().includes(q)),
    [skills, q]
  );
  const mpsFiltered = useMemo(() => (marketplaces || []).filter((m) => !q || (m.name || "").toLowerCase().includes(q)), [marketplaces, q]);

  // Reference rule: the MCPs tab always shows; other tabs only when they
  // have entries.
  const tabs = [
    { id: "plugins", label: "Plugins", count: (plugins || []).filter((p) => p.installed).length },
    { id: "apps", label: "Apps", count: (apps || []).length },
    { id: "mcps", label: "MCPs", count: (mcps || []).length, always: true },
    { id: "skills", label: "Skills", count: (skills || []).length },
    { id: "marketplace", label: "Marketplace", count: (marketplaces || []).length },
  ].filter((t) => t.always || t.count > 0);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id || "plugins";

  const setPluginEnabled = async (p, enabled) => {
    setBusy(p.id);
    try {
      await api.rpc("config/value/write", { keyPath: `plugins."${p.id}".enabled`, value: enabled, mergeStrategy: "replace" });
      await loadPlugins();
    } catch (e) {
      toast(`Update failed: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };
  const setSkillEnabled = async (s, enabled) => {
    setBusy(s.path);
    try {
      await api.rpc("skills/config/write", { path: s.path, enabled });
      setSkills((cur) => cur.map((x) => (x.path === s.path ? { ...x, enabled } : x)));
    } catch (e) {
      toast(`Update failed: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const loading = plugins === null || apps === null || mcps === null || skills === null;

  if (detail) {
    return <PluginDetailView plugin={detail} onBack={() => setDetail(null)} onChanged={setPlugins} />;
  }

  return (
    <div>
      <div className="-mt-3 mb-4 text-[13px] text-(--fg-tertiary)">Manage plugins, skills, and MCPs</div>

      {/* tab row + search */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-full border border-(--border-light) bg-(--surface-under) p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "h-6 rounded-full px-3 text-xs",
                activeTab === t.id ? "bg-(--surface-active) text-(--fg)" : "text-(--fg-tertiary) hover:text-(--fg)"
              )}
            >
              {t.label} {t.count}
            </button>
          ))}
        </div>
        <div className="flex h-7 w-[220px] items-center gap-2 rounded-full border border-(--border-light) bg-(--input-bg) px-2.5">
          <IconSearch size={12} className="shrink-0 text-(--fg-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-(--fg-faint)"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-(--fg-tertiary)"><Spinner /></div>
      ) : activeTab === "plugins" ? (
        <div className="divide-y divide-(--border-light) rounded-2xl border border-(--border-light) bg-(--surface-under)">
          {installed.length === 0 && <div className="px-4 py-6 text-center text-xs text-(--fg-faint)">No installed plugins</div>}
          {installed.map((p) => (
            <div key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-(--fg)/5" onClick={() => setDetail(p)}>
              <PluginIcon plugin={p} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">
                  {pluginName(p)}
                  {(p._marketplace === "personal" || p._marketplace === "ponytail") && (
                    <span className="ml-1.5 font-normal text-(--fg-tertiary)">{p._marketplace}</span>
                  )}
                </div>
                <div className="truncate text-[12px] text-(--fg-tertiary)">{p.interface?.shortDescription || ""}</div>
              </div>
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
                title="More actions"
                onClick={(e) => { e.stopPropagation(); setOverflow({ rect: e.currentTarget.getBoundingClientRect(), plugin: p }); }}
              >
                <IconMore size={14} />
              </button>
              <span onClick={(e) => e.stopPropagation()}>
                <Toggle on={!!p.enabled} onChange={(v) => setPluginEnabled(p, v)} />
              </span>
            </div>
          ))}
        </div>
      ) : activeTab === "apps" ? (
        <div className="divide-y divide-(--border-light) rounded-2xl border border-(--border-light) bg-(--surface-under)">
          {appsFiltered.length === 0 && <div className="px-4 py-6 text-center text-xs text-(--fg-faint)">No installed apps</div>}
          {appsFiltered.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              {a.logoUrl || a.iconAssets?.["256_square"] ? (
                <img src={a.logoUrl || a.iconAssets["256_square"]} alt="" className="size-8 rounded-lg object-cover" />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-lg bg-(--surface-active) text-xs font-medium">
                  {(a.name || "?").charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{a.name}</div>
                <div className="truncate text-[12px] text-(--fg-tertiary)">{a.description || ""}</div>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === "mcps" ? (
        <div className="divide-y divide-(--border-light) rounded-2xl border border-(--border-light) bg-(--surface-under)">
          {mcpsFiltered.length === 0 && <div className="px-4 py-6 text-center text-xs text-(--fg-faint)">No MCP servers configured</div>}
          {mcpsFiltered.map((m) => (
            <div key={m.name} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--surface-active) text-xs font-medium">
                {(m.name || "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{m.name}</div>
                <div className="truncate text-[12px] text-(--fg-tertiary)">
                  {m.serverInfo?.name || ""}
                  {m.tools ? ` · ${Object.keys(m.tools).length} tools` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === "skills" ? (
        <div className="divide-y divide-(--border-light) rounded-2xl border border-(--border-light) bg-(--surface-under)">
          {skillsFiltered.length === 0 && <div className="px-4 py-6 text-center text-xs text-(--fg-faint)">No skills installed</div>}
          {skillsFiltered.map((s) => (
            <div key={s.path} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--surface)">
                {s.interface?.iconSmall ? (
                  <img src={api.localFileUrl(s.interface.iconSmall)} alt="" className="size-6 rounded object-cover" />
                ) : (
                  <IconSkillCube size={20} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{skillName(s)}</div>
                <div className="truncate text-[12px] text-(--fg-tertiary)">{s.interface?.shortDescription || s.shortDescription || s.description || ""}</div>
              </div>
              <Toggle on={!!s.enabled} onChange={(v) => setSkillEnabled(s, v)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-(--border-light) rounded-2xl border border-(--border-light) bg-(--surface-under)">
          {mpsFiltered.length === 0 && <div className="px-4 py-6 text-center text-xs text-(--fg-faint)">No marketplaces</div>}
          {mpsFiltered.map((m) => (
            <div key={m.name} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--surface-active) text-xs font-medium">
                {(m.name || "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{m.name}</div>
                <div className="truncate text-[12px] text-(--fg-tertiary)">{m.path || ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Menu
        open={!!overflow}
        anchor={() => overflow?.rect}
        onClose={() => setOverflow(null)}
        align="end"
        width={180}
        items={[
          {
            id: "reveal",
            label: "Reveal in folder",
            disabled: !overflow?.plugin?.source?.path,
            onSelect: () => api.showItemInFolder(overflow.plugin.source.path),
          },
          {
            id: "uninstall",
            label: "Uninstall",
            onSelect: () =>
              api.rpc("plugin/uninstall", { pluginId: overflow.plugin.id })
                .then(loadPlugins)
                .catch((e) => toast(`Uninstall failed: ${e.message}`)),
          },
        ]}
      />
    </div>
  );
}
