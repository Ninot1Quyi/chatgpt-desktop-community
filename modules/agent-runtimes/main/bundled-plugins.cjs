async function ensureBundledPluginMarketplace({
  homePath,
  host,
  request,
  resourcesPath,
} = {}) {
  if (typeof host?.resolveBundledPluginMarketplace !== "function") {
    throw new Error("Bundled plugin host implementation is required");
  }
  if (typeof request !== "function") {
    throw new Error("App-server request function is required");
  }
  const source = host.resolveBundledPluginMarketplace({
    homePath,
    resourcesPath,
  });
  if (!source) return null;
  const result = await request("marketplace/add", { source });
  return { source, ...result };
}

function createBundledPluginMarketplaceRegistrar(register) {
  if (typeof register !== "function") {
    throw new Error("Bundled plugin registration function is required");
  }
  let registration = null;
  return async function registerBundledPluginMarketplace() {
    if (!registration) {
      registration = Promise.resolve()
        .then(register)
        .then((result) => {
          if (!result) registration = null;
          return result;
        })
        .catch((error) => {
          registration = null;
          throw error;
        });
    }
    return registration;
  };
}

module.exports = {
  createBundledPluginMarketplaceRegistrar,
  ensureBundledPluginMarketplace,
};
