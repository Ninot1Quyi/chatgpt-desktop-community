// Browser: built-in browser settings. Local state persists under `browser.*`;
// destructive actions confirm first.
import React, { useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { Card, Row, Toggle, Dropdown, Btn, lsGet, lsSet } from "./shared.jsx";
import { IconChevronDown, IconChevronRight, IconX, LucideIcon } from "@app/components/icons.jsx";

const BROWSING_DATA_KINDS = [
  ["history", "Browsing history"],
  ["cookies", "Cookies and site data"],
  ["cache", "Cached images and files"],
  ["downloads", "Download history"],
];

export default function BrowserSection() {
  const toast = useStore((s) => s.toast);
  const [installed, setInstalled] = useState(() => lsGet("browser.installed", false));
  const [webDest, setWebDest] = useState(() => lsGet("browser.webUrlDest", "default"));
  const [localDest, setLocalDest] = useState(() => lsGet("browser.localUrlDest", "chatgpt"));
  const [dataOpen, setDataOpen] = useState(false);
  const [dataKinds, setDataKinds] = useState(() => lsGet("browser.dataKinds", { history: true, cookies: true, cache: true, downloads: true }));
  const [annotations, setAnnotations] = useState(() => lsGet("browser.annotationScreenshots", "always"));
  const [openPanel, setOpenPanel] = useState(null); // passwords | contact | downloads | siteSettings
  const [downloadDir, setDownloadDir] = useState(() => lsGet("browser.downloadDir", null));
  const [askSave, setAskSave] = useState(() => lsGet("browser.askWhereToSave", false));
  const [approval, setApproval] = useState(() => lsGet("browser.approval", "allow"));
  const [sites, setSites] = useState(() => lsGet("browser.sitePermissions", []));
  const [siteDraft, setSiteDraft] = useState("");
  const [cdp, setCdp] = useState(() => lsGet("browser.fullCdp", false));

  const persist = (key, setter) => (v) => {
    setter(v);
    lsSet(key, v);
  };

  const togglePanel = (id) => setOpenPanel((cur) => (cur === id ? null : id));

  const panelText = {
    passwords: "No saved passwords yet.",
    contact: "No saved contact info yet.",
    downloads: "No downloads yet.",
    siteSettings: "Camera and microphone follow the system defaults for all sites.",
  };

  const addSite = () => {
    const url = siteDraft.trim();
    if (!url) return;
    const next = [...sites, { url, status: "Allow" }];
    setSites(next);
    lsSet("browser.sitePermissions", next);
    setSiteDraft("");
  };

  return (
    <>
      <div className="-mt-3 mb-4 text-[13px] text-(--fg-tertiary)">
        Manage the built-in browser. Google Chrome can be set up in computer use settings
      </div>
      <Card title="Browser">
        <Row title="Browser" desc="Let ChatGPT control the built-in browser">
          {installed ? (
            <span className="text-[12px] text-(--success)">Installed</span>
          ) : (
            <Btn
              onClick={() => {
                setInstalled(true);
                lsSet("browser.installed", true);
                toast("Built-in browser installed", "info");
              }}
            >
              Install
            </Btn>
          )}
        </Row>
      </Card>

      <Card title="General">
        <Row title="Import…" desc="Bring bookmarks, history, and passwords from another browser">
          <Btn onClick={() => toast("Import from other browsers is not supported by the backend yet", "warn")}>Import…</Btn>
        </Row>
        <Row title="Web URL and link open destination" desc="Where links open by default">
          <Dropdown
            value={webDest}
            options={[
              { id: "default", label: "Default browser" },
              { id: "chatgpt", label: "ChatGPT" },
            ]}
            onChange={persist("browser.webUrlDest", setWebDest)}
          />
        </Row>
        <Row title="Local URL open destination" desc="Where local development sites open by default">
          <Dropdown
            value={localDest}
            options={[
              { id: "chatgpt", label: "ChatGPT" },
              { id: "default", label: "Default browser" },
            ]}
            onChange={persist("browser.localUrlDest", setLocalDest)}
          />
        </Row>
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[13px]">Browsing data</div>
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-(--fg-tertiary)">
                Clear browsing history, site data, cache, and download history from the in-app browser
              </div>
            </div>
            <Btn
              onClick={() => {
                if (!window.confirm("Clear all browsing data from the in-app browser?")) return;
                toast("Browsing data cleared", "info");
              }}
            >
              Clear all browsing data
            </Btn>
          </div>
          <button
            className="mt-2 flex items-center gap-1 text-[12px] text-(--fg-secondary) hover:text-(--fg)"
            onClick={() => setDataOpen(!dataOpen)}
          >
            {dataOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            Show individual browsing data options
          </button>
          {dataOpen && (
            <div className="mt-2 rounded-lg border border-(--border-light) bg-(--surface) p-2">
              {BROWSING_DATA_KINDS.map(([id, label]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-(--surface-hover)">
                  <input
                    type="checkbox"
                    className="accent-(--accent)"
                    checked={!!dataKinds[id]}
                    onChange={(e) => {
                      const next = { ...dataKinds, [id]: e.target.checked };
                      setDataKinds(next);
                      lsSet("browser.dataKinds", next);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
        <Row
          title="Annotation screenshots"
          desc="Screenshots help ChatGPT better understand and address comments, but increase plan usage"
        >
          <Dropdown
            value={annotations}
            options={[
              { id: "always", label: "Always include" },
              { id: "ask", label: "Ask each time" },
              { id: "never", label: "Never include" },
            ]}
            onChange={persist("browser.annotationScreenshots", setAnnotations)}
          />
        </Row>
      </Card>

      <Card title="Autofill and passwords">
        <Row title="Password manager" desc="Add, delete, and edit saved passwords">
          <Btn onClick={() => togglePanel("passwords")}>Manage</Btn>
        </Row>
        {openPanel === "passwords" && <PanelNote text={panelText.passwords} />}
        <Row title="Contact info" desc="Add, delete, and edit saved addresses, phone numbers, and email addresses">
          <Btn onClick={() => togglePanel("contact")}>Manage</Btn>
        </Row>
        {openPanel === "contact" && <PanelNote text={panelText.contact} />}
      </Card>

      <Card title="Downloads">
        <Row title="Location" desc={downloadDir || "System Downloads folder"}>
          <Btn
            onClick={async () => {
              const dir = await api.pickDirectory(downloadDir || undefined).catch(() => null);
              if (dir) {
                setDownloadDir(dir);
                lsSet("browser.downloadDir", dir);
              }
            }}
          >
            Change
          </Btn>
        </Row>
        <Row title="Ask where to save downloads" desc="Show a save dialog for downloads you start in the built-in browser">
          <Toggle on={askSave} onChange={persist("browser.askWhereToSave", setAskSave)} />
        </Row>
        <Row title="Download history" desc="View and manage files downloaded from the built-in browser">
          <Btn onClick={() => togglePanel("downloads")}>Manage</Btn>
        </Row>
        {openPanel === "downloads" && <PanelNote text={panelText.downloads} />}
      </Card>

      <Card title="Permissions">
        <Row title="Site settings" desc="Control camera and microphone permissions in the built-in browser">
          <Btn onClick={() => togglePanel("siteSettings")}>Manage</Btn>
        </Row>
        {openPanel === "siteSettings" && <PanelNote text={panelText.siteSettings} />}
        <Row title="Approval" desc="Choose if ChatGPT asks for approval before opening websites. Learn more">
          <Dropdown
            value={approval}
            options={[
              { id: "allow", label: "Always allow" },
              { id: "ask", label: "Always ask" },
              { id: "never", label: "Never allow" },
            ]}
            onChange={persist("browser.approval", setApproval)}
          />
        </Row>
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[13px]">Site permissions</div>
              <div className="mt-0.5 text-[12px] leading-5 text-(--fg-tertiary)">Override the defaults above for specific sites</div>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="h-8 min-w-0 flex-1 rounded-lg border border-(--border-light) bg-(--surface) px-2.5 text-[13px] outline-none placeholder:text-(--fg-faint) focus:border-(--accent)"
              placeholder="https://example.com"
              value={siteDraft}
              onChange={(e) => setSiteDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSite()}
            />
            <Btn disabled={!siteDraft.trim()} onClick={addSite}>
              Add
            </Btn>
          </div>
          {sites.length > 0 ? (
            <div className="mt-2 divide-y divide-(--border-light) rounded-lg border border-(--border-light) bg-(--surface)">
              {sites.map((s, i) => (
                <div key={`${s.url}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-[13px]">{s.url}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[12px] text-(--fg-tertiary)">
                    status: {s.status}
                    <button
                      className="text-(--fg-faint) hover:text-(--danger)"
                      onClick={() => {
                        const next = sites.filter((_, j) => j !== i);
                        setSites(next);
                        lsSet("browser.sitePermissions", next);
                      }}
                    >
                      <IconX size={12} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-[12px] text-(--fg-faint)">Only sites with custom permissions appear here</div>
          )}
        </div>
      </Card>

      <Card title="Developer mode">
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-(--warning)">
            <LucideIcon name="TriangleAlert" size={14} />
            Elevated risk
          </div>
        </div>
        <Row
          title="Enable full CDP access"
          desc="Allow ChatGPT to use full Chrome DevTools Protocol (CDP) access in connected Browser Use sessions. Full CDP access lets ChatGPT inspect and control sensitive browser internals that may put your data at risk."
        >
          <Toggle on={cdp} onChange={persist("browser.fullCdp", setCdp)} />
        </Row>
      </Card>
    </>
  );
}

function PanelNote({ text }) {
  return <div className="border-t border-(--border-light) bg-(--surface) px-4 py-3 text-[12px] text-(--fg-faint)">{text}</div>;
}
