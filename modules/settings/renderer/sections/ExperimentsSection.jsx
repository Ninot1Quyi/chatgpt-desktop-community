import React, { useEffect, useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { Card, Row, Toggle, Btn } from "./shared.jsx";

const stageLabel = (stage) => {
  if (stage === "underDevelopment") return "Under development";
  if (!stage) return "Unknown";
  return String(stage).replace(/^\w/, (c) => c.toUpperCase());
};

const listOf = (res) => res?.data || res?.features || (Array.isArray(res) ? res : []);

export default function ExperimentsSection() {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const toast = useStore((s) => s.toast);
  const [features, setFeatures] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    setBusy("refresh");
    setError("");
    try {
      const res = await api.rpc("experimentalFeature/list", {
        cursor: null,
        limit: 100,
        threadId: activeThreadId || null,
      });
      setFeatures(listOf(res));
    } catch (e) {
      setFeatures([]);
      setError(e.message || "Could not load experiments.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  const setEnabled = async (feature, enabled) => {
    setBusy(feature.name);
    setError("");
    setFeatures((cur) =>
      (cur || []).map((item) =>
        item.name === feature.name ? { ...item, enabled } : item
      )
    );
    try {
      await api.rpc("experimentalFeature/enablement/set", {
        enablement: { [feature.name]: enabled },
      });
      toast(`${feature.displayName || feature.name} ${enabled ? "enabled" : "disabled"}`, "success");
      await refresh();
    } catch (e) {
      setError(e.message || "Could not update experiment.");
      setFeatures((cur) =>
        (cur || []).map((item) =>
          item.name === feature.name ? { ...item, enabled: feature.enabled } : item
        )
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="-mt-3 mb-4 flex items-start justify-between gap-4">
        <div className="text-[0.8125rem] text-(--fg-tertiary)">
          Runtime feature flags from the loaded Codex configuration.
        </div>
        <Btn disabled={busy === "refresh"} onClick={refresh}>
          {busy === "refresh" ? "Refreshing..." : "Refresh"}
        </Btn>
      </div>

      <Card title="Feature flags">
        {features == null ? (
          <div className="px-4 py-4 text-[0.75rem] text-(--fg-faint)">Loading...</div>
        ) : features.length === 0 ? (
          <div className="px-4 py-4 text-[0.75rem] text-(--fg-faint)">
            {error || "No experimental feature flags reported by the runtime."}
          </div>
        ) : (
          features.map((feature) => (
            <Row
              key={feature.name}
              title={feature.displayName || feature.name}
              desc={`${stageLabel(feature.stage)} - ${feature.description || feature.name}`}
            >
              <Toggle
                on={feature.enabled}
                onChange={(enabled) => setEnabled(feature, enabled)}
              />
            </Row>
          ))
        )}
      </Card>

      {error && features?.length > 0 && (
        <div className="rounded-xl border border-(--danger) bg-(--danger-soft) px-4 py-3 text-[0.75rem] text-(--danger)">
          {error}
        </div>
      )}
    </>
  );
}
