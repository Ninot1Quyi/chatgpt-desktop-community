const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const extractZip = require("extract-zip");

const { getKimiConfigDir } = require("./kimi-history.cjs");

const CLAUDE_MARKETPLACE_NAME = "chatgpt-desktop-community";
const KIMI_MARKETPLACE_URL =
  "https://code.kimi.com/kimi-code/plugins/marketplace.json";
const MAX_PLUGIN_ARCHIVE_BYTES = 64 * 1024 * 1024;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TARGET_LABELS = {
  codex: "Codex",
  claude: "Claude Code",
  kimi: "Kimi Code",
};
const MANIFEST_PATHS = {
  codex: path.join(".codex-plugin", "plugin.json"),
  claude: path.join(".claude-plugin", "plugin.json"),
  kimi: "kimi.plugin.json",
  kimiDirectory: path.join(".kimi-plugin", "plugin.json"),
};

const claudeCatalogCache = new Map();
let kimiCatalogCache = null;
const installQueues = new Map();

function execFileUtf8(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, {
      ...options,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        ...(options.env || {}),
      },
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = String(stderr || stdout || error.message).trim();
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function requireHost(host) {
  if (
    !host ||
    typeof host.resolveClaudeBinary !== "function" ||
    typeof host.resolveKimiBinary !== "function"
  ) {
    throw new Error("Agent runtime host implementation is required");
  }
  return host;
}

function safePluginId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
  if (!PLUGIN_ID_RE.test(normalized)) {
    throw new Error("Plugin metadata does not include a valid plugin name");
  }
  return normalized;
}

function pluginSlug(plugin) {
  const raw = String(plugin?.name || plugin?.id || "").split("@")[0];
  return safePluginId(raw);
}

function pluginSlugCandidates(plugin, targetId) {
  const slug = pluginSlug(plugin);
  const values = [slug];
  if (slug.endsWith("-plugin")) values.push(slug.slice(0, -7));
  else if (targetId === "kimi") values.push(`${slug}-plugin`);
  return [...new Set(values.filter(Boolean))];
}

function parseJsonOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const objectIndex = text.indexOf("{");
  const arrayIndex = text.indexOf("[");
  const start = [objectIndex, arrayIndex]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (start == null) throw new Error("Command did not return JSON");
  return JSON.parse(text.slice(start));
}

