export const COMPOSER_DRAFT_STORAGE_PREFIX = "composer.draft.";

const MENTION_KINDS = new Set(["file", "site", "skill"]);

export function emptyComposerDraft() {
  return {
    text: "",
    images: [],
    files: [],
    mentions: [],
  };
}

export function composerDraftKey(threadId, draftAt, cwd) {
  if (typeof threadId === "string" && threadId.trim()) {
    return `thread:${encodeURIComponent(threadId)}`;
  }

  const normalizedDraftAt = typeof draftAt === "number" && Number.isFinite(draftAt)
    ? String(draftAt)
    : typeof draftAt === "string" && draftAt
      ? draftAt
      : "0";
  const normalizedCwd = typeof cwd === "string" ? cwd : "";
  return `new:${encodeURIComponent(normalizedDraftAt)}:${encodeURIComponent(normalizedCwd)}`;
}

export function composerDraftStorageKey(draftKey) {
  return `${COMPOSER_DRAFT_STORAGE_PREFIX}${draftKey}`;
}

export function normalizeComposerDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyComposerDraft();
  }

  return {
    text: typeof value.text === "string" ? value.text : "",
    images: normalizePaths(value.images),
    files: normalizePaths(value.files),
    mentions: Array.isArray(value.mentions)
      ? value.mentions.map(normalizeMention).filter(Boolean)
      : [],
  };
}

export function isComposerDraftEmpty(value) {
  const draft = normalizeComposerDraft(value);
  return draft.text.length === 0
    && draft.images.length === 0
    && draft.files.length === 0
    && draft.mentions.length === 0;
}

export function readComposerDraft(storage, draftKey) {
  try {
    const serialized = storage?.getItem?.(composerDraftStorageKey(draftKey));
    if (serialized == null) return emptyComposerDraft();
    return normalizeComposerDraft(JSON.parse(serialized));
  } catch {
    return emptyComposerDraft();
  }
}

export function writeComposerDraft(storage, draftKey, value) {
  const draft = normalizeComposerDraft(value);
  try {
    if (isComposerDraftEmpty(draft)) {
      storage?.removeItem?.(composerDraftStorageKey(draftKey));
    } else {
      storage?.setItem?.(composerDraftStorageKey(draftKey), JSON.stringify(draft));
    }
  } catch {}
  return draft;
}

export function deleteComposerDraft(storage, draftKey) {
  try {
    storage?.removeItem?.(composerDraftStorageKey(draftKey));
  } catch {}
}

function normalizePaths(value) {
  return Array.isArray(value)
    ? value.filter((path) => typeof path === "string" && path.length > 0)
    : [];
}

function normalizeMention(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;

  const kind = value.kind == null ? null : value.kind;
  if (kind != null && !MENTION_KINDS.has(kind)) return null;
  if (kind !== "site" && typeof value.path !== "string") return null;

  const mention = { name: value.name };
  if (kind != null) mention.kind = kind;
  if (typeof value.displayName === "string") mention.displayName = value.displayName;
  if (typeof value.path === "string") mention.path = value.path;
  if (typeof value.icon === "string") mention.icon = value.icon;
  return mention;
}
