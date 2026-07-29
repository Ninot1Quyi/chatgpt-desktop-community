// Connections: remote-control status, known remote connections (SSH), devices
// allowed to control this Mac, and related toggles.
import React, { useEffect, useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { Card, Row, Toggle, lsGet, lsSet } from "./shared.jsx";

export default function ConnectionsSection() {
  const gs = useStore((s) => s.gs);
  const [status, setStatus] = useState(null);
  const [clients, setClients] = useState(null);
  const [allow, setAllow] = useState(() => lsGet("connections.allow", false));
  const [keepAwake, setKeepAwake] = useState(() => lsGet("connections.keepAwake", false));

  useEffect(() => {
    let live = true;
    api
      .rpc("remoteControl/status/read", {})
      .then((r) => live && setStatus(r))
      .catch(() => live && setStatus(null));
    api
      .rpc("remoteControl/client/list", { environmentId: "local" })
      .then((r) => {
        if (!live) return;
        const list = r?.clients || r?.devices || r?.data || (Array.isArray(r) ? r : []);
        setClients(Array.isArray(list) ? list : []);
      })
      .catch(() => live && setClients([]));
    return () => {
      live = false;
    };
  }, []);

  // Known remote connections from the shared global state.
  const remotes = gs?.["codex-managed-remote-connections"] || {};
  const remoteList = Array.isArray(remotes) ? remotes : Object.values(remotes);

  const statusText = status?.serverName || status?.status || (status ? JSON.stringify(status) : null);

  return (
    <>
      <Card title="Control this Mac">
        <Row title="Control this Mac" desc={statusText ? `Status: ${statusText}` : "Remote control status unavailable"} />
      </Card>

      <Card title="Control other devices">
        {remoteList.length === 0 ? (
          <Row title="SSH" desc="Connect to another machine over SSH" />
        ) : (
          remoteList.map((r, i) => (
            <Row
              key={r.id || r.hostId || i}
              title={r.name || r.host || r.hostId || "SSH"}
              desc={r.host || r.address || (r.hostId ? `SSH · ${r.hostId}` : "SSH")}
            />
          ))
        )}
      </Card>

      <Card title="Devices that can control this Mac">
        {clients == null ? (
          <div className="px-4 py-4 text-[12px] text-(--fg-faint)">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-(--fg-faint)">No devices are currently allowed to control this Mac.</div>
        ) : (
          clients.map((c, i) => (
            <Row key={c.id || i} title={c.name || c.deviceName || c.id || "Unknown device"} desc={c.platform || c.kind || undefined} />
          ))
        )}
        <Row title="Allow connections" desc="Let trusted devices connect and control this Mac">
          <Toggle
            on={allow}
            onChange={(v) => {
              setAllow(v);
              lsSet("connections.allow", v);
            }}
          />
        </Row>
      </Card>

      <Card title="Other settings">
        <Row title="Keep this Mac awake" desc="Prevent sleep when computer is plugged in and remote access is enabled">
          <Toggle
            on={keepAwake}
            onChange={(v) => {
              setKeepAwake(v);
              lsSet("connections.keepAwake", v);
            }}
          />
        </Row>
      </Card>
    </>
  );
}
