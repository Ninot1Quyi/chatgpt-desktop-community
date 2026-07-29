import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TARGETS,
  buildImplementation,
  mainAliases,
  rendererAliases,
} from "../build/targets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const sourceExtensions = new Set([".js", ".jsx", ".cjs", ".mjs"]);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll("\\", "/");
}

const sharedSource = [
  ...walk(path.join(repoRoot, "main")),
  ...walk(path.join(repoRoot, "renderer", "src")),
  ...walk(path.join(repoRoot, "modules")),
].filter((file) => (
  sourceExtensions.has(path.extname(file)) &&
  !relative(file).includes("/implementations/")
));

const bannedSharedPatterns = [
  [/\bprocess\.platform\b/, "process.platform"],
  [/\bnavigator\.platform\b/, "navigator.platform"],
  [/\bappInfo\.platform\b/, "appInfo.platform"],
  [/\bisWin\b/, "isWin"],
  [/\bisMac\b/, "isMac"],
];

for (const file of sharedSource) {
  const text = fs.readFileSync(file, "utf8");
  for (const [pattern, label] of bannedSharedPatterns) {
    if (pattern.test(text)) errors.push(`${relative(file)} contains ${label}`);
  }
  if (/from\s+["'][^"']*\/implementations\//.test(text) ||
      /require\(["'][^"']*\/implementations\//.test(text)) {
    errors.push(`${relative(file)} imports another implementation directory`);
  }
}

const compositionRoot = path.join(repoRoot, "main", "index.js");
if (/require\(["']\.\.\/modules\//.test(fs.readFileSync(compositionRoot, "utf8"))) {
  errors.push("main/index.js bypasses a module public entry");
}

const requiredModules = [
  "agent-runtimes",
  "conversations",
  "desktop-shell",
  "diagnostics",
  "distribution",
  "preferences",
  "projects-navigation",
  "runtime-locator",
  "settings",
  "shortcuts",
  "terminal",
  "updater",
  "workspace-panels",
];
for (const moduleName of requiredModules) {
  if (!fs.existsSync(path.join(repoRoot, "modules", moduleName))) {
    errors.push(`missing module directory: modules/${moduleName}`);
  }
}

for (const target of Object.values(TARGETS)) {
  for (const entry of Object.values(rendererAliases(target))) {
    if (!fs.existsSync(entry)) errors.push(`${target.id}: missing ${entry}`);
  }
  for (const entry of Object.values(mainAliases(target))) {
    if (!fs.existsSync(entry)) errors.push(`${target.id}: missing ${entry}`);
  }
  const distribution = buildImplementation(target, "distribution");
  if (!fs.existsSync(distribution)) {
    errors.push(`${target.id}: missing distribution implementation`);
  }
}

const linuxArtifacts = walk(path.join(repoRoot, "modules"))
  .map(relative)
  .filter((file) => /(^|\/)linux([./-]|$)/i.test(file));
for (const file of linuxArtifacts) errors.push(`unexpected Linux placeholder: ${file}`);

const userVisibleNoma = [
  ...sharedSource,
  ...walk(path.join(repoRoot, "modules"))
    .filter((file) => sourceExtensions.has(path.extname(file))),
].filter((file, index, all) => all.indexOf(file) === index)
  .filter((file) => {
    const allowed = relative(file);
    return allowed !== "modules/preferences/renderer/state.js" &&
      !/^modules\/preferences\/main\/.*\.test\.cjs$/.test(allowed) &&
      !/^modules\/desktop-shell\/implementations\/[^/]+\/main\.cjs$/.test(allowed);
  })
  .filter((file) => /\bNoma\b|\bnoma\./.test(fs.readFileSync(file, "utf8")));
for (const file of userVisibleNoma) {
  errors.push(`${relative(file)} contains legacy Noma identity outside migration code`);
}

if (fs.existsSync(path.join(repoRoot, "platforms"))) {
  errors.push("top-level platforms directory is forbidden");
}

if (errors.length) {
  throw new Error(`Module boundary check failed:\n${errors.join("\n")}`);
}

console.log("Module boundaries verified");
