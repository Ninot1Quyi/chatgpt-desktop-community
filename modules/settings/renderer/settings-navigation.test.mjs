import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("./Settings.jsx", import.meta.url),
  "utf8",
);

test("every Settings navigation item opens its local section", () => {
  assert.match(source, /onClick=\{\(\) => setSection\(it\.id\)\}/);
  assert.doesNotMatch(source, /it\.id === "account"/);
  assert.doesNotMatch(source, /chatgpt\.com\/#settings/);
  assert.match(source, /case "account":\s+return <AccountSection \/>;/);
});