async function pathIsDirectory(candidate) {
  try {
    return (await fs.promises.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function pathIsFile(candidate) {
  try {
    return (await fs.promises.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
}

async function localPluginRoot(plugin) {
  const candidates = [
    plugin?.source?.path,
    plugin?.installPath,
    plugin?.root,
    plugin?.path,
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      path.isAbsolute(candidate) &&
      await pathIsDirectory(candidate)
    ) {
      return path.resolve(candidate);
    }
  }
  return null;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

async function hasSkillFile(root) {
  if (await pathIsFile(path.join(root, "SKILL.md"))) return true;
  const skillsRoot = path.join(root, "skills");
  if (!await pathIsDirectory(skillsRoot)) return false;
  const entries = await fs.promises.readdir(skillsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === "skill.md") return true;
    if (
      entry.isDirectory() &&
      await pathIsFile(path.join(skillsRoot, entry.name, "SKILL.md"))
    ) {
      return true;
    }
  }
  return false;
}

async function readSourceManifest(root, targetId) {
  const ordered = targetId === "kimi"
    ? [
      ["kimi", MANIFEST_PATHS.kimi],
      ["kimi", MANIFEST_PATHS.kimiDirectory],
      ["claude", MANIFEST_PATHS.claude],
      ["codex", MANIFEST_PATHS.codex],
    ]
    : [
      ["claude", MANIFEST_PATHS.claude],
      ["codex", MANIFEST_PATHS.codex],
      ["kimi", MANIFEST_PATHS.kimi],
      ["kimi", MANIFEST_PATHS.kimiDirectory],
    ];
  for (const [kind, relativePath] of ordered) {
    const manifestPath = path.join(root, relativePath);
    if (!await pathIsFile(manifestPath)) continue;
    return {
      kind,
      manifestPath,
      raw: await readJsonFile(manifestPath),
      targetNative: kind === targetId,
    };
  }
  if (await hasSkillFile(root)) {
    return {
      kind: "skill",
      manifestPath: null,
      raw: {},
      targetNative: false,
    };
  }
  return null;
}

async function portableCapabilities(root, raw, targetId) {
  const fields = targetId === "kimi"
    ? ["skills", "commands", "hooks", "mcpServers", "sessionStart"]
    : ["skills", "commands", "agents", "hooks", "mcpServers", "lspServers"];
  const capabilities = fields.filter((field) => hasValue(raw?.[field]));
  if (!capabilities.includes("skills") && await hasSkillFile(root)) {
    capabilities.push("skills");
  }
  if (
    !capabilities.includes("commands") &&
    await pathIsDirectory(path.join(root, "commands"))
  ) {
    capabilities.push("commands");
  }
  if (
    !capabilities.includes("agents") &&
    targetId === "claude" &&
    await pathIsDirectory(path.join(root, "agents"))
  ) {
    capabilities.push("agents");
  }
  if (
    !capabilities.includes("mcpServers") &&
    await pathIsFile(path.join(root, ".mcp.json"))
  ) {
    capabilities.push("mcpServers");
  }
  return capabilities;
}

function copyDefinedFields(source, fields) {
  const result = {};
  for (const field of fields) {
    if (source?.[field] !== undefined) result[field] = source[field];
  }
  return result;
}

async function adaptedManifest(root, sourceManifest, targetId, fallbackId) {
  const raw = sourceManifest?.raw || {};
  const nativeName = sourceManifest?.targetNative ? raw.name : null;
  const name = nativeName && PLUGIN_ID_RE.test(String(nativeName).toLowerCase())
    ? String(nativeName).toLowerCase()
    : fallbackId;
  const shared = copyDefinedFields(raw, [
    "version",
    "description",
    "keywords",
    "homepage",
    "license",
    "author",
  ]);
  const targetFields = targetId === "kimi"
    ? ["skills", "commands", "hooks", "mcpServers", "sessionStart", "skillInstructions", "interface"]
    : ["skills", "commands", "agents", "hooks", "mcpServers", "lspServers"];
  const manifest = {
    name,
    ...shared,
    ...copyDefinedFields(raw, targetFields),
  };
  if (manifest.skills === undefined) {
    if (await pathIsFile(path.join(root, "SKILL.md"))) manifest.skills = ".";
    else if (await hasSkillFile(root)) manifest.skills = "./skills/";
  }
  if (
    manifest.commands === undefined &&
    await pathIsDirectory(path.join(root, "commands"))
  ) {
    manifest.commands = "./commands/";
  }
  if (
    targetId === "claude" &&
    manifest.agents === undefined &&
    await pathIsDirectory(path.join(root, "agents"))
  ) {
    manifest.agents = "./agents/";
  }
  if (
    manifest.mcpServers === undefined &&
    await pathIsFile(path.join(root, ".mcp.json"))
  ) {
    manifest.mcpServers = "./.mcp.json";
  }
  return manifest;
}

async function inspectPortableRoot(root, targetId, fallbackId) {
  const sourceManifest = await readSourceManifest(root, targetId);
  if (!sourceManifest) {
    return {
      available: false,
      reason: `This package does not contain a ${TARGET_LABELS[targetId]}-compatible manifest or skill.`,
    };
  }
  const capabilities = await portableCapabilities(
    root,
    sourceManifest.raw,
    targetId,
  );
  if (!capabilities.length) {
    return {
      available: false,
      reason: `This package only contains capabilities that ${TARGET_LABELS[targetId]} cannot install.`,
    };
  }
  const manifest = await adaptedManifest(
    root,
    sourceManifest,
    targetId,
    fallbackId,
  );
  return {
    available: true,
    capabilities,
    manifest,
    pluginId: manifest.name,
    root,
    targetNative: sourceManifest.targetNative,
  };
}

function parseGithubSource(urlValue, extra = {}) {
  if (typeof urlValue !== "string") return null;
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!/^[a-z0-9_.-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(repo)) {
    return null;
  }
  return {
    kind: "github",
    owner,
    repo,
    originalSource: urlValue,
    ref: extra.sha || extra.refName || extra.ref || null,
    refKind: extra.sha ? "sha" : "branch",
    subpath: extra.path || null,
  };
}

async function portableSourcePlan(plugin, targetId) {
  const fallbackId = pluginSlug(plugin);
  const root = await localPluginRoot(plugin);
  if (root) {
    const inspection = await inspectPortableRoot(root, targetId, fallbackId);
    return inspection.available
      ? {
        kind: "local",
        originalSource: root,
        pluginId: inspection.pluginId,
        root,
      }
      : inspection;
  }
  if (plugin?.source?.type === "git") {
    const github = parseGithubSource(plugin.source.url, plugin.source);
    if (github) return { ...github, pluginId: fallbackId };
  }
  return {
    available: false,
    reason: `No ${TARGET_LABELS[targetId]}-compatible package is published for this plugin.`,
  };
}

function installedSlug(id) {
  return String(id || "").split("@")[0].toLowerCase();
}

async function loadClaudeCatalog(binary, execImpl, useCache) {
  const cached = claudeCatalogCache.get(binary);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.value;
  let value;
  try {
    const { stdout } = await execImpl(
      binary,
      ["plugin", "list", "--available", "--json"],
      { timeout: 30000 },
    );
    const parsed = parseJsonOutput(stdout);
    value = Array.isArray(parsed)
      ? { installed: parsed, available: [] }
      : {
        installed: Array.isArray(parsed?.installed) ? parsed.installed : [],
        available: Array.isArray(parsed?.available) ? parsed.available : [],
      };
  } catch (availableError) {
    try {
      const { stdout } = await execImpl(
        binary,
        ["plugin", "list", "--json"],
        { timeout: 15000 },
      );
      const parsed = parseJsonOutput(stdout);
      value = {
        installed: Array.isArray(parsed) ? parsed : [],
        available: [],
        availableError: availableError.message,
      };
    } catch (error) {
      throw new Error(`Claude Code plugin catalog failed: ${error.message}`);
    }
  }
  if (useCache) {
    claudeCatalogCache.set(binary, {
      expiresAt: Date.now() + 30000,
      value,
    });
  }
  return value;
}

function findClaudeCatalogPlugin(catalog, candidates) {
  for (const candidate of candidates) {
    const entry = catalog.available.find((item) =>
      String(item?.name || installedSlug(item?.pluginId)).toLowerCase() === candidate
    );
    if (entry) return entry;
  }
  return null;
}

async function fetchJson(url, fetchImpl, timeoutMs = 20000) {
  if (typeof fetchImpl !== "function") throw new Error("Network access is unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": "ChatGPT-Desktop-Community" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadKimiMarketplace(fetchImpl, useCache) {
  if (
    useCache &&
    kimiCatalogCache &&
    kimiCatalogCache.expiresAt > Date.now()
  ) {
    return kimiCatalogCache.value;
  }
  const parsed = await fetchJson(KIMI_MARKETPLACE_URL, fetchImpl);
  const value = {
    plugins: Array.isArray(parsed?.plugins) ? parsed.plugins : [],
  };
  if (useCache) {
    kimiCatalogCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value,
    };
  }
  return value;
}

function findKimiMarketplacePlugin(catalog, candidates) {
  for (const candidate of candidates) {
    const entry = catalog.plugins.find((item) =>
      String(item?.id || "").toLowerCase() === candidate
    );
    if (entry) return entry;
  }
  return null;
}

async function readKimiInstalled(kimiHomeDir) {
  const filePath = path.join(kimiHomeDir, "plugins", "installed.json");
  try {
    const parsed = await readJsonFile(filePath);
    if (!parsed || !Array.isArray(parsed.plugins)) {
      throw new Error("installed.json is not a valid InstalledFile object");
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, plugins: [] };
    throw new Error(`Failed to read Kimi Code plugins: ${error.message}`);
  }
}

function publicTarget(target) {
  return {
    id: target.id,
    label: target.label,
    available: target.available,
    installed: target.installed,
    description: target.description || null,
    reason: target.reason || null,
  };
}

async function resolveClaudeTarget({
  env,
  execImpl,
  homePath,
  host,
  plugin,
  useCache,
}) {
  const binary = requireHost(host).resolveClaudeBinary(homePath, env);
  if (!binary) {
    return {
      id: "claude",
      label: TARGET_LABELS.claude,
      available: false,
      installed: false,
      reason: "Claude Code CLI was not found.",
    };
  }
  let catalog;
  try {
    catalog = await loadClaudeCatalog(binary, execImpl, useCache);
  } catch (error) {
    catalog = { installed: [], available: [], availableError: error.message };
  }
  const candidates = pluginSlugCandidates(plugin, "claude");
  const nativePlugin = findClaudeCatalogPlugin(catalog, candidates);
  const portable = nativePlugin ? null : await portableSourcePlan(plugin, "claude");
  const targetPluginId = nativePlugin?.pluginId || portable?.pluginId || candidates[0];
  const installed = catalog.installed.some((entry) =>
    installedSlug(entry?.id) === String(targetPluginId).toLowerCase() ||
    candidates.includes(installedSlug(entry?.id))
  );
  if (installed) {
    return {
      id: "claude",
      label: TARGET_LABELS.claude,
      available: true,
      installed: true,
      description: "Installed for Claude Code",
      binary,
      installId: targetPluginId,
      plan: nativePlugin
        ? { kind: "claude-marketplace", pluginId: nativePlugin.pluginId }
        : portable,
    };
  }
  if (nativePlugin) {
    return {
      id: "claude",
      label: TARGET_LABELS.claude,
      available: true,
      installed: false,
      description: `Available from ${nativePlugin.marketplaceName || "a Claude marketplace"}`,
      binary,
      installId: nativePlugin.pluginId,
      plan: { kind: "claude-marketplace", pluginId: nativePlugin.pluginId },
    };
  }
  if (portable?.kind) {
    return {
      id: "claude",
      label: TARGET_LABELS.claude,
      available: true,
      installed: false,
      description: "A compatible local package will be installed",
      binary,
      installId: portable.pluginId,
      plan: portable,
    };
  }
  return {
    id: "claude",
    label: TARGET_LABELS.claude,
    available: false,
    installed: false,
    reason: portable?.reason || catalog.availableError ||
      "No Claude Code-compatible package was found.",
    binary,
  };
}

async function resolveKimiTarget({
  env,
  fetchImpl,
  homePath,
  host,
  plugin,
  useCache,
}) {
  const binary = requireHost(host).resolveKimiBinary(homePath, env);
  if (!binary) {
    return {
      id: "kimi",
      label: TARGET_LABELS.kimi,
      available: false,
      installed: false,
      reason: "Kimi Code CLI was not found.",
    };
  }
  const kimiHomeDir = getKimiConfigDir(homePath, env);
  let installedFile;
  try {
    installedFile = await readKimiInstalled(kimiHomeDir);
  } catch (error) {
    return {
      id: "kimi",
      label: TARGET_LABELS.kimi,
      available: false,
      installed: false,
      reason: error.message,
      binary,
      kimiHomeDir,
    };
  }
  const candidates = pluginSlugCandidates(plugin, "kimi");
  let catalog = { plugins: [] };
  let catalogError = null;
  try {
    catalog = await loadKimiMarketplace(fetchImpl, useCache);
  } catch (error) {
    catalogError = `Kimi marketplace failed: ${error.message}`;
  }
  const nativePlugin = findKimiMarketplacePlugin(catalog, candidates);
  const portable = nativePlugin ? null : await portableSourcePlan(plugin, "kimi");
  const targetPluginId = nativePlugin?.id || portable?.pluginId || candidates[0];
  const installed = installedFile.plugins.some((entry) =>
    String(entry?.id || "").toLowerCase() === String(targetPluginId).toLowerCase() ||
    candidates.includes(String(entry?.id || "").toLowerCase())
  );
  if (installed) {
    return {
      id: "kimi",
      label: TARGET_LABELS.kimi,
      available: true,
      installed: true,
      description: "Installed for Kimi Code",
      binary,
      installId: targetPluginId,
      kimiHomeDir,
      plan: nativePlugin
        ? {
          kind: "kimi-marketplace",
          originalSource: nativePlugin.source,
          pluginId: nativePlugin.id,
          source: nativePlugin.source,
        }
        : portable,
    };
  }
  if (nativePlugin) {
    return {
      id: "kimi",
      label: TARGET_LABELS.kimi,
      available: true,
      installed: false,
      description: `Available from the ${nativePlugin.tier || "Kimi"} marketplace`,
      binary,
      installId: nativePlugin.id,
      kimiHomeDir,
      plan: {
        kind: "kimi-marketplace",
        originalSource: nativePlugin.source,
        pluginId: nativePlugin.id,
        source: nativePlugin.source,
      },
    };
  }
  if (portable?.kind) {
    return {
      id: "kimi",
      label: TARGET_LABELS.kimi,
      available: true,
      installed: false,
      description: "A compatible local package will be installed",
      binary,
      installId: portable.pluginId,
      kimiHomeDir,
      plan: portable,
    };
  }
  return {
    id: "kimi",
    label: TARGET_LABELS.kimi,
    available: false,
    installed: false,
    reason: portable?.reason || catalogError ||
      "No Kimi Code-compatible package was found.",
    binary,
    kimiHomeDir,
  };
}

async function getPluginInstallTargets({
  env = process.env,
  execImpl = execFileUtf8,
  fetchImpl = globalThis.fetch,
  homePath,
  host,
  plugin,
} = {}) {
  pluginSlug(plugin);
  const useCache =
    execImpl === execFileUtf8 &&
    fetchImpl === globalThis.fetch;
  const [claude, kimi] = await Promise.all([
    resolveClaudeTarget({
      env,
      execImpl,
      homePath,
      host,
      plugin,
      useCache,
    }),
    resolveKimiTarget({
      env,
      fetchImpl,
      homePath,
      host,
      plugin,
      useCache,
    }),
  ]);
  return {
    targets: [
      {
        id: "codex",
        label: TARGET_LABELS.codex,
        available: true,
        installed: plugin?.installed === true,
        description: plugin?.installed
          ? "Installed for Codex"
          : "Available from this Codex marketplace",
      },
      publicTarget(claude),
      publicTarget(kimi),
    ],
  };
}

function validateSubpath(value) {
  if (!value) return null;
  const normalized = path.normalize(String(value));
  if (
    path.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Plugin source contains an invalid subdirectory");
  }
  return normalized;
}

async function downloadArchive(url, fetchImpl, destination) {
  if (typeof fetchImpl !== "function") throw new Error("Network access is unavailable");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Plugin archives must use HTTPS");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": "ChatGPT-Desktop-Community" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Plugin download failed: HTTP ${response.status} ${response.statusText || ""}`.trim());
    }
    const declaredSize = Number(response.headers?.get?.("content-length") || 0);
    if (declaredSize > MAX_PLUGIN_ARCHIVE_BYTES) {
      throw new Error("Plugin archive exceeds the 64 MB limit");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PLUGIN_ARCHIVE_BYTES) {
      throw new Error("Plugin archive exceeds the 64 MB limit");
    }
    await fs.promises.writeFile(destination, buffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function findExtractedRoot(directory, preferredId) {
  const direct = await readSourceManifest(directory, "kimi");
  if (direct) return directory;
  const queue = [{ directory, depth: 0 }];
  const matches = [];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= 3) continue;
    const entries = await fs.promises.readdir(current.directory, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(current.directory, entry.name);
      if (await readSourceManifest(child, "kimi")) matches.push(child);
      else queue.push({ directory: child, depth: current.depth + 1 });
    }
  }
  if (!matches.length) {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    const childDirectories = entries.filter((entry) => entry.isDirectory());
    if (childDirectories.length === 1) {
      return path.join(directory, childDirectories[0].name);
    }
    return directory;
  }
  return matches.find((candidate) => {
    try {
      return safePluginId(path.basename(candidate)) === preferredId;
    } catch {
      return false;
    }
  }) || matches[0];
}

async function materializeGithub(plan, fetchImpl) {
  const tempRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "community-plugin-"),
  );
  try {
    const ref = plan.ref || "HEAD";
    const archiveUrl =
      `https://codeload.github.com/${plan.owner}/${plan.repo}/zip/${encodeURIComponent(ref)}`;
    const archivePath = path.join(tempRoot, "plugin.zip");
    const extractRoot = path.join(tempRoot, "extracted");
    await downloadArchive(archiveUrl, fetchImpl, archivePath);
    await fs.promises.mkdir(extractRoot, { recursive: true });
    await extractZip(archivePath, { dir: extractRoot });
    const subpath = validateSubpath(plan.subpath);
    let root;
    if (subpath) {
      const entries = await fs.promises.readdir(extractRoot, {
        withFileTypes: true,
      });
      const directories = entries.filter((entry) => entry.isDirectory());
      const repositoryRoot = directories.length === 1
        ? path.join(extractRoot, directories[0].name)
        : extractRoot;
      root = await findExtractedRoot(
        path.join(repositoryRoot, subpath),
        plan.pluginId,
      );
    } else {
      root = await findExtractedRoot(extractRoot, plan.pluginId);
    }
    if (!await pathIsDirectory(root)) {
      throw new Error("The plugin subdirectory was not found in the GitHub package");
    }
    return {
      cleanup: () => fs.promises.rm(tempRoot, { recursive: true, force: true }),
      github: {
        owner: plan.owner,
        repo: plan.repo,
        ref: {
          kind: plan.refKind || "branch",
          value: ref,
        },
      },
      originalSource: plan.originalSource,
      root,
      sourceType: "github",
    };
  } catch (error) {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function materializeZip(source, pluginId, fetchImpl) {
  const tempRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "community-plugin-"),
  );
  try {
    const archivePath = path.join(tempRoot, "plugin.zip");
    const extractRoot = path.join(tempRoot, "extracted");
    await downloadArchive(source, fetchImpl, archivePath);
    await fs.promises.mkdir(extractRoot, { recursive: true });
    await extractZip(archivePath, { dir: extractRoot });
    const root = await findExtractedRoot(extractRoot, pluginId);
    return {
      cleanup: () => fs.promises.rm(tempRoot, { recursive: true, force: true }),
      originalSource: source,
      root,
      sourceType: "zip-url",
    };
  } catch (error) {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function materializePlan(plan, fetchImpl) {
  if (plan.kind === "local") {
    return {
      cleanup: async () => {},
      originalSource: plan.originalSource,
      root: plan.root,
      sourceType: "local-path",
    };
  }
  if (plan.kind === "github") return materializeGithub(plan, fetchImpl);
  if (plan.kind === "kimi-marketplace") {
    const resolved = new URL(plan.source, KIMI_MARKETPLACE_URL).href;
    const github = parseGithubSource(resolved);
    if (github) {
      return materializeGithub({
        ...github,
        pluginId: plan.pluginId,
      }, fetchImpl);
    }
    return materializeZip(resolved, plan.pluginId, fetchImpl);
  }
  throw new Error("The selected provider does not have an installable package");
}

async function prepareManagedCopy({
  destinationParent,
  fallbackId,
  sourceRoot,
  targetId,
}) {
  await fs.promises.mkdir(destinationParent, { recursive: true });
  const stagingRoot = path.join(
    destinationParent,
    `.${fallbackId}-staging-${crypto.randomUUID()}`,
  );
  await fs.promises.cp(sourceRoot, stagingRoot, { recursive: true });
  try {
    const inspection = await inspectPortableRoot(
      stagingRoot,
      targetId,
      fallbackId,
    );
    if (!inspection.available) throw new Error(inspection.reason);
    const relativeManifest = targetId === "kimi"
      ? MANIFEST_PATHS.kimiDirectory
      : MANIFEST_PATHS.claude;
    const nativeManifest = targetId === "kimi"
      ? (
        await pathIsFile(path.join(stagingRoot, MANIFEST_PATHS.kimi)) ||
        await pathIsFile(path.join(stagingRoot, MANIFEST_PATHS.kimiDirectory))
      )
      : await pathIsFile(path.join(stagingRoot, MANIFEST_PATHS.claude));
    if (!nativeManifest) {
      const manifestPath = path.join(stagingRoot, relativeManifest);
      await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.promises.writeFile(
        manifestPath,
        `${JSON.stringify(inspection.manifest, null, 2)}\n`,
        "utf8",
      );
    }
    return {
      pluginId: inspection.pluginId,
      stagingRoot,
    };
  } catch (error) {
    await fs.promises.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

async function publishPreparedCopy(stagingRoot, finalRoot) {
  const backupRoot = `${finalRoot}.backup-${crypto.randomUUID()}`;
  let movedPrevious = false;
  let published = false;
  try {
    try {
      await fs.promises.rename(finalRoot, backupRoot);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.promises.rename(stagingRoot, finalRoot);
    published = true;
    return {
      finalize: async () => {
        if (movedPrevious) {
          await fs.promises.rm(backupRoot, { recursive: true, force: true });
        }
      },
      rollback: async () => {
        if (published) {
          await fs.promises.rm(finalRoot, { recursive: true, force: true });
        }
        if (movedPrevious) await fs.promises.rename(backupRoot, finalRoot);
      },
    };
  } catch (error) {
    await fs.promises.rm(
      published ? finalRoot : stagingRoot,
      { recursive: true, force: true },
    );
    if (movedPrevious) await fs.promises.rename(backupRoot, finalRoot);
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${crypto.randomUUID()}`;
  const backupPath = `${filePath}.backup-${crypto.randomUUID()}`;
  let movedPrevious = false;
  try {
    await fs.promises.writeFile(
      tempPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
    try {
      await fs.promises.rename(filePath, backupPath);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.promises.rename(tempPath, filePath);
    if (movedPrevious) await fs.promises.rm(backupPath, { force: true });
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true });
    if (movedPrevious) {
      await fs.promises.rm(filePath, { force: true });
      await fs.promises.rename(backupPath, filePath);
    }
    throw error;
  }
}

async function installClaudePortable({
  binary,
  execImpl,
  fetchImpl,
  plan,
  userDataPath,
}) {
  const materialized = await materializePlan(plan, fetchImpl);
  let publication = null;
  try {
    const marketplaceRoot = path.join(
      userDataPath,
      "provider-plugins",
      "claude-marketplace",
    );
    const pluginsRoot = path.join(marketplaceRoot, "plugins");
    const prepared = await prepareManagedCopy({
      destinationParent: pluginsRoot,
      fallbackId: plan.pluginId,
      sourceRoot: materialized.root,
      targetId: "claude",
    });
    const finalRoot = path.join(pluginsRoot, prepared.pluginId);
    publication = await publishPreparedCopy(prepared.stagingRoot, finalRoot);
    const marketplacePath = path.join(
      marketplaceRoot,
      ".claude-plugin",
      "marketplace.json",
    );
    let marketplace = {
      name: CLAUDE_MARKETPLACE_NAME,
      owner: { name: "ChatGPT Desktop Community" },
      plugins: [],
    };
    try {
      const existing = await readJsonFile(marketplacePath);
      if (Array.isArray(existing?.plugins)) marketplace = existing;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const entry = {
      name: prepared.pluginId,
      source: `./plugins/${prepared.pluginId}`,
      description: "Installed by ChatGPT Desktop Community",
    };
    marketplace = {
      ...marketplace,
      name: CLAUDE_MARKETPLACE_NAME,
      owner: marketplace.owner || { name: "ChatGPT Desktop Community" },
      plugins: [
        ...marketplace.plugins.filter((item) => item?.name !== prepared.pluginId),
        entry,
      ],
    };
    await writeJsonAtomic(marketplacePath, marketplace);
    let marketplaces = [];
    try {
      const { stdout } = await execImpl(
        binary,
        ["plugin", "marketplace", "list", "--json"],
        { timeout: 15000 },
      );
      const parsed = parseJsonOutput(stdout);
      marketplaces = Array.isArray(parsed) ? parsed : [];
    } catch {}
    if (marketplaces.some((item) => item?.name === CLAUDE_MARKETPLACE_NAME)) {
      await execImpl(
        binary,
        ["plugin", "marketplace", "update", CLAUDE_MARKETPLACE_NAME],
        { timeout: 60000 },
      );
    } else {
      await execImpl(
        binary,
        ["plugin", "marketplace", "add", marketplaceRoot, "--scope", "user"],
        { timeout: 60000 },
      );
    }
    await execImpl(
      binary,
      [
        "plugin",
        "install",
        `${prepared.pluginId}@${CLAUDE_MARKETPLACE_NAME}`,
        "--scope",
        "user",
      ],
      { timeout: 120000 },
    );
    await publication.finalize();
    claudeCatalogCache.delete(binary);
    return { pluginId: prepared.pluginId };
  } catch (error) {
    if (publication) await publication.rollback().catch(() => {});
    throw error;
  } finally {
    await materialized.cleanup();
  }
}

async function installKimiPortable({
  fetchImpl,
  kimiHomeDir,
  plan,
}) {
  const materialized = await materializePlan(plan, fetchImpl);
  let publication = null;
  try {
    const pluginsRoot = path.join(kimiHomeDir, "plugins", "managed");
    const prepared = await prepareManagedCopy({
      destinationParent: pluginsRoot,
      fallbackId: plan.pluginId,
      sourceRoot: materialized.root,
      targetId: "kimi",
    });
    const finalRoot = path.join(pluginsRoot, prepared.pluginId);
    publication = await publishPreparedCopy(prepared.stagingRoot, finalRoot);
    const installed = await readKimiInstalled(kimiHomeDir);
    const existing = installed.plugins.find((entry) =>
      String(entry?.id || "").toLowerCase() === prepared.pluginId
    );
    const now = new Date().toISOString();
    const record = {
      id: prepared.pluginId,
      root: await fs.promises.realpath(finalRoot),
      source: materialized.sourceType,
      enabled: existing?.enabled ?? true,
      installedAt: existing?.installedAt || now,
      updatedAt: now,
      originalSource: materialized.originalSource,
      ...(existing?.capabilities !== undefined
        ? { capabilities: existing.capabilities }
        : {}),
      ...(materialized.github ? { github: materialized.github } : {}),
    };
    const next = {
      ...installed,
      version: 1,
      plugins: [
        ...installed.plugins.filter((entry) =>
          String(entry?.id || "").toLowerCase() !== prepared.pluginId
        ),
        record,
      ],
    };
    await writeJsonAtomic(
      path.join(kimiHomeDir, "plugins", "installed.json"),
      next,
    );
    await publication.finalize();
    return { pluginId: prepared.pluginId };
  } catch (error) {
    if (publication) await publication.rollback().catch(() => {});
    throw error;
  } finally {
    await materialized.cleanup();
  }
}

function withInstallQueue(runtime, operation) {
  const previous = installQueues.get(runtime) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  installQueues.set(runtime, current);
  return current.finally(() => {
    if (installQueues.get(runtime) === current) installQueues.delete(runtime);
  });
}

async function installPluginForRuntime({
  env = process.env,
  execImpl = execFileUtf8,
  fetchImpl = globalThis.fetch,
  homePath,
  host,
  plugin,
  runtime,
  userDataPath,
} = {}) {
  if (runtime !== "claude" && runtime !== "kimi") {
    throw new Error(`Unsupported plugin install target "${runtime || "unknown"}"`);
  }
  if (!userDataPath) throw new Error("Application data path is required");
  return withInstallQueue(runtime, async () => {
    const useCache = false;
    if (runtime === "claude") {
      const target = await resolveClaudeTarget({
        env,
        execImpl,
        homePath,
        host,
        plugin,
        useCache,
      });
      if (target.installed) {
        return { alreadyInstalled: true, pluginId: target.installId, runtime };
      }
      if (!target.available || !target.plan) {
        throw new Error(target.reason || "This plugin is not available for Claude Code");
      }
      if (target.plan.kind === "claude-marketplace") {
        await execImpl(
          target.binary,
          ["plugin", "install", target.plan.pluginId, "--scope", "user"],
          { timeout: 120000 },
        );
        claudeCatalogCache.delete(target.binary);
        return { pluginId: target.plan.pluginId, runtime };
      }
      const result = await installClaudePortable({
        binary: target.binary,
        execImpl,
        fetchImpl,
        plan: target.plan,
        userDataPath,
      });
      return { ...result, runtime };
    }
    const target = await resolveKimiTarget({
      env,
      fetchImpl,
      homePath,
      host,
      plugin,
      useCache,
    });
    if (target.installed) {
      return { alreadyInstalled: true, pluginId: target.installId, runtime };
    }
    if (!target.available || !target.plan) {
      throw new Error(target.reason || "This plugin is not available for Kimi Code");
    }
    const result = await installKimiPortable({
      fetchImpl,
      kimiHomeDir: target.kimiHomeDir,
      plan: target.plan,
    });
    return { ...result, runtime };
  });
}

module.exports = {
  CLAUDE_MARKETPLACE_NAME,
  KIMI_MARKETPLACE_URL,
  adaptedManifest,
  getPluginInstallTargets,
  inspectPortableRoot,
  installPluginForRuntime,
  pluginSlug,
  readKimiInstalled,
  safePluginId,
};
