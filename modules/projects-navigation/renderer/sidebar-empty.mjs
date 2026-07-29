export function isSidebarEmpty({
  archivedView,
  externalSections,
  model,
  pinnedExternalProjects,
  pinnedThreads,
}) {
  const codexEmpty = model.projects.length === 0
    && model.chats.length === 0
    && model.pinned.length === 0
    && pinnedThreads.length === 0;
  if (!codexEmpty) return false;
  if (archivedView) return true;
  return pinnedExternalProjects.length === 0
    && externalSections.every((section) => section.projects.length === 0);
}
