<p align="center">
  <img src="assets/community-icon.png" width="120" alt="ChatGPT Desktop Community icon">
</p>

# ChatGPT Desktop Community

An unofficial community-built desktop client for ChatGPT and Codex.

This project recreates the ChatGPT Desktop experience with Electron and React, using the official local `codex app-server` for chats, tools, approvals, and account access.

> This project is not affiliated with, endorsed by, or sponsored by OpenAI.

## Demo

<p align="center">
  <img src="assets/screenshots/chatgpt-desktop-light.png" width="49%" alt="ChatGPT Desktop Community in light appearance">
  <img src="assets/screenshots/chatgpt-desktop-dark.png" width="49%" alt="ChatGPT Desktop Community in dark appearance">
</p>

## Why this project exists

Many apps try to imitate ChatGPT Desktop but always fall a little short, so I set out to build a complete open-source reimplementation.

A fun example of the trend: [“oh no, i started making one of these apps” — Jarrod Watts](https://x.com/jarrodwatts/status/2077580457303302240).

<p align="center">
  <a href="https://x.com/jarrodwatts/status/2077580457303302240">
    <img src="assets/screenshots/jarrod-watts-chatgpt-desktop-clone.png" width="360" alt="Jarrod Watts sharing a ChatGPT Desktop-inspired app sketch">
  </a>
</p>

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

## Getting started

To install and use the app, download a prebuilt version from the [latest release](https://github.com/Ninot1Quyi/chatgpt-desktop-community/releases/latest).

### Development

Recommended: use ChatGPT Desktop, Claude Code, or Cursor and say:

> Clone [Ninot1Quyi/chatgpt-desktop-community](https://github.com/Ninot1Quyi/chatgpt-desktop-community), then start it.

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
- This remains an independent community implementation, so visual and behavioral differences are expected for now; the goal is complete visual and behavioral parity.

## Contributing

Humans and AI agents are welcome to share code, report bugs, and open pull requests.

Please keep private data out of contributions and run `npm run build` before submitting code.

## Trademark notice

OpenAI, ChatGPT, and Codex are trademarks of OpenAI. Their use here identifies compatibility and inspiration only.
