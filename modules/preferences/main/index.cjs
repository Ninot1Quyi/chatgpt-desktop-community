const path = require("node:path");

function readObject(fs, filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function migratePreferences({
  destination,
  fs,
  legacyPreferencePaths,
  logger = console,
}) {
  if (fs.existsSync(destination)) return null;
  const candidates = legacyPreferencePaths
    .map((filePath) => {
      const value = readObject(fs, filePath);
      if (!value) return null;
      try {
        return { filePath, value, modifiedAt: fs.statSync(filePath).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  if (!candidates.length) return null;

  const selected = candidates[0];
  try {
    fs.writeFileSync(destination, JSON.stringify(selected.value));
    logger.info?.(`[prefs] migrated ${selected.filePath}`);
    return selected.filePath;
  } catch (error) {
    logger.warn?.(`[prefs] migration skipped: ${error.message}`);
    return null;
  }
}

function registerPreferenceHandlers({
  fs,
  ipcMain,
  legacyPreferencePaths,
  logger = console,
  userDataPath,
}) {
  const prefsPath = path.join(userDataPath, "renderer-prefs.json");
  migratePreferences({
    destination: prefsPath,
    fs,
    legacyPreferencePaths,
    logger,
  });

  const read = () => readObject(fs, prefsPath) || {};
  ipcMain.handle("prefs:read", () => read());

  let pending = {};
  let writeTimer = null;
  ipcMain.handle("prefs:write", (_event, { key, value }) => {
    pending[key] = value;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      const nextPending = pending;
      pending = {};
      try {
        const next = { ...read(), ...nextPending };
        const temporary = `${prefsPath}.tmp-${process.pid}`;
        fs.writeFileSync(temporary, JSON.stringify(next));
        fs.renameSync(temporary, prefsPath);
      } catch (error) {
        logger.error?.(`[prefs] write failed: ${error.message}`);
      }
    }, 150);
    return true;
  });

  return { prefsPath, read };
}

module.exports = {
  migratePreferences,
  registerPreferenceHandlers,
};
