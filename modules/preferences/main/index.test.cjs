const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { migratePreferences } = require("./index.cjs");

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "community-prefs-"));
}

test("migrates the newest valid legacy preference file", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const noma = path.join(root, "Noma", "renderer-prefs.json");
  const rebuilt = path.join(root, "codex-desktop-rebuilt", "renderer-prefs.json");
  const destination = path.join(root, "ChatGPT Desktop Community", "renderer-prefs.json");
  fs.mkdirSync(path.dirname(noma), { recursive: true });
  fs.mkdirSync(path.dirname(rebuilt), { recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(noma, JSON.stringify({ source: "noma" }));
  fs.writeFileSync(rebuilt, JSON.stringify({ source: "rebuilt" }));
  fs.utimesSync(noma, new Date(1_000), new Date(1_000));
  fs.utimesSync(rebuilt, new Date(2_000), new Date(2_000));

  const selected = migratePreferences({
    destination,
    fs,
    legacyPreferencePaths: [noma, rebuilt],
    logger: {},
  });

  assert.equal(selected, rebuilt);
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, "utf8")), {
    source: "rebuilt",
  });
});

test("ignores invalid legacy data and never overwrites new preferences", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const invalid = path.join(root, "Noma", "renderer-prefs.json");
  const destination = path.join(root, "ChatGPT Desktop Community", "renderer-prefs.json");
  fs.mkdirSync(path.dirname(invalid), { recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(invalid, "{not-json");
  fs.writeFileSync(destination, JSON.stringify({ keep: true }));

  const selected = migratePreferences({
    destination,
    fs,
    legacyPreferencePaths: [invalid],
    logger: {},
  });

  assert.equal(selected, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, "utf8")), {
    keep: true,
  });
  assert.deepEqual(
    fs.readdirSync(path.dirname(destination)),
    ["renderer-prefs.json"],
  );
});
