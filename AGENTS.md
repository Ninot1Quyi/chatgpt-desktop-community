# Repository Guidelines

> This branch (`codex-communicate-windows`) targets Windows x64 only. Keep runtimes, window chrome, shortcuts, shell commands, packaging, and release automation Windows-specific.

## Project Structure & Module Organization

`main/index.js` owns the Electron lifecycle, file protocol, and JSON-RPC bridge to `codex app-server`; `main/preload.js` exposes IPC. The Vite root is `renderer/`: state and RPC helpers live in `renderer/src/store.js` and `renderer/src/api.js`, UI in `renderer/src/components/`, panel features in `renderer/src/components/panel/`, and helpers in `renderer/src/lib/`. Windows chrome (in-window menu bar, caption buttons) lives in `renderer/src/components/WinMenuBar.jsx` and `renderer/src/components/WinWindowControls.jsx`. Theme tokens are in `renderer/src/theme.css`. Static resources (fonts, images, brand icons, file-type SVGs) live in `renderer/src/assets/`; vendor metadata is centralized in `renderer/src/lib/runtimes.jsx`. `_analysis/` contains smoke tools, CDP probes, generated schemas, and reference screenshots. Do not commit `dist-renderer/`, `node_modules/`, or `_analysis/asar-out/`.

## Build, Test, and Development Commands

- `npm ci` — install the lockfile-pinned dependency set.
- `npm run dev` — start Vite on port 5175 and launch Electron with hot reload.
- `npm run build` — compile the renderer into `dist-renderer/`.
- `npm start` — build, then launch the packaged-style local app.
- `node _analysis/smoke.mjs` — exercise the bundled Codex app-server handshake and read-only thread APIs.
- `npm run dist:win` — build the NSIS installer into `release/` via electron-builder (auto-updatable; `package:win`'s electron-packager zip is not).
- Release flow: bump `version` (tags must match it), push a `v*` tag — `.github/workflows/release.yml` builds on windows-latest and publishes the installer + `latest.yml` to GitHub Releases. Packaged builds check for updates on launch (every 6h) and from Settings → General → Updates; `main/updater.js` owns the electron-updater wiring.

## Coding Style & Naming Conventions

Use two-space indentation, double quotes, semicolons, and trailing commas where adjacent code does. Keep Electron files in CommonJS and renderer code in ES modules. Name React components and files in `PascalCase`, hooks as `useThing`, helpers in `camelCase`, and constants in `UPPER_SNAKE_CASE`. Reuse `theme.css` variables and existing Tailwind patterns. No formatter or linter is configured, so match nearby code.

## Testing Guidelines

There is no automated test suite or coverage threshold. Every change must pass `npm run build`. Exercise the affected flow in `npm run dev`; for bridge changes, also run the smoke script. Include before/after screenshots for visual work. If adding automated tests, use `*.test.js` or `*.test.jsx` and add the corresponding `npm test` script in the same pull request.

## Commit & Pull Request Guidelines

History favors concise, outcome-focused subjects such as `Sidebar: share official global-state` or `fix: import footer menu icons`. Keep commits scoped; add Lore trailers only for useful constraints, rejected alternatives, risk, or verification evidence. Pull requests should explain the user-visible reason, list touched areas, link issues, and record validation commands. Include screenshots for renderer changes and note untested platform or app-server behavior.

## Security & Configuration

Never commit credentials or copy `%USERPROFILE%\.codex\auth.json`; authentication belongs to `codex app-server`. Use `CODEX_CLI_PATH` only as a local override, and keep filesystem access behind the existing `codex-file://` allowlist and preload IPC boundary.
