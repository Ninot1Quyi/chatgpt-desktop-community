const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  CLAUDE_MARKETPLACE_NAME,
  getPluginInstallTargets,
  installPluginForRuntime,
  pluginSlug,
} = require("./plugin-targets.cjs");

const fakeHost = {
  resolveClaudeBinary: () => "claude",
  resolveKimiBinary: () => "kimi",
};

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    json: async () => value,
  };
}

async function createPortablePlugin(root, name = "demo-plugin") {
  const pluginRoot = path.join(root, "source");
  await fs.promises.mkdir(
    path.join(pluginRoot, ".codex-plugin"),
    { recursive: true },
  );
  await fs.promises.mkdir(
    path.join(pluginRoot, "skills", "demo"),
    { recursive: true },
  );
  await fs.promises.writeFile(
    path.join(pluginRoot, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      description: "Portable test plugin",
      skills: ["./skills/"],
    }),
  );
  await fs.promises.writeFile(
    path.join(pluginRoot, "skills", "demo", "SKILL.md"),
    "---\ndescription: Demo\n---\n\nRun the demo.\n",
  );
  return pluginRoot;
}

function emptyCatalogExec(calls = []) {
  return async (_binary, args) => {
    calls.push(args);
    if (args.join(" ") === "plugin list --available --json") {
      return {
        stdout: JSON.stringify({ installed: [], available: [] }),
        stderr: "",
      };
    }
    if (args.join(" ") === "plugin marketplace list --json") {
      return { stdout: "[]", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
}

test("plugin slugs are normalized for provider package identifiers", () => {
  assert.equal(pluginSlug({ id: "Vercel.Plugin@personal" }), "vercel-plugin");
  assert.throws(() => pluginSlug({}), /valid plugin name/);
});

test("local Codex skill packages are offered to every installed runtime", async (t) => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "community-plugin-targets-"),
  );
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const pluginRoot = await createPortablePlugin(root);
  const result = await getPluginInstallTargets({
    env: { KIMI_CODE_HOME: path.join(root, "kimi") },
    execImpl: emptyCatalogExec(),
    fetchImpl: async () => jsonResponse({ version: "1", plugins: [] }),
    homePath: root,
    host: fakeHost,
    plugin: {
      id: "demo-plugin@personal",
      name: "demo-plugin",
      source: { type: "local", path: pluginRoot },
    },
  });

  assert.deepEqual(
    result.targets.map((target) => [target.id, target.available, target.installed]),
    [
      ["codex", true, false],
      ["claude", true, false],
      ["kimi", true, false],
    ],
  );
});

test("provider-native marketplace packages are preferred by slug", async (t) => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "community-plugin-native-"),
  );
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const result = await getPluginInstallTargets({
    env: { KIMI_CODE_HOME: path.join(root, "kimi") },
    execImpl: async () => ({
      stdout: JSON.stringify({
        installed: [],
        available: [{
          pluginId: "vercel@claude-plugins-official",
          name: "vercel",
          marketplaceName: "claude-plugins-official",
        }],
      }),
      stderr: "",
    }),
    fetchImpl: async () => jsonResponse({
      version: "1",
      plugins: [{
        id: "vercel-plugin",
        tier: "curated",
        source: "https://github.com/vercel/vercel-plugin",
      }],
    }),
    homePath: root,
    host: fakeHost,
    plugin: {
      id: "vercel@openai-curated-remote",
      name: "vercel",
      source: { type: "remote" },
    },
  });

  assert.equal(result.targets.find((target) => target.id === "claude").available, true);
  assert.equal(result.targets.find((target) => target.id === "kimi").available, true);
});

