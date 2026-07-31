import assert from "node:assert/strict";
import test from "node:test";
import {
  customCandidateFromDirectory,
  dedupePetCandidates,
  joinPath,
  normalizePetManifest,
  unavailablePet,
} from "./pets-protocol.mjs";

test("pet paths are composed for macOS and Windows homes", () => {
  assert.equal(joinPath("/Users/quyi", ".codex", "pets", "clawd"), "/Users/quyi/.codex/pets/clawd");
  assert.equal(joinPath("C:\\Users\\quyi", ".codex", "pets", "clawd"), "C:\\Users\\quyi\\.codex\\pets\\clawd");
});

test("pet manifest creates a concrete spritesheet preview path and wake id", () => {
  const pet = normalizePetManifest(
    {
      id: "clawd",
      displayName: "Clawd",
      description: "A real pet",
      spriteVersionNumber: 2,
      spritesheetPath: "spritesheet.webp",
    },
    { id: "clawd" },
    "/Users/quyi/.codex/pets/clawd",
  );

  assert.equal(pet.id, "clawd");
  assert.equal(pet.spritesheetPath, "/Users/quyi/.codex/pets/clawd/spritesheet.webp");
  assert.equal(pet.manifestPath, "/Users/quyi/.codex/pets/clawd/pet.json");
  assert.equal(pet.wakeId, "custom:clawd");
});

test("manifest can override the notification avatar id", () => {
  const pet = normalizePetManifest(
    { id: "dewey", spritesheetPath: "sheet.webp", avatarId: "builtin:dewey" },
    { id: "dewey" },
    "/Users/quyi/.codex/pets/dewey",
  );

  assert.equal(pet.wakeId, "builtin:dewey");
});

test("custom imports derive id from the selected folder and dedupe by path", () => {
  const custom = customCandidateFromDirectory("/tmp/pets/my-pet");
  assert.deepEqual(custom, { id: "my-pet", path: "/tmp/pets/my-pet", source: "custom" });
  assert.deepEqual(dedupePetCandidates([custom, custom, { id: "clawd" }]), [custom, { id: "clawd" }]);
});

test("missing pets stay visible but are not available for selection", () => {
  const pet = unavailablePet({ id: "codex", name: "Codex" }, "/Users/quyi/.codex/pets", "HTTP 404");

  assert.equal(pet.available, false);
  assert.equal(pet.displayName, "Codex");
  assert.equal(pet.directory, "/Users/quyi/.codex/pets/codex");
  assert.equal(pet.manifestPath, "/Users/quyi/.codex/pets/codex/pet.json");
  assert.equal(pet.reason, "HTTP 404");
});
