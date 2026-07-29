export const fileManagerName = "Finder";
export const revealInFileManager = "Reveal in Finder";
export const showInFileManager = "Show in Finder";
export const homeConfigPath = "~/.codex";

export function formatHomePath(value, home) {
  return home && value?.startsWith(home)
    ? `~${value.slice(home.length)}`
    : value;
}
