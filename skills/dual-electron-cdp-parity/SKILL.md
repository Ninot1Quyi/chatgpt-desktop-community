---
name: dual-electron-cdp-parity
description: Compare two running Electron applications through Chrome DevTools Protocol for UI parity work. Use when Codex needs to align an official Electron app and a replica, synchronize route and storage state, replay trusted user interactions into both apps, capture comparable screenshots, or quantify PNG visual differences without adding dependencies.
---

# Dual Electron CDP Parity

## Inputs

Require two running Electron or Chromium targets with remote debugging enabled. The default convention is:

- Official app: CDP port `9223`
- Replica app: CDP port `9222`
- Main targets: official `app://-/index.html`, replica local dev URL such as `http://localhost:5175/index.html`

Use repo scripts from `_analysis/` directly, or use the forwarding scripts in this skill:

- `scripts/state-sync.mjs` -> `_analysis/dual-cdp-state-sync.mjs`
- `scripts/action-replay.mjs` -> `_analysis/dual-cdp-action-replay.mjs`
- `scripts/png-diff.mjs` -> `_analysis/dual-png-diff.mjs`

Each script supports `--help`.

## Workflow

1. Confirm both apps are running and reachable through CDP:

   ```sh
   curl -s http://127.0.0.1:9223/json/version
   curl -s http://127.0.0.1:9222/json/version
   ```

2. Capture sanitized state from the source app:

   ```sh
   node _analysis/dual-cdp-state-sync.mjs --source 9223 --out /tmp/official-state.json
   ```

3. Apply that state to the target app, then refresh or navigate to the sanitized route:

   ```sh
   node _analysis/dual-cdp-state-sync.mjs --target 9222 --input /tmp/official-state.json --apply
   ```

4. Capture baseline screenshots and manifests with the existing comparer:

   ```sh
   node _analysis/dual-cdp-compare.mjs --original 9223 --replica 9222 --out /tmp/ui-parity
   ```

5. Replay trusted interactions into both apps when parity depends on hover, click, typing, drag, or keyboard behavior:

   ```sh
   node _analysis/dual-cdp-action-replay.mjs --steps steps.json --official 9223 --replica 9222 --out /tmp/replay
   ```

6. Quantify screenshot differences:

   ```sh
   node _analysis/dual-png-diff.mjs --actual /tmp/ui-parity/replica.png --expected /tmp/ui-parity/official.png --out /tmp/ui-parity/diff.png
   ```

Prefer fixing one visible mismatch at a time. Re-run state sync, capture, replay, and diff after each UI change.

## Stop

Stop when the official and replica apps have comparable route/storage state, the replayed interaction succeeds in both apps, fresh screenshots are captured, and the PNG diff summary is acceptable for the requested parity threshold.

Report the exact CDP ports, route, commands, output paths, and mismatch counts. If a script cannot connect, report the failing port and the `/json/version` result or connection error.

## Limitations

- The PNG diff script supports 8-bit, non-interlaced PNGs in common grayscale, RGB, grayscale-alpha, and RGBA formats.
- State sync intentionally redacts likely secrets and skips sensitive storage keys. Do not use it to transfer credentials, auth tokens, cookies, or session secrets.
- Action replay uses CDP `Input.dispatch*` events for trusted browser-level input, but it cannot bypass application disabled states, OS dialogs, or missing accessibility permissions.
- Visual parity still requires human judgment for acceptable product differences such as text content, dynamic timestamps, and animations.
