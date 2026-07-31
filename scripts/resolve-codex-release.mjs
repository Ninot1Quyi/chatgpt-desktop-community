import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  resolveLatestCodexRelease,
  writeCodexReleaseManifest,
} from "./codex-release.mjs";

function outputArgument(argv) {
  const inline = argv.find((argument) => argument.startsWith("--output="));
  if (inline) return inline.slice("--output=".length);
  const index = argv.indexOf("--output");
  return index >= 0 ? argv[index + 1] : null;
}

export async function resolveCodexReleaseCli(argv = process.argv.slice(2)) {
  const release = await resolveLatestCodexRelease();
  const output = outputArgument(argv);
  if (output) {
    const destination = path.resolve(output);
    await writeCodexReleaseManifest(destination, release);
    console.log(
      `Resolved latest stable Codex CLI ${release.version} (${release.releaseTag}) to ${destination}`,
    );
  } else {
    console.log(JSON.stringify(release, null, 2));
  }
  return release;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await resolveCodexReleaseCli();
