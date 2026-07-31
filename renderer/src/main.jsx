import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import HotkeyApp from "./HotkeyApp.jsx";
import QuickChatApp from "./QuickChatApp.jsx";
import {
  DiagnosticsBoundary,
  installRendererDiagnostics,
} from "@modules/diagnostics";
import { LanguageDocumentSync } from "./i18n.jsx";
import "./theme.css";

const w = new URLSearchParams(window.location.search).get("window");
const Root = w === "hotkey" ? HotkeyApp : w === "quickchat" ? QuickChatApp : App;
const windowKind = w === "hotkey" ? "hotkey" : w === "quickchat" ? "quickchat" : "main";
installRendererDiagnostics(windowKind);
const root = createRoot(document.getElementById("root"));
root.render(
  <DiagnosticsBoundary>
    <LanguageDocumentSync />
    <Root />
  </DiagnosticsBoundary>,
);
window.__COMMUNITY_RENDERER_MOUNTED__ = true;
window.dispatchEvent(new Event("community:renderer-mounted"));
