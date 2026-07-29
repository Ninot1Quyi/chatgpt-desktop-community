import * as api from "@app/api.js";

export const PREF_KEYS = Object.freeze({
  runtimeOrder: "community.runtimeOrder",
  pinnedThreadIds: "community.pinnedThreadIds",
  pinnedProjectIds: "community.pinnedProjectIds",
  pinnedProjectPaths: "community.pinnedProjectPaths",
});

// Read-only compatibility keys. New writes always use the product namespace.
export const LEGACY_PREF_KEYS = Object.freeze({
  runtimeOrder: "noma.runtimeOrder",
  pinnedThreadIds: "noma.pinnedThreadIds",
  pinnedProjectIds: "noma.pinnedProjectIds",
  pinnedProjectPaths: "noma.pinnedProjectPaths",
});

export function stored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function hasStored(key) {
  try {
    return localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

export function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  try {
    api.prefsWrite(key, value);
  } catch {}
}

function storedWithLegacy(name, fallback) {
  if (hasStored(PREF_KEYS[name])) return stored(PREF_KEYS[name], fallback);
  return stored(LEGACY_PREF_KEYS[name], fallback);
}

export function prefValue(prefs, name, fallback) {
  if (PREF_KEYS[name] in prefs) return prefs[PREF_KEYS[name]];
  if (LEGACY_PREF_KEYS[name] in prefs) return prefs[LEGACY_PREF_KEYS[name]];
  return fallback;
}

export function createPreferencesSlice(set, get, {
  externalProjectId,
  isProjectPathInside,
  normalizeProjectPath,
  runtimeForThread,
  runtimeIds,
  samePath,
}) {
  return {
    runtimeOrder: storedWithLegacy("runtimeOrder", runtimeIds),
    pinnedThreadIds: storedWithLegacy("pinnedThreadIds", []),
    pinnedProjectIds: storedWithLegacy("pinnedProjectIds", []),
    pinnedProjectPaths: storedWithLegacy("pinnedProjectPaths", []),
    _pinsInitialized: hasStored(PREF_KEYS.pinnedThreadIds)
      || hasStored(PREF_KEYS.pinnedProjectIds)
      || hasStored(PREF_KEYS.pinnedProjectPaths)
      || hasStored(LEGACY_PREF_KEYS.pinnedThreadIds)
      || hasStored(LEGACY_PREF_KEYS.pinnedProjectIds)
      || hasStored(LEGACY_PREF_KEYS.pinnedProjectPaths),

    togglePinnedProject(cwd, requestedRuntime = null) {
      if (!cwd) return;
      const globalState = get().gs || {};
      const localProjects = globalState["local-projects"] || {};
      let hit = null;
      let hitRootLength = -1;
      for (const entry of Object.entries(localProjects)) {
        for (const rootPath of entry[1].rootPaths || []) {
          if (
            isProjectPathInside(cwd, rootPath) &&
            normalizeProjectPath(rootPath).length > hitRootLength
          ) {
            hit = entry;
            hitRootLength = normalizeProjectPath(rootPath).length;
          }
        }
      }
      const activeThreadId = get().activeThreadId;
      const runtime = requestedRuntime
        || (activeThreadId
          ? runtimeForThread(get().activeConversation?.()?.thread, activeThreadId)
          : get().runtime);
      if (runtime === "claude" || runtime === "kimi") {
        return get().togglePinnedProjectId(
          externalProjectId(runtime, cwd, hit?.[0] || null),
        );
      }
      if (hit) return get().togglePinnedProjectId(hit[0]);
      const current = get().pinnedProjectPaths;
      const next = current.some((candidate) => samePath(candidate, cwd))
        ? current.filter((candidate) => !samePath(candidate, cwd))
        : [...current, cwd];
      set({ pinnedProjectPaths: next });
      persist(PREF_KEYS.pinnedProjectPaths, next);
    },

    togglePinnedProjectId(projectId) {
      if (!projectId) return;
      const current = get().pinnedProjectIds;
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId];
      set({ pinnedProjectIds: next });
      persist(PREF_KEYS.pinnedProjectIds, next);
    },

    togglePinnedThread(threadId) {
      if (!threadId) return;
      const current = get().pinnedThreadIds;
      const next = current.includes(threadId)
        ? current.filter((id) => id !== threadId)
        : [...current, threadId];
      set({ pinnedThreadIds: next });
      persist(PREF_KEYS.pinnedThreadIds, next);
    },

    setRuntimeOrder(order) {
      const next = [
        ...new Set([
          ...(order || []).filter((runtime) => runtimeIds.includes(runtime)),
          ...runtimeIds,
        ]),
      ];
      set({ runtimeOrder: next });
      persist(PREF_KEYS.runtimeOrder, next);
    },
  };
}
