export const BUILT_IN_PET_CANDIDATES = [
  {
    id: "claude-icon",
    name: "Claude Icon",
    description:
      "A Claude Code style orange pixel pet upgraded into a tiny chef, wearing a white chef hat and holding a frying pan.",
  },
  {
    id: "clawd",
    name: "Clawd",
    description:
      "A compact community pet based on official Claude Code pixel Clawd frames, extracted without stretching.",
  },
  { id: "codex", name: "Codex", description: "The original community companion." },
  { id: "dewey", name: "Dewey", description: "A calm companion for focused workspace days." },
  { id: "fireball", name: "Fireball", description: "Hot path energy for fast iteration." },
  { id: "hoots", name: "Hoots", description: "A sharp-eyed owl for polished work in a blink." },
  { id: "rocky", name: "Rocky", description: "A steady rock when the diff gets large." },
  { id: "seedy", name: "Seedy", description: "Small green shoots for new ideas." },
  { id: "stacky", name: "Stacky", description: "A balanced stack for deep work." },
  { id: "bsod", name: "BSOD", description: "A tiny blue-screen gremlin." },
  { id: "null-signal", name: "Null Signal", description: "Quiet signal from the void." },
];

export const CUSTOM_PETS_STORAGE_KEY = "customPets";

export function joinPath(base, ...parts) {
  const root = String(base || "").replace(/[\\/]$/, "");
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const tail = parts
    .filter((part) => part != null && String(part).length)
    .map((part) => String(part).replace(/^[\\/]+|[\\/]+$/g, ""))
    .join(sep);
  return tail ? `${root}${sep}${tail}` : root;
}

export function basenameOfPath(value) {
  return String(value || "")
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || "";
}

export function petDirectoryForCandidate(candidate, petsDir) {
  return candidate.path || joinPath(petsDir, candidate.id);
}

export function dedupePetCandidates(candidates) {
  const byKey = new Map();
  for (const candidate of candidates || []) {
    const key = candidate.path ? `path:${candidate.path}` : `id:${candidate.id}`;
    if (!byKey.has(key)) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}

export function customCandidateFromDirectory(directory) {
  const id = basenameOfPath(directory);
  return id ? { id, path: directory, source: "custom" } : null;
}

export function normalizePetManifest(manifest, candidate, directory) {
  const source = manifest && typeof manifest === "object" ? manifest : {};
  const id = String(source.id || candidate?.id || basenameOfPath(directory) || "").trim();
  const spritesheetRel = String(source.spritesheetPath || source.spritesheet || source.sprite || "").trim();
  const displayName = String(source.displayName || source.name || candidate?.name || id || "Pet").trim();
  const description = String(source.description || candidate?.description || "").trim();
  const version = Number(source.spriteVersionNumber || source.spriteVersion || 0) || null;
  const avatarId = String(source.avatarId || source.notificationAvatarId || "").trim();
  if (!id) throw new Error("pet.json is missing id");
  if (!spritesheetRel) throw new Error("pet.json is missing spritesheetPath");
  return {
    id,
    displayName,
    description,
    version,
    directory,
    spritesheetPath: joinPath(directory, spritesheetRel),
    manifestPath: joinPath(directory, "pet.json"),
    wakeId: avatarId || `custom:${id}`,
  };
}

export function unavailablePet(candidate, petsDir, reason) {
  const directory = petDirectoryForCandidate(candidate, petsDir);
  return {
    id: candidate.id,
    displayName: candidate.name || candidate.id,
    description: candidate.description || "",
    directory,
    manifestPath: joinPath(directory, "pet.json"),
    available: false,
    reason: reason || "Missing pet.json or spritesheet",
  };
}
