import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const voiceSectionSource = fs.readFileSync(
  new URL("../modules/settings/renderer/sections/VoiceSection.jsx", import.meta.url),
  "utf8",
);

test("Voice settings can populate microphones from browser media devices", () => {
  assert.equal(voiceSectionSource.includes("navigator.mediaDevices?.enumerateDevices?.()"), true);
  assert.match(voiceSectionSource, /device\.kind === "audioinput"/);
  assert.match(voiceSectionSource, /setMics\(\[\{ id: "default", label: "System default" \}, \.\.\.inputs\]\)/);
});

test("Voice settings can populate GPT Live voices from app-server while keeping fallbacks", () => {
  assert.match(voiceSectionSource, /const FALLBACK_GPT_LIVE_VOICES = \[/);
  assert.match(voiceSectionSource, /api\.rpc\("thread\/realtime\/listVoices", \{\}\)/);
  assert.match(voiceSectionSource, /response\?\.voices\?\.v2\?\.length/);
  assert.match(voiceSectionSource, /setLiveVoices\(voices\.map\(voiceOption\)\)/);
});
