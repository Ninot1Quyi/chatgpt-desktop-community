const test = require("node:test");
const assert = require("node:assert/strict");
const {
  kimiPromptArgs,
  validateRun,
} = require("./agent-runtimes");

const catalog = {
  claude: {
    label: "Claude Code",
    available: true,
    models: [{ model: "sonnet" }],
  },
  kimi: {
    label: "Kimi Code",
    available: true,
    models: [{ model: "kimi-code/k3" }],
  },
};

test("runtime validation accepts only a model owned by that runtime", () => {
  assert.doesNotThrow(() => validateRun({ runtime: "claude", model: "sonnet" }, catalog));
  assert.doesNotThrow(() => validateRun({ runtime: "kimi", model: "kimi-code/k3" }, catalog));
  assert.throws(
    () => validateRun({ runtime: "claude", model: "kimi-code/k3" }, catalog),
    /does not belong to Claude Code/,
  );
  assert.throws(
    () => validateRun({ runtime: "kimi", model: "sonnet" }, catalog),
    /does not belong to Kimi Code/,
  );
});

test("runtime validation rejects unavailable and unknown runtimes", () => {
  assert.throws(
    () => validateRun({ runtime: "kimi", model: "kimi-code/k3" }, {
      ...catalog,
      kimi: { ...catalog.kimi, available: false, error: "not signed in" },
    }),
    /not signed in/,
  );
  assert.throws(() => validateRun({ runtime: "codex", model: "gpt" }, catalog), /Unsupported/);
});

test("runtime validation rejects malformed sessions and unsupported effort values", () => {
  const effortCatalog = {
    ...catalog,
    claude: {
      ...catalog.claude,
      models: [{
        model: "sonnet",
        supportedReasoningEfforts: [{ reasoningEffort: "high" }],
      }],
    },
  };
  assert.throws(
    () => validateRun({ runtime: "claude", model: "sonnet", sessionId: "--resume" }, effortCatalog),
    /Invalid Claude Code session ID/,
  );
  assert.throws(
    () => validateRun({ runtime: "claude", model: "sonnet", effort: "ultra" }, effortCatalog),
    /is not available/,
  );
});

test("Kimi prompt arguments omit flags rejected by non-interactive mode", () => {
  for (const permission of ["ask", "approve", "full"]) {
    const args = kimiPromptArgs({
      model: "kimi-code/k3",
      prompt: "hello",
      permission,
      planMode: false,
    }, null);
    assert.deepEqual(args, [
      "-m", "kimi-code/k3",
      "-p", "hello",
      "--output-format", "stream-json",
    ]);
    assert.equal(args.includes("--auto"), false);
    assert.equal(args.includes("--yolo"), false);
    assert.equal(args.includes("--plan"), false);
  }
});

test("Kimi prompt arguments preserve sessions and reject plan mode", () => {
  const sessionId = "session_11111111-1111-1111-1111-111111111111";
  assert.deepEqual(kimiPromptArgs({
    model: "kimi-code/k3",
    prompt: "continue",
    permission: "full",
    planMode: false,
  }, sessionId).slice(0, 2), ["-S", sessionId]);
  assert.throws(
    () => kimiPromptArgs({
      model: "kimi-code/k3",
      prompt: "plan",
      permission: "full",
      planMode: true,
    }, null),
    /does not support plan mode/,
  );
});
