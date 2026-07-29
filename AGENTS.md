# Repository Guidelines

## Architecture and Module Boundaries

This repository builds one product, **ChatGPT Desktop Community**, for Windows
and macOS. Business code is organized by capability under `modules/`:

- `conversations` owns messages, Composer, Markdown, and send state.
- `projects-navigation` owns projects, Sidebar, pins, history, and navigation.
- `settings` owns the settings surface and its sections.
- `workspace-panels` owns Files, Diff, Review, Context, Output, Browser, and
  Terminal panel UI.
- `agent-runtimes` owns Codex, Claude Code, and Kimi Code catalog, auth,
  history, execution, and usage.
- `preferences` owns persisted preferences and legacy migration.
- `desktop-shell`, `shortcuts`, `terminal`, `runtime-locator`, `host-copy`, and
  `distribution` contain module-local host implementations where needed.
- `updater` owns shared update state and installation behavior.

Do not add top-level platform packages or a global platform adapter. Shared
modules must not inspect `process.platform`, `navigator.platform`, `isWin`, or
`isMac`. A real host difference belongs in that feature module's
`implementations/<name>/` directory and must expose the same public contract as
its peers. Modules import other modules only through the aliases declared in
`build/targets.mjs`; never import another module's implementation directory.

`renderer/src/store.js` is the root Zustand composition point. State fragments
belong to their modules. `renderer/src/api.js` remains a transport-only preload
wrapper. `main/index.js` composes Electron, the selected module implementations,
and registered IPC handlers; business handlers belong to their module.

`renderer/src/theme.css` contains reset, font declarations, and shared tokens.
Business styles stay with the business module. Window chrome and host-specific
layout styles stay with the selected `desktop-shell` implementation.

## Targets and Commands

Every development, build, start, and package command requires an explicit
target:

- `npm run dev -- --target=win32-x64`
- `npm run build -- --target=darwin-arm64`
- `npm start -- --target=darwin-x64`
- `npm run package -- --target=darwin-universal`

Supported targets are `win32-x64`, `darwin-arm64`, `darwin-x64`, and
`darwin-universal`. `build/targets.mjs` is the only composition manifest.
Do not add Linux placeholders, empty implementations, TODOs, or speculative
configuration.

Use `npm ci` for dependencies and `npm test` for contract, migration, and
module-boundary checks. After each target build, run:

```sh
node _analysis/bundle-selection-check.mjs --target=<target>
```

For a read-only app-server smoke test, prepare or install Codex and run:

```sh
node _analysis/smoke.mjs --target=<target>
```

Release tags must match `package.json` exactly. Release CI packages
`win32-x64` as NSIS plus `latest.yml`, and `darwin-universal` as DMG/ZIP plus
macOS update metadata.

## Product Identity and Data

Keep these values unchanged unless a product migration is explicitly requested:

- npm package: `chatgpt-desktop-community`
- display name: `ChatGPT Desktop Community`
- appId: `com.ninot1quyi.chatgpt-desktop-community`

Production preferences use `ChatGPT Desktop Community`; development uses
`ChatGPT Desktop Community Dev`. `Noma` and `codex-desktop-rebuilt` may appear
only in bounded legacy preference migration code and its tests. Never migrate
Cache, GPUCache, Session Data, credentials, or auth files.

## Code, Tests, and Security

Use two-space indentation, double quotes, semicolons, and trailing commas where
adjacent code does. Electron files are CommonJS; renderer files are ES modules.
Name React components in `PascalCase`, hooks as `useThing`, helpers in
`camelCase`, and constants in `UPPER_SNAKE_CASE`.

Every change must pass `npm test` and the affected target builds. Exercise UI
changes in `npm run dev -- --target=<target>`; for bridge changes also run the
smoke test. Include screenshots for visual changes.

Never commit credentials or copy `~/.codex/auth.json`. Authentication belongs
to `codex app-server` and the external runtime CLIs. Use `CODEX_CLI_PATH` only
as a local override. Keep filesystem access behind the `codex-file://`
allowlist and preload IPC boundary.
