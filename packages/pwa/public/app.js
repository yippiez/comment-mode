const filePathInput = document.getElementById("prompt-file-path");
const startLineInput = document.getElementById("prompt-start-line");
const endLineInput = document.getElementById("prompt-end-line");
const fileLabel = document.getElementById("prompt-file-label");

function updateFileSelection(path, startLine, endLine) {
  if (!filePathInput || !startLineInput || !endLineInput || !fileLabel) return;

  filePathInput.value = path;
  startLineInput.value = String(startLine);
  endLineInput.value = String(endLine);
  fileLabel.textContent = `${path} (lines ${String(startLine)}-${String(endLine)})`;

  const cards = document.querySelectorAll("[data-file-card]");
  for (const card of cards) {
    card.classList.remove("is-selected");
  }

  const activeButton = document.querySelector(`[data-use-file][data-path="${CSS.escape(path)}"]`);
  const activeCard = activeButton?.closest("[data-file-card]");
  if (activeCard) {
    activeCard.classList.add("is-selected");
  }
}

function hydrateDefaultSelection() {
  if (!filePathInput || filePathInput.value) return;
  const firstButton = document.querySelector("[data-use-file]");
  if (!(firstButton instanceof HTMLElement)) return;

  const path = firstButton.dataset.path;
  const startLine = Number.parseInt(firstButton.dataset.start ?? "1", 10);
  const endLine = Number.parseInt(firstButton.dataset.end ?? "1", 10);
  if (!path) return;

  updateFileSelection(path, Number.isFinite(startLine) ? startLine : 1, Number.isFinite(endLine) ? endLine : 1);
}

document.body.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest("[data-use-file]");
  if (!(button instanceof HTMLElement)) return;

  const path = button.dataset.path;
  const startLine = Number.parseInt(button.dataset.start ?? "1", 10);
  const endLine = Number.parseInt(button.dataset.end ?? "1", 10);
  if (!path) return;

  updateFileSelection(path, Number.isFinite(startLine) ? startLine : 1, Number.isFinite(endLine) ? endLine : 1);
});

document.body.addEventListener("htmx:afterSwap", (event) => {
  const detail = event.detail;
  if (!detail || !(detail.target instanceof HTMLElement)) return;

  if (detail.target.id === "code-stack") {
    if (filePathInput && filePathInput.value) {
      const startLine = Number.parseInt(startLineInput?.value ?? "1", 10);
      const endLine = Number.parseInt(endLineInput?.value ?? "1", 10);
      updateFileSelection(
        filePathInput.value,
        Number.isFinite(startLine) ? startLine : 1,
        Number.isFinite(endLine) ? endLine : 1,
      );
    } else {
      hydrateDefaultSelection();
    }
  }
});

hydrateDefaultSelection();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration failures in local dev.
    });
  });
}
