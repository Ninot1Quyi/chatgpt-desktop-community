// Configuration: config.toml access, approval/sandbox policy (wired to the
// shared permission preset), model features, and workspace dependencies.
import React, { useEffect, useState } from "react";
import * as api from "../../api.js";
import { useStore, normalizePermission } from "../../store.js";
import { cx } from "../../lib/cx.js";
import { Card, Row, Toggle, Dropdown, Btn, lsGet, lsSet } from "./shared.jsx";
import { IconChevronDown, IconCheck } from "../icons.jsx";

const APPROVAL_OPTIONS = [
  { id: "ask", label: "On request" },
  { id: "approve", label: "Auto-review" },
  { id: "full", label: "Full access" },
];

const SANDBOX_OPTIONS = [
  { id: "workspace", label: "Workspace write" },
  { id: "full", label: "Full access" },
];

function extractText(res) {
  if (res == null) return "";
  if (typeof res === "string") return res;
  return res.stdout || res.output || res.result || res.text || JSON.stringify(res);
}

export default function ConfigurationSection() {
  const appInfo = useStore((s) => s.appInfo);
  const permission = useStore((s) => normalizePermission(s.permission));
  const setPermission = useStore((s) => s.setPermission);
  const cwd = useStore((s) => s.cwd);
  const models = useStore((s) => s.modelsByRuntime.codex);
  const toast = useStore((s) => s.toast);

  const [ultra, setUltra] = useState(() => lsGet("settings.ultraSlider", false));
  const [effortsOpen, setEffortsOpen] = useState(false);
  // null = all selected (default); otherwise a Set of reasoningEffort ids.
  const [selected, setSelected] = useState(() => {
    const v = lsGet("settings.reasoningEfforts", null);
    return Array.isArray(v) ? new Set(v) : null;
  });
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState(null); // "diagnose" | "reinstall"
  const [cfgApproval, setCfgApproval] = useState(null); // config.toml approval_policy
  const [cfgSandbox, setCfgSandbox] = useState(null); // config.toml sandbox_mode

  useEffect(() => {
    let live = true;
    api.rpc("config/read", {}).then((r) => {
      if (!live) return;
      setCfgApproval(r?.config?.approval_policy || null);
      setCfgSandbox(r?.config?.sandbox_mode || null);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const projectCfg = cwd ? `${cwd}/.codex/config.toml` : null;
  const projectName = cwd ? cwd.split("/").filter(Boolean).pop() : null;
  // Settings show the config defaults (the composer may carry a runtime override).
  const approval = cfgApproval == null || cfgApproval === "on-request" ? "ask" : cfgApproval === "untrusted" ? "approve" : "full";
  const sandbox = cfgSandbox === "danger-full-access" ? "full" : "workspace";

  const efforts = models?.[0]?.supportedReasoningEfforts || [];
  const selectedCount = selected == null ? efforts.length : selected.size;

  const runVersionCheck = async (kind) => {
    setBusy(kind);
    try {
      const res = await api.rpc("command/exec", { command: ["codex", "--version"] });
      const text = extractText(res).trim();
      if (text) setVersion(text.split("\n")[0]);
      if (kind === "diagnose") toast("Diagnostic logs recorded", "info");
    } catch (e) {
      toast(`Workspace check failed: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    runVersionCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleEffort = (id) => {
    const cur = selected == null ? new Set(efforts.map((e) => e.reasoningEffort || e)) : new Set(selected);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    setSelected(cur);
    lsSet("settings.reasoningEfforts", [...cur]);
  };

  return (
    <>
      <div className="-mt-3 mb-4 text-[13px] text-(--fg-tertiary)">
        Configure approval policy and sandbox settings.{" "}
        <button className="text-(--accent) hover:underline" onClick={() => api.openExternal("https://developers.openai.com/codex/config")}>
          Learn more
        </button>
      </div>
      <div className="mb-4 rounded-xl border border-(--border-light) bg-(--surface-under) px-4 py-3 text-[13px] text-(--fg-secondary)">
        <code className="font-mono text-[12px]">thread/rollback</code> is deprecated and will be removed soon
      </div>
      <Card title="Custom config.toml settings">
        <Row title="User config">
          <Btn onClick={() => api.openPath(`${appInfo?.home || "~"}/.codex/config.toml`)}>Open config.toml</Btn>
        </Row>
        {projectCfg && (
          <Row title={projectName}>
            <Btn onClick={() => api.openPath(projectCfg)}>Open config.toml</Btn>
          </Row>
        )}
      </Card>

      <Card title="Permissions">
        <Row title="Approval policy" desc="Choose when ChatGPT asks for approval">
          <Dropdown
            value={approval}
            options={APPROVAL_OPTIONS}
            onChange={(v) => {
              setPermission(v);
              const value = v === "ask" ? "on-request" : v === "approve" ? "untrusted" : "never";
              api.rpc("config/value/write", { keyPath: "approval_policy", value, mergeStrategy: "replace" }).catch(() => {});
            }}
          />
        </Row>
        <Row title="Sandbox settings" desc="Choose how much ChatGPT can do when running commands">
          <Dropdown
            value={sandbox}
            options={SANDBOX_OPTIONS}
            onChange={(v) => {
              setPermission(v === "full" ? "full" : "ask");
              api.rpc("config/value/write", { keyPath: "sandbox_mode", value: v === "full" ? "danger-full-access" : "workspace-write", mergeStrategy: "replace" }).catch(() => {});
            }}
          />
        </Row>
      </Card>

      <Card title="Model features">
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[13px]">Available reasoning efforts</div>
              <div className="mt-0.5 text-[12px] leading-5 text-(--fg-tertiary)">
                Choose which reasoning effort levels appear in model controls. Availability varies by model
              </div>
            </div>
            <button
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-(--border-light) bg-(--surface) px-2.5 text-[12px] text-(--fg-secondary) hover:bg-(--surface-hover)"
              onClick={() => setEffortsOpen(!effortsOpen)}
            >
              {selectedCount} selected
              <IconChevronDown size={12} className={cx("text-(--fg-tertiary) transition-transform", effortsOpen && "rotate-180")} />
            </button>
          </div>
          {effortsOpen && (
            <div className="mt-2.5 rounded-lg border border-(--border-light) bg-(--surface) p-1">
              {efforts.length === 0 && (
                <div className="px-2 py-1.5 text-[12px] text-(--fg-faint)">No reasoning effort levels reported by the current model.</div>
              )}
              {efforts.map((e) => {
                const id = e.reasoningEffort || e;
                const on = selected == null || selected.has(id);
                return (
                  <button
                    key={id}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] capitalize hover:bg-(--surface-hover)"
                    onClick={() => toggleEffort(id)}
                  >
                    {id}
                    {on && <IconCheck size={13} className="text-(--accent)" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Row title="Ultra in model picker slider" desc="Show Ultra as the highest slider option">
          <Toggle
            on={ultra}
            onChange={(v) => {
              setUltra(v);
              lsSet("settings.ultraSlider", v);
            }}
          />
        </Row>
      </Card>

      <Card title="Workspace Dependencies">
        <Row title="Noma dependencies" desc="Allow ChatGPT to install and expose bundled Node.js and Python tools" />
        <Row title="Diagnose issues in Noma Workspace" desc="Checks the current bundle and records diagnostic logs">
          <Btn disabled={busy === "diagnose"} onClick={() => runVersionCheck("diagnose")}>
            {busy === "diagnose" ? "Diagnosing…" : "Diagnose"}
          </Btn>
        </Row>
        <Row title="Reset and install Workspace" desc="Downloads a fresh bundle, installs it, and reloads tools">
          <Btn disabled={busy === "reinstall"} onClick={() => runVersionCheck("reinstall")}>
            {busy === "reinstall" ? "Reinstalling…" : "Reinstall"}
          </Btn>
        </Row>
        <div className="px-4 py-3.5 text-[12px] text-(--fg-tertiary)">
          Current version: <span className="font-mono">{version || "—"}</span>
        </div>
      </Card>
    </>
  );
}
