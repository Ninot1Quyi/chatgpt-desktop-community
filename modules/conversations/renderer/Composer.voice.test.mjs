import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./Composer.jsx", import.meta.url), "utf8");
const defaults = source.match(/const DEFAULT_GPT_LIVE_VOICE = "marin";\nconst SUPPORTED_GPT_LIVE_VOICES = new Set\(\[[\s\S]*?\]\);\n/);
const getter = source.match(/function getGptLiveVoice\(\) \{[\s\S]*?\n\}/);

if (!defaults || !getter) {
  throw new Error("Could not find GPT Live voice selection code in Composer.jsx");
}

function readVoice(storedValue) {
  const context = {
    globalThis: {
      localStorage: {
        getItem: () => storedValue,
      },
    },
  };
  vm.runInNewContext(`${defaults[0]}${getter[0]}; globalThis.result = getGptLiveVoice();`, context);
  return context.globalThis.result;
}

test("reads the JSON-encoded voice persisted by settings", () => {
  assert.equal(readVoice(JSON.stringify("verse")), "verse");
});

test("keeps compatibility with older bare localStorage values", () => {
  assert.equal(readVoice("verse"), "verse");
});

test("falls back to the default voice for unsupported or missing values", () => {
  assert.equal(readVoice(JSON.stringify("not-a-voice")), "marin");
  assert.equal(readVoice(null), "marin");
});

test("falls back to the default voice when localStorage access fails", () => {
  const context = {
    globalThis: {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    },
  };
  vm.runInNewContext(`${defaults[0]}${getter[0]}; globalThis.result = getGptLiveVoice();`, context);
  assert.equal(context.globalThis.result, "marin");
});

test("sends realtime input audio with the v2 audio chunk shape", () => {
  assert.match(
    source,
    /api\.rpc\("thread\/realtime\/appendAudio", \{\s*threadId,\s*audio: audioChunkFromPcm\(pcm, audioCtx\.sampleRate, 1\),\s*\}\)/,
  );
  assert.doesNotMatch(source, /appendAudio", \{ threadId, audioBase64:/);
});

test("plays realtime output audio from params.audio.data with channel metadata", () => {
  assert.match(source, /function audioChunkFromRealtimeParams\(params\) \{/);
  assert.match(source, /typeof audio === "object" && typeof audio\.data === "string"/);
  assert.match(source, /audio\.numChannels/);
  assert.match(source, /audio\.sampleRate/);
});

test("uses the microphone selected in Voice settings when recording", () => {
  assert.match(source, /function getPreferredMicrophoneId\(\) \{/);
  assert.match(source, /deviceId: \{ exact: preferredMicrophoneId \}/);
});
