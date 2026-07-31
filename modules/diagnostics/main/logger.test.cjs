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

test("diagnostic logger writes each local calendar day to a separate file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-daily-logs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let currentDate = new Date(2026, 6, 30, 23, 59, 0);
  const logger = createFileLogger({
    logsDirectory: root,
    now: () => currentDate,
  });

  logger.write("info", "main", "first_day");
  const firstFile = path.join(root, "main-2026-07-30.log");
  assert.equal(logger.logFile, firstFile);
  assert.match(fs.readFileSync(firstFile, "utf8"), /"event":"first_day"/);

  currentDate = new Date(2026, 6, 31, 0, 1, 0);
  logger.write("info", "main", "second_day");
  const secondFile = path.join(root, "main-2026-07-31.log");
  assert.equal(logger.logFile, secondFile);
  assert.match(fs.readFileSync(secondFile, "utf8"), /"event":"second_day"/);
  assert.doesNotMatch(fs.readFileSync(firstFile, "utf8"), /second_day/);
});

test("diagnostic logger retains today and the previous six local calendar days", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-retained-logs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const expiredDated = path.join(root, "main-2026-07-23.log");
  const retainedBoundary = path.join(root, "main-2026-07-24.log");
  const retainedRotation = path.join(root, "main-2026-07-30.log.1");
  const expiredLegacy = path.join(root, "main.log");
  const unrelated = path.join(root, "notes.txt");
  for (const file of [
    expiredDated,
    retainedBoundary,
    retainedRotation,
    expiredLegacy,
    unrelated,
  ]) {
    fs.writeFileSync(file, "test", "utf8");
  }
  const oldTime = new Date(2026, 6, 1, 12, 0, 0);
  fs.utimesSync(expiredLegacy, oldTime, oldTime);

  createFileLogger({
    logsDirectory: root,
    now: () => new Date(2026, 6, 30, 12, 0, 0),
  });

  assert.equal(fs.existsSync(expiredDated), false);
  assert.equal(fs.existsSync(expiredLegacy), false);
  assert.equal(fs.existsSync(retainedBoundary), true);
  assert.equal(fs.existsSync(retainedRotation), true);
  assert.equal(fs.existsSync(unrelated), true);
});
