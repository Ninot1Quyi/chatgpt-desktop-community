import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import HotkeyApp from "./HotkeyApp.jsx";
import QuickChatApp from "./QuickChatApp.jsx";
import "./theme.css";

const w = new URLSearchParams(window.location.search).get("window");
const Root = w === "hotkey" ? HotkeyApp : w === "quickchat" ? QuickChatApp : App;
createRoot(document.getElementById("root")).render(<Root />);
