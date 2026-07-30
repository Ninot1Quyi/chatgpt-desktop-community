// Connections: remote-control status, known remote connections (SSH), devices
// allowed to control this computer, and related toggles.
import React, { useEffect, useMemo, useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { Card, Row, Toggle, Btn, lsGet, lsSet } from "./shared.jsx";
import {
  clientIdOf,
  environmentIdOf,
  formatClientDescription,
  formatClientTitle,
  formatPairingExpiry,
  formatRemoteStatus,
  isRemoteControlEnabled,
  listOfClients,
} from "./connections-protocol.mjs";

export default function ConnectionsSection() {
  const gs = useStore((s) => s.gs);
  const toast = useStore((s) => s.toast);
  const [status, setStatus] = useState(null);
  const [clients, setClients] = useState(null);
  const [pairing, setPairing] = useState(null);
  const [keepAwake, setKeepAwake] = useState(() => lsGet("connections.keepAwake", false));
  const [busy, setBusy] = useState("");

  const envId = environmentIdOf(status, pairing);
  const allow = isRemoteControlEnabled(status);

  const refreshClients = async (nextEnvId) => {
    if (!nextEnvId) {
      setClients([]);
      return;
    }
    const nextClients = await api
      .rpc("remoteControl/client/list", { environmentId: nextEnvId })
      .catch(() => ({ data: [] }));
    setClients(listOfClients(nextClients));
  };

  const refresh = async () => {
    setBusy((cur) => cur || "refresh");
    const nextStatus = await api.rpc("remoteControl/status/read", null).catch(() => null);
    setStatus(nextStatus);
    await refreshClients(environmentIdOf(nextStatus, pairing));
    setBusy("");
  };

  useEffect(() => {
    let live = true;
    refresh().finally(() => {
      if (!live) return;
    });
    const off = api.onNotification?.((message) => {
      if (message?.method !== "remoteControl/status/changed") return;
      setStatus(message.params || null);
      refreshClients(environmentIdOf(message.params, pairing)).catch(() => {});
    });
    return () => {
      live = false;
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAllow = async (enabled) => {
    setBusy("allow");
    try {
      const nextStatus = await api.rpc(enabled ? "remoteControl/enable" : "remoteControl/disable", { ephemeral: false });
      setStatus(nextStatus);
      await refreshClients(environmentIdOf(nextStatus, pairing));
    } catch (e) {
      toast(e.message || "Could not update remote control", "error");
    } finally {
      setBusy("");
    }
  };

  const startPairing = async () => {
    setBusy("pairing");
    try {
      const nextPairing = await api.rpc("remoteControl/pairing/start", { manualCode: true });
      setPairing(nextPairing);
      await refreshClients(environmentIdOf(status, nextPairing));
    } catch (e) {
      toast(e.message || "Could not start pairing", "error");
    } finally {
      setBusy("");
    }
  };

  const checkPairing = async () => {
    if (!pairing?.pairingCode && !pairing?.manualPairingCode) return;
    setBusy("pairing");
    try {
      const result = await api.rpc("remoteControl/pairing/status", {
        pairingCode: pairing.pairingCode || null,
        manualPairingCode: pairing.manualPairingCode || null,
      });
      if (result?.claimed) {
        toast("Device paired", "success");
        setPairing(null);
        await refresh();
      } else {
        toast("Pairing is still waiting", "info");
      }
    } catch (e) {
      toast(e.message || "Could not check pairing", "error");
    } finally {
      setBusy("");
    }
  };

  const revokeClient = async (client) => {
    const clientId = clientIdOf(client);
    if (!clientId || !envId) return;
    setBusy(clientId);
    try {
      await api.rpc("remoteControl/client/revoke", { environmentId: envId, clientId });
      await refreshClients(envId);
      toast("Device removed", "success");
    } catch (e) {
      toast(e.message || "Could not remove device", "error");
    } finally {
      setBusy("");
    }
  };

  // Known remote connections from the shared global state.
  const remoteList = useMemo(() => {
    const remotes = gs?.["codex-managed-remote-connections"] || {};
    return Array.isArray(remotes) ? remotes : Object.values(remotes);
  }, [gs]);

  const pairingExpiry = formatPairingExpiry(pairing?.expiresAt);

  return (
    <>
      <Card title="Control this computer">
        <Row title="Remote control" desc={formatRemoteStatus(status)}>
          <Btn disabled={busy === "refresh"} onClick={refresh}>
            {busy === "refresh" ? "Refreshing..." : "Refresh"}
          </Btn>
        </Row>
        <Row
          title="Allow connections"
          desc={envId ? `Environment: ${envId}` : "Enable remote control to receive an environment from the service"}
        >
          <Toggle
            on={allow}
            onChange={updateAllow}
          />
        </Row>
        <Row
          title="Pair a new device"
          desc={pairing ? `Code: ${pairing.manualPairingCode || pairing.pairingCode}${pairingExpiry ? ` · Expires ${pairingExpiry}` : ""}` : "Create a pairing code from the service"}
        >
          <div className="flex gap-2">
            {pairing && (
              <Btn disabled={busy === "pairing"} onClick={checkPairing}>
                Check
              </Btn>
            )}
            <Btn disabled={busy === "pairing" || !allow} onClick={startPairing}>
              {busy === "pairing" ? "Working..." : pairing ? "New code" : "Start pairing"}
            </Btn>
          </div>
        </Row>
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

      <Card title="Devices that can control this computer">
        {clients == null ? (
          <div className="px-4 py-4 text-[12px] text-(--fg-faint)">Loading…</div>
        ) : !envId ? (
          <div className="px-4 py-4 text-[12px] text-(--fg-faint)">Remote control has not provided an environment yet.</div>
        ) : clients.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-(--fg-faint)">No devices are currently allowed to control this computer.</div>
        ) : (
          clients.map((c, i) => (
            <Row
              key={clientIdOf(c) || i}
              title={formatClientTitle(c)}
              desc={formatClientDescription(c)}
            >
              <Btn danger disabled={!clientIdOf(c) || busy === clientIdOf(c)} onClick={() => revokeClient(c)}>
                {busy === clientIdOf(c) ? "Removing..." : "Remove"}
              </Btn>
            </Row>
          ))
        )}
      </Card>

      <Card title="Other settings">
        <Row title="Keep this computer awake" desc="Prevent sleep when the computer is plugged in and remote access is enabled">
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
