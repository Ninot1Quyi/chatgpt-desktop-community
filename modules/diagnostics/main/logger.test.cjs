const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createFileLogger,
  redactString,
  safeValue,
} = require("./logger.cjs");

test("diagnostic logger redacts credentials and login query values", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-logs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const logger = createFileLogger({ logsDirectory: root });
  logger.write("error", "renderer", "login_failure", {
    api_key: "api-key-secret",
    authorization: "Bearer should-not-remain",
    message: "request failed?code=login-code&state=session-state token=plain-secret",
    cookie: "cookie-secret",
    nested: { refresh_token: "refresh-secret" },
  });
  const contents = fs.readFileSync(logger.logFile, "utf8");
  assert.doesNotMatch(
    contents,
    /api-key-secret|should-not-remain|login-code|session-state|plain-secret|cookie-secret|refresh-secret/,
  );
  assert.match(contents, /REDACTED/);
});

test("diagnostic values handle errors and circular objects", () => {
  const circular = { name: "example" };
  circular.self = circular;
  const value = safeValue({ error: new Error("boom"), circular });
  assert.equal(value.error.message, "boom");
  assert.equal(value.circular.self, "[CIRCULAR]");
});

test("redaction preserves ordinary diagnostic text", () => {
  assert.equal(redactString("renderer ready"), "renderer ready");
});

test("diagnostic log rotates while the app remains open", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-logs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const logger = createFileLogger({
    logsDirectory: root,
    maxBytes: 100,
    retainedFiles: 2,
  });
  logger.write("info", "renderer", "first", { message: "x".repeat(120) });
  logger.write("info", "renderer", "second", { message: "next" });
  assert.equal(fs.existsSync(`${logger.logFile}.1`), true);
  assert.match(fs.readFileSync(logger.logFile, "utf8"), /"event":"second"/);
});
