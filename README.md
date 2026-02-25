# comment-mode

A review-based workflow to work with coding agents.

It provides:
- keyboard-first file/code navigation
- inline agent prompt rows
- in-app search modal with previews
- multiple visual themes

## Run TUI (with internal server)

```bash
bun install
bun dev
```

The TUI now starts a local server automatically, generates an internal password,
and uses it for all server websocket calls.

## Standalone server (localhost only)

```bash
bun run server --password "your-strong-password"
```

- The server binds to `127.0.0.1` only.
- A password is required for standalone mode.
- Client RPC goes through websocket (`/ws`) and requires the password token.

## CLI test client

You can test the server methods without the TUI:

```bash
bun run cli --help
bun run cli health --url http://127.0.0.1:4042
bun run cli models --url http://127.0.0.1:4042 --password "your-strong-password"
```

## Run PWA (HTMX, mobile-first)

```bash
bun run pwa
```

- Opens a localhost-only web app at `http://127.0.0.1:4173` (or the printed port).
- Shows all code files in a stacked vertical view (no file explorer).
- Includes a prompt panel below the code stack to run `opencode` against the selected file.
- Uses a single built-in Vague-inspired theme.

## Themes

- Vague
- OpenCode
- Tokyo Night
- Soda

### Vague

![Vague theme preview](assets/vague.jpg)

### OpenCode

![OpenCode theme preview](assets/opencode.jpg)

### Tokyo Night

![Tokyo Night theme preview](assets/tokyo-night.jpg)

### Soda

![Soda theme preview](assets/soda.jpg)
