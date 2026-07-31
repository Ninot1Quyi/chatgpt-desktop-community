import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import electronPath from "electron";
import { build as buildElectron, Arch, Platform } from "electron-builder";
import { build as buildWithEsbuild } from "esbuild";
import { build as buildWithVite, createServer } from "vite";
import {
  PRODUCT,
  buildImplementation,
  mainAliases,
  readTargetArg,
  resolveTarget,
} from "../build/targets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(
  await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
);
const action = process.argv[2];
const target = resolveTarget(readTargetArg(process.argv.slice(3)));
process.env.CHATGPT_DESKTOP_TARGET = target.id;
const distributionImport = await import(
  pathToFileURL(buildImplementation(target, "distribution")).href
);
const distribution = distributionImport.createDistribution({
  product: PRODUCT,
  target,
  version: packageMetadata.version,
});

function aliasPlugin(aliases) {
  return {
    name: "module-implementation-alias",
    setup(build) {
      build.onResolve({ filter: /^@modules\// }, (args) => {
        const replacement = aliases[args.path];
        if (!replacement) {
          return { errors: [{ text: `No ${target.id} implementation for ${args.path}` }] };
        }
        return { path: replacement };
      });
    },
  };
}

async function buildMain() {
  await fs.rm(path.join(repoRoot, "dist-main"), { recursive: true, force: true });
  return buildWithEsbuild({
    absWorkingDir: repoRoot,
    entryPoints: {
      index: "main/index.js",
      preload: "main/preload.js",
    },
    outdir: "dist-main",
    outExtension: { ".js": ".cjs" },
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    sourcemap: action === "dev",
    metafile: true,
    external: ["electron", "electron-updater"],
    define: {
      __BUILD_TARGET__: JSON.stringify(target.id),
    },
    plugins: [aliasPlugin(mainAliases(target))],
    logLevel: "info",
  });
}

async function buildApplication() {
  const mainResult = await buildMain();
  const rendererResult = await buildWithVite();
  await writeBuildMetadata(mainResult, rendererResult);
}

function normalizeModuleId(value) {
  return String(value || "").replaceAll("\\", "/").split("?")[0];
}

async function writeBuildMetadata(mainResult, rendererResult) {
  const rendererOutputs = Array.isArray(rendererResult)
    ? rendererResult
    : [rendererResult];
  const rendererModules = new Set();
  const rendererChunks = [];
  for (const result of rendererOutputs) {
    for (const output of result?.output || []) {
      for (const moduleId of Object.keys(output.modules || {})) {
        rendererModules.add(normalizeModuleId(moduleId));
      }
      if (output.type === "chunk") {
        rendererChunks.push({
          fileName: output.fileName,
          isEntry: output.isEntry,
          isDynamicEntry: output.isDynamicEntry,
          modules: Object.keys(output.modules || {})
            .map(normalizeModuleId)
            .sort(),
        });
      }
    }
  }
  const mainModules = Object.keys(mainResult.metafile?.inputs || {})
    .map(normalizeModuleId);
  const metadataDir = path.join(repoRoot, ".build-meta", target.id);
  await fs.mkdir(metadataDir, { recursive: true });
  await fs.writeFile(
    path.join(metadataDir, "modules.json"),
    `${JSON.stringify({
      target: target.id,
      selectedImplementations: target.modules,
      main: mainModules.sort(),
      renderer: [...rendererModules].sort(),
      rendererChunks,
    }, null, 2)}\n`,
  );
}

async function prepareRuntime() {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "scripts", "prepare-codex-runtime.mjs"), target.runtimeTarget],
      { cwd: repoRoot, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Runtime preparation failed with exit code ${code}`));
    });
  });
}

function builderConfig() {
  const output = `release/${target.id}`;
  const runtimeSource = `release/codex-runtime-stage/${target.runtimeTarget}/codex-runtime`;
  const common = {
    appId: PRODUCT.appId,
    productName: PRODUCT.productName,
    asar: true,
    electronDownload: { version: "37.10.3" },
    directories: { output },
    files: [
      "dist-main/**",
      "dist-renderer/**",
      "assets/**",
      "package.json",
    ],
    extraResources: [{ from: runtimeSource, to: "codex-runtime" }],
    extraMetadata: {
      name: PRODUCT.packageName,
      productName: PRODUCT.productName,
      main: "dist-main/index.cjs",
      chatgptDesktopTarget: target.id,
    },
    publish: [{
      provider: "github",
      owner: "Ninot1Quyi",
      repo: "chatgpt-desktop-community",
      releaseType: "release",
    }],
  };

  return {
    ...common,
    ...distribution.config,
  };
}

async function packageApplication() {
  await prepareRuntime();
  await buildApplication();
  const platform = Platform[distribution.builderPlatform];
  const arch = Arch[target.arch];
  await buildElectron({
    targets: platform.createTarget(
      distribution.builderTargets,
      arch,
    ),
    config: builderConfig(),
    publish: "never",
  });
  await distribution.finalizeArtifacts({
    outputDir: path.join(repoRoot, "release", target.id),
  });
}

async function runDevelopment() {
  await buildMain();
  const server = await createServer();
  await server.listen();
  const rendererUrl = server.resolvedUrls?.local?.[0];
  if (!rendererUrl) throw new Error("Vite did not expose a local renderer URL");

  const child = spawn(electronPath, [repoRoot], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CHATGPT_DESKTOP_TARGET: target.id,
      ELECTRON_RENDERER_URL: rendererUrl,
    },
  });
  child.on("error", async (error) => {
    await server.close();
    throw error;
  });
  await new Promise((resolve) => child.on("exit", resolve));
  await server.close();
}

async function runProduction() {
  await buildApplication();
  const child = spawn(electronPath, [repoRoot], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CHATGPT_DESKTOP_TARGET: target.id,
    },
  });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
}

if (!["dev", "build", "package", "start"].includes(action)) {
  throw new Error("Usage: node scripts/target.mjs <dev|build|package|start> --target=<target>");
}

if (action === "dev") await runDevelopment();
if (action === "build") await buildApplication();
if (action === "package") await packageApplication();
if (action === "start") await runProduction();
