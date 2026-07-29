export function normalizeProjectPath(value) {
  return String(value || "").replace(/[\\/]+$/, "").replace(/\\/g, "/");
}

export function isProjectPathInside(path, rootPath) {
  const pathValue = normalizeProjectPath(path).toLowerCase();
  const rootValue = normalizeProjectPath(rootPath).toLowerCase();
  return !!rootValue && (pathValue === rootValue || pathValue.startsWith(`${rootValue}/`));
}

export function externalProjectId(runtime, cwd, codexProjectId = null) {
  const key = codexProjectId
    ? `project:${codexProjectId}`
    : `cwd:${normalizeProjectPath(cwd).toLowerCase()}`;
  return `${runtime}:${key}`;
}
