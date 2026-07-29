const path = require("node:path");

function registerGlobalStateHandlers({
  broadcast,
  fs,
  homePath,
  ipcMain,
  logger = console,
}) {
  const globalStatePath = path.join(
    homePath,
    ".codex",
    ".codex-global-state.json",
  );
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(globalStatePath, "utf8"));
    } catch {
      return {};
    }
  };

  ipcMain.handle("gs:read", read);
  ipcMain.handle("gs:patch", (_event, patch) => {
    try {
      const next = { ...read(), ...(patch || {}) };
      const temporary = `${globalStatePath}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, JSON.stringify(next));
      fs.renameSync(temporary, globalStatePath);
      return true;
    } catch (error) {
      logger.error?.(`[gs] patch failed: ${error.message}`);
      return false;
    }
  });

  let timer = null;
  try {
    const watcher = fs.watch(path.dirname(globalStatePath), (_event, name) => {
      if (name !== path.basename(globalStatePath)) return;
      clearTimeout(timer);
      timer = setTimeout(() => broadcast("gs:changed", {}), 150);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  } catch (error) {
    logger.error?.(`[gs] watch failed: ${error.message}`);
    return () => {};
  }
}

module.exports = { registerGlobalStateHandlers };
