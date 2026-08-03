import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowUpdateEntry } from "./update-entry.mjs";

test("sidebar update entry only appears while an update is pending", () => {
  for (const status of ["available", "downloading", "downloaded"]) {
    assert.equal(shouldShowUpdateEntry({ status }), true, status);
  }

  for (const status of [undefined, "idle", "dev", "disabled", "checking", "none", "error"]) {
    assert.equal(shouldShowUpdateEntry(status ? { status } : null), false, status);
  }
});
