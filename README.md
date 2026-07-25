# ChatGPT Desktop Community

> An unofficial community project. It is not affiliated with or endorsed by OpenAI.

A clean-room implementation of the ChatGPT and Codex desktop experience. The project recreates the core desktop UI and interactions from publicly observable behavior and protocols, using original code and the official local `codex app-server` backend.

## Run

```bash
npm install        # First-time setup
npm start          # Build the renderer and launch the app

# Development mode with hot reload and DevTools
npm run dev
```

The app uses the ChatGPT account already signed in on the machine (`auth_mode=chatgpt`). No additional login is required.

## Architecture

```text
Electron main process (main/index.js)
  ├─ BrowserWindow (1280×820, hiddenInset title bar, traffic lights at 16×16, vibrancy)
  ├─ Spawns codex app-server (stdio, newline-delimited JSON-RPC)
  │    <codex resolution: $CODEX_CLI_PATH → /Applications/ChatGPT.app/.../codex → PATH>
  │    Arguments: -c features.code_mode_host=true app-server --analytics-default-enabled
  │    Handshake: initialize(id="__codex_initialize__", clientInfo, capabilities.experimentalApi)
  ├─ IPC relay for rpc:request, rpc:respond, notifications, and approval requests
  └─ codex-file:// protocol with an allowlist for local image and video attachments

Renderer (renderer/, React 19 + Vite + Tailwind CSS v4 + Zustand)
  ├─ 46px global header with window controls, sidebar toggle, navigation,
  │    view title, context usage, Git branch, and panel toggles
  ├─ Resizable sidebar (240–520px) with search, navigation, pinned projects,
  │    cwd-grouped projects, thread status, menus, profile, archives, and settings
  ├─ Conversation view with Markdown, code blocks, reasoning, streaming output,
  │    command and file-change cards, MCP and web-search rows, subagents,
  │    approval forms, plan steps, turn actions, and error states
  ├─ Composer with attachments, path mentions, permission controls, model and
  │    reasoning selection, queued messages, project context, and drag-and-drop
  ├─ Right panel with Review, Files, Terminal, Browser, and Side Chat tabs
  ├─ Bottom terminal strip and floating Outputs/Sources panel
  ├─ Command palette, settings, toast notifications, and top-level navigation
  └─ Light, dark, and system themes based on measured desktop design tokens
```

## Protocol Notes

- Transport: newline-delimited JSON over child-process stdio.
  - Request: `{id, method, params}`
  - Response: `{id, result|error}`
  - Notification: `{method, params}`
- Authentication: `app-server` reads `~/.codex/auth.json` and refreshes tokens itself. The renderer does not handle credentials.
- Key methods: `thread/list`, `thread/start`, `thread/resume`, `thread/read`, `turn/start`, `turn/interrupt`, `thread/name/set`, `thread/archive`, `model/list`, `account/read`, `command/exec`, and `fs/*`.
- Server-to-client requests: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `item/tool/requestUserInput`, and `mcpServer/elicitation/request`.
- Streaming notifications: `turn/started|completed`, `item/started|completed`, `item/agentMessage/delta`, `item/reasoning/*Delta`, `item/commandExecution/outputDelta`, `turn/plan/updated`, and `thread/tokenUsage/updated`.
- Generate the authoritative schemas with `codex app-server generate-json-schema --out <dir>`. Generated copies are available under `_analysis/schema/`.

## Project Layout

- `main/` — Electron main process and preload bridge
- `renderer/` — React renderer source; build output goes to `dist-renderer/`
- `_analysis/` — protocol schemas, smoke tests, and CDP inspection scripts

## Intentional Differences

- Some reference-app features are not implemented, including the hotkey window, full cloud-task flows, voice dictation, browser annotation, advanced worktree operations, and several aggregation shortcuts.
- The Browser tab uses Electron `<webview>` for basic navigation rather than the reference app's complete browser integration.
- The app uses a single main window.
- Thread data comes from the official `app-server` and remains compatible with the official desktop app.
- Reference measurements were taken from runtime DOM, computed styles, and screenshots through CDP. No source code from the reference app was copied.
