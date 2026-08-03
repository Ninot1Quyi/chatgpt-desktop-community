// Computer use: app-control integrations and related toggles. Local state
// persists under `computer.*`.
import React, { useState } from "react";
import { useStore } from "@app/store.js";
import { Card, Row, Toggle, Btn, lsGet, lsSet } from "./shared.jsx";

export default function ComputerUseSection() {
  const toast = useStore((s) => s.toast);
  const [installed, setInstalled] = useState(() => lsGet("computer.anyApp.installed", false));
  const [locked, setLocked] = useState(() => lsGet("computer.lockedUse", false));
  const [hidePip, setHidePip] = useState(() => lsGet("computer.hidePip", false));

  return (
    <>
      <div className="-mt-3 mb-4 text-[0.8125rem] text-(--fg-tertiary)">
        Manage how ChatGPT uses other applications on your computer
      </div>
      <Card title="Control">
        <Row title="Any App" desc="Let ChatGPT control apps on your computer">
          {installed ? (
            <span className="text-[0.75rem] text-(--success)">Installed</span>
          ) : (
            <Btn
              onClick={() => {
                setInstalled(true);
                lsSet("computer.anyApp.installed", true);
                toast("Computer use installed", "info");
              }}
            >
              Install
            </Btn>
          )}
        </Row>
        <Row title="Google Chrome" desc="Connected to browser extension for additional control">
          <Btn onClick={() => toast("Extension management is handled by Chrome", "info")}>Manage</Btn>
        </Row>
        <Row title="Microsoft Excel" desc="Let ChatGPT use Microsoft Excel add-in for additional control" />
      </Card>

      <Card>
        <Row title="Always hide picture in picture" desc="Prevent ChatGPT from showing computer use activity in picture in picture">
          <Toggle
            on={hidePip}
            onChange={(v) => {
              setHidePip(v);
              lsSet("computer.hidePip", v);
            }}
          />
        </Row>
      </Card>

      <Card title="Always-allowed apps">
        <div className="px-4 py-6 text-center text-[0.75rem] text-(--fg-faint)">None yet</div>
      </Card>
    </>
  );
}
