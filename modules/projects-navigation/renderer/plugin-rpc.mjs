function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fallbackPluginName(plugin) {
  const id = nonEmptyString(plugin?.id);
  return id ? id.split("@")[0].trim() : null;
}

export function pluginRequestParams(plugin) {
  const localPluginName = nonEmptyString(plugin?.name) || fallbackPluginName(plugin);
  if (!localPluginName) {
    throw new Error("Plugin metadata does not include a plugin name");
  }

  const marketplacePath = nonEmptyString(plugin?._marketplacePath);
  if (marketplacePath) {
    return { pluginName: localPluginName, marketplacePath };
  }

  const remoteMarketplaceName = nonEmptyString(plugin?._marketplace);
  if (remoteMarketplaceName) {
    const remotePluginName =
      nonEmptyString(plugin?.remotePluginId) || localPluginName;
    return {
      pluginName: remotePluginName,
      remoteMarketplaceName,
    };
  }

  return { pluginName: localPluginName };
}
