<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#141415" />
    <title>Code Stack</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script src="https://unpkg.com/htmx.org@2.0.4"></script>
    <script src="/app.js" defer></script>
  </head>
  <body>
    <main class="app-shell">
      <div id="filetype-chips" class="filetype-chips" aria-label="File type filters"></div>
      <div
        id="code-stack"
        class="code-stack"
        hx-get="/fragments/code-stack"
        hx-trigger="load, every 4s"
        hx-swap="innerHTML"
      >
        <p class="empty-state">Loading code stack...</p>
      </div>
    </main>

    <div id="agent-status" class="agent-status" aria-live="polite" aria-atomic="true"></div>

    <form id="prompt-form" class="prompt-bar" hx-post="/fragments/run" hx-target="#run-output" hx-swap="innerHTML">
      <input type="hidden" id="prompt-file-path" name="filePath" />
      <input type="hidden" id="prompt-start-line" name="selectionStartFileLine" value="1" />
      <input type="hidden" id="prompt-end-line" name="selectionEndFileLine" value="1" />

      <input
        id="prompt-text"
        name="prompt"
        type="text"
        autocomplete="off"
        placeholder="Ask about the selected file"
        required
      />

      <button type="submit" class="send-button" aria-label="Send prompt">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h12M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>

    <div id="run-output" class="run-output" hidden aria-live="polite"></div>
  </body>
</html>
