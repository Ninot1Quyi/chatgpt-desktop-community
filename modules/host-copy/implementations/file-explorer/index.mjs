export const fileManagerName = "File Explorer";
export const revealInFileManager = "Reveal in File Explorer";
export const showInFileManager = "Show in File Explorer";
export const homeConfigPath = "%USERPROFILE%\\.codex";

export function formatHomePath(value, home) {
  return home && value?.toLowerCase().startsWith(home.toLowerCase())
    ? `%USERPROFILE%${value.slice(home.length)}`
    : value;
}