test("Kimi installation creates a managed copy and preserves its registry", async (t) => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "community-plugin-kimi-"),
  );
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const pluginRoot = await createPortablePlugin(root);
  const kimiHome = path.join(root, "kimi");
  await fs.promises.mkdir(path.join(kimiHome, "plugins"), { recursive: true });
  await fs.promises.writeFile(
    path.join(kimiHome, "plugins", "installed.json"),
    JSON.stringify({
      version: 1,
      plugins: [{
        id: "existing",
        root: path.join(root, "existing"),
        source: "local-path",
        enabled: false,
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    }),
  );

  const result = await installPluginForRuntime({
    env: { KIMI_CODE_HOME: kimiHome },
    execImpl: emptyCatalogExec(),
    fetchImpl: async () => jsonResponse({ version: "1", plugins: [] }),
    homePath: root,
    host: fakeHost,
    plugin: {
      id: "demo-plugin@personal",
      name: "demo-plugin",
      source: { type: "local", path: pluginRoot },
    },
    runtime: "kimi",
    userDataPath: path.join(root, "app-data"),
  });

  assert.equal(result.pluginId, "demo-plugin");
  const managedRoot = path.join(
    kimiHome,
    "plugins",
    "managed",
    "demo-plugin",
  );
  assert.equal(
    await fs.promises.readFile(
      path.join(managedRoot, ".kimi-plugin", "plugin.json"),
      "utf8",
    ).then((text) => JSON.parse(text).name),
    "demo-plugin",
  );
  const installed = JSON.parse(await fs.promises.readFile(
    path.join(kimiHome, "plugins", "installed.json"),
    "utf8",
  ));
  assert.deepEqual(
    installed.plugins.map((entry) => entry.id).sort(),
    ["demo-plugin", "existing"],
  );
  assert.equal(
    installed.plugins.find((entry) => entry.id === "existing").enabled,
    false,
  );
});

test("Claude installation registers the app-managed marketplace", async (t) => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "community-plugin-claude-"),
  );
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const pluginRoot = await createPortablePlugin(root);
  const calls = [];
  const userDataPath = path.join(root, "app-data");

  const result = await installPluginForRuntime({
    env: { KIMI_CODE_HOME: path.join(root, "kimi") },
    execImpl: emptyCatalogExec(calls),
    fetchImpl: async () => jsonResponse({ version: "1", plugins: [] }),
    homePath: root,
    host: fakeHost,
    plugin: {
      id: "demo-plugin@personal",
      name: "demo-plugin",
      source: { type: "local", path: pluginRoot },
    },
    runtime: "claude",
    userDataPath,
  });

  assert.equal(result.pluginId, "demo-plugin");
  assert.ok(calls.some((args) =>
    args[0] === "plugin" &&
    args[1] === "marketplace" &&
    args[2] === "add"
  ));
  assert.ok(calls.some((args) =>
    args.join(" ") ===
    `plugin install demo-plugin@${CLAUDE_MARKETPLACE_NAME} --scope user`
  ));
  const marketplace = JSON.parse(await fs.promises.readFile(
    path.join(
      userDataPath,
      "provider-plugins",
      "claude-marketplace",
      ".claude-plugin",
      "marketplace.json",
    ),
    "utf8",
  ));
  assert.equal(marketplace.name, CLAUDE_MARKETPLACE_NAME);
  assert.equal(marketplace.plugins[0].name, "demo-plugin");
});

test("remote-only plugins without a provider package remain unavailable", async (t) => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "community-plugin-unavailable-"),
  );
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const result = await getPluginInstallTargets({
    env: { KIMI_CODE_HOME: path.join(root, "kimi") },
    execImpl: emptyCatalogExec(),
    fetchImpl: async () => jsonResponse({ version: "1", plugins: [] }),
    homePath: root,
    host: fakeHost,
    plugin: {
      id: "codex-only@openai-curated-remote",
      name: "codex-only",
      source: { type: "remote" },
    },
  });

  assert.equal(result.targets.find((target) => target.id === "claude").available, false);
  assert.equal(result.targets.find((target) => target.id === "kimi").available, false);
});
