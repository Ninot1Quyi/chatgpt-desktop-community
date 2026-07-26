# ChatGPT Desktop Community

An unofficial community-built desktop client for ChatGPT and Codex.

This project recreates the focused workspace experience of the desktop app with original Electron and React code. It connects to the official local `codex app-server`, so conversations, approvals, tools, and account access use the same local backend rather than a custom proxy.

> This project is not affiliated with, endorsed by, or sponsored by OpenAI.

## Why this project exists

More and more apps borrow the look of ChatGPT Desktop, but few reproduce the full experience closely enough. This project started from a simple idea: build the faithful community reimplementation we wanted to use ourselves.

Our goal is to recreate ChatGPT Desktop as closely as practical while keeping it useful for everyday work. Because the implementation is open and grounded in the real local `codex app-server` protocol, we can add the features we want instead of waiting for them elsewhere.

## What works today

- Project and thread navigation, search, pinning, archives, and settings
- Streaming conversations with Markdown, reasoning, context compaction, plans, goals, and errors
- Live work status for commands, file reads, searches, edits, and other tool activity
- Command, file-change, permission, and user-input approval flows
- Clipboard image paste, attachment previews, project context, model and reasoning selection, and queued messages
- Review, Files, Terminal, Browser, and Side Chat panels
- Pull request, scheduled task, site, and plugin navigation surfaces
- Light, dark, and system appearance modes

The interface is under active development. Protocol changes in `codex app-server` may require matching updates here.

## Interface examples

| Light appearance | Dark appearance |
| --- | --- |
| ![ChatGPT Desktop Community in light appearance](assets/screenshots/chatgpt-desktop-light.png) | ![ChatGPT Desktop Community in dark appearance](assets/screenshots/chatgpt-desktop-dark.png) |

## Getting started

To install and use the app, download a prebuilt version from the [latest release](https://github.com/Ninot1Quyi/chatgpt-desktop-community/releases/latest).

### Development

Development requires macOS, Node.js 22 or newer, and either the Codex CLI on `PATH` or the ChatGPT desktop app with its bundled Codex executable.

Recommended: use ChatGPT Desktop, Claude Code, or Cursor and say:

> 克隆这个仓库 [Ninot1Quyi/chatgpt-desktop-community](https://github.com/Ninot1Quyi/chatgpt-desktop-community)，然后启动它。

```bash
git clone https://github.com/Ninot1Quyi/chatgpt-desktop-community.git
cd chatgpt-desktop-community
npm ci
npm run dev
```

Development mode starts Vite on port `5175`, opens Electron with hot reload, and enables DevTools.

Before submitting a change, run:

```bash
npm run build
```

For changes to the Electron bridge or app-server integration, also run:

```bash
node _analysis/smoke.mjs
```

## Privacy and security

- Never commit or share `~/.codex/auth.json`.
- Keep local paths, account details, thread content, and private project names out of screenshots and bug reports.
- Treat Full Access mode as privileged: it can run commands, use the network, and modify files.
- Review protocol and filesystem boundary changes carefully, especially Electron IPC and preload code.

## Current limitations

- macOS is the only platform regularly exercised.
- There is no signed installer or automatic update channel yet.
- The Browser panel provides practical embedded navigation, but it does not reproduce every browser-control feature of the official client.
- Compatibility can lag behind newly released app-server methods or notification shapes.
- This remains an independent community implementation, so visual and behavioral differences are expected.

## Contributing

Humans and AI agents are welcome to share code, report bugs, and open pull requests.

Please keep private data out of contributions and run `npm run build` before submitting code.

## Trademark notice

OpenAI, ChatGPT, and Codex are trademarks of OpenAI. Their use here identifies compatibility and inspiration only.
