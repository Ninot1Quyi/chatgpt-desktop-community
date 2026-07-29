import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync(
  new URL("../package.json", import.meta.url),
  "utf8",
));
const tag = process.env.GITHUB_REF_NAME;
const expected = `v${packageJson.version}`;
if (tag !== expected) {
  throw new Error(`Release tag ${tag || "<missing>"} must equal ${expected}`);
}
console.log(`Release tag matches package version ${packageJson.version}`);
