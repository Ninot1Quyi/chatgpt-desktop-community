import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} exited with code ${code}`));
    });
  });
}

async function createPortableArchive({ outputDir, version }) {
  const sourceDir = path.join(outputDir, "win-unpacked");
  const updateConfig = path.join(sourceDir, "resources", "app-update.yml");
  const archive = path.join(
    outputDir,
    `ChatGPT-Desktop-Community-${version}-win32-x64-portable.zip`,
  );
  await fs.access(sourceDir);
  await fs.access(updateConfig);
  await fs.rm(archive, { force: true });

  const stagingRoot = await fs.mkdtemp(path.join(outputDir, ".portable-stage-"));
  const portableRoot = path.join(stagingRoot, "ChatGPT Desktop Community");
  const tar = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "tar.exe",
  );
  try {
    await fs.cp(sourceDir, portableRoot, { recursive: true });
    await fs.rm(path.join(portableRoot, "resources", "app-update.yml"));
    await run(tar, [
      "-a",
      "-c",
      "-f",
      archive,
      "-C",
      stagingRoot,
      "ChatGPT Desktop Community",
    ]);
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
  return [archive];
}

export function createDistribution({ product, target, version = "0.0.0" }) {
  return {
    builderPlatform: "WINDOWS",
    builderTargets: ["nsis"],
    finalizeArtifacts: ({ outputDir }) => createPortableArchive({
      outputDir,
      version,
    }),
    config: {
      artifactName:
        `ChatGPT-Desktop-Community-Setup-\${version}-${target.id}.\${ext}`,
      win: {
        target: ["nsis"],
        icon: "assets/community-icon.ico",
      },
      nsis: {
        oneClick: true,
        perMachine: false,
        shortcutName: product.productName,
      },
    },
  };
}
