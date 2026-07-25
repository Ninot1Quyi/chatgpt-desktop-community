// Neutral bridge: the side panel registers its tab opener here so store.js
// (which must not import component modules, circular) can route the legacy
// ui.rightTab alias to the panel tab store.
export const panelHook = { open: null };
