import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  translate,
} from "../renderer/src/lib/i18n.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("language normalization accepts supported locales and rejects stale values", () => {
  assert.equal(normalizeLanguage("zh-CN"), "zh-CN");
  assert.equal(normalizeLanguage("en-US"), "en-US");
  assert.equal(normalizeLanguage("fr-FR"), DEFAULT_LANGUAGE);
});

test("translations fall back to the source copy when a key is not localized", () => {
  assert.equal(translate("zh-CN", "Language"), "语言");
  assert.equal(translate("zh-CN", "Provider-specific copy"), "Provider-specific copy");
  assert.equal(translate("en-US", "Language"), "Language");
});

test("official plugin catalog copy is localized without changing its English source", () => {
  const longDescription = "Chrome lets ChatGPT use your Chrome browser for tasks that need your existing browser state, including open tabs, page content, and websites you're already signed in to. It can navigate, view, click, type, and take screenshots while working. You stay in control: ChatGPT asks before interacting with new sites, you can stop actions at any time, and you can manage or remove Chrome access in settings. Browser content may include sensitive information from logged-in sites. Browser data from using this plugin may be used for training, subject to your OpenAI account data controls.";
  assert.equal(translate("zh-CN", "Control Chrome with ChatGPT"), "使用 ChatGPT 控制 Chrome");
  assert.equal(translate("zh-CN", "file my expenses for me"), "帮我整理费用报销");
  assert.match(translate("zh-CN", longDescription), /^Chrome 可让 ChatGPT 使用你的 Chrome 浏览器/);
  assert.equal(translate("en-US", longDescription), longDescription);
});

test("the selected language participates in preference hydration and persistence", () => {
  const source = fs.readFileSync(path.join(repoRoot, "renderer", "src", "store.js"), "utf8");
  assert.match(source, /language:\s*stored\("ui\.language",\s*DEFAULT_LANGUAGE\)/);
  assert.match(source, /\[[^\]]*"language"[^\]]*\][^{]*\{/s);
  assert.match(source, /persist\(`ui\.\$\{k\}`,\s*ui\[k\]\)/);
});

test("settings exposes an enabled persisted language picker", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "modules", "settings", "renderer", "Settings.jsx"),
    "utf8",
  );
  assert.match(source, /options=\{SUPPORTED_LANGUAGES\}/);
  assert.match(source, /onChange=\{\(value\) => setUi\(\{ language: value \}\)\}/);
  assert.doesNotMatch(source, /<Dropdown value="en"[^>]*disabled/);
});

test("plugin marketplace metadata is rendered through i18n while prompts keep their source value", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "modules", "projects-navigation", "renderer", "NavViews.jsx"),
    "utf8",
  );
  assert.match(source, /\{t\(iface\.shortDescription \|\| ""\)\}/);
  assert.match(source, /\{t\(iface\.longDescription\)\}/);
  assert.match(source, /\{t\(p\)\}/);
  assert.match(source, /newChatWithPrefill\(p \+ " ",/);
});
