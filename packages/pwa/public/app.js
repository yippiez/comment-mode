const filePathInput = document.getElementById("prompt-file-path");
const startLineInput = document.getElementById("prompt-start-line");
const endLineInput = document.getElementById("prompt-end-line");
const codeStack = document.getElementById("code-stack");
const filetypeChips = document.getElementById("filetype-chips");
const promptForm = document.getElementById("prompt-form");
const runOutput = document.getElementById("run-output");
const agentStatus = document.getElementById("agent-status");

const DEV_HASH_ENDPOINT = "/api/dev-hash";
const SW_CLEAR_FLAG = "comment-mode-sw-cleared";

const collapsedPaths = new Set();
const filteredTypeKeys = new Set();
let selectedPath = "";
let currentDevHash;
let devHashRequestInFlight = false;
let statusHideTimer;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateFileSelection(path, startLine, endLine) {
  if (!filePathInput || !startLineInput || !endLineInput) return;

  filePathInput.value = path;
  startLineInput.value = String(startLine);
  endLineInput.value = String(endLine);
  selectedPath = path;

  const dividers = document.querySelectorAll("[data-divider]");
  for (const divider of dividers) {
    if (!(divider instanceof HTMLElement)) continue;
    if (divider.dataset.path === path) {
      divider.classList.add("is-active");
    } else {
      divider.classList.remove("is-active");
    }
  }
}

function toggleCollapsed(path, block, divider) {
  const isCollapsed = block.classList.toggle("is-collapsed");
  divider.setAttribute("aria-expanded", String(!isCollapsed));

  if (isCollapsed) {
    collapsedPaths.add(path);
  } else {
    collapsedPaths.delete(path);
  }
}

function hydrateStack() {
  if (!(codeStack instanceof HTMLElement)) return;
  const dividers = codeStack.querySelectorAll("[data-divider]");
  let hasSelectedPath = false;

  for (const divider of dividers) {
    if (!(divider instanceof HTMLElement)) continue;
    const path = divider.dataset.path;
    const block = divider.closest("[data-file-block]");
    if (!path || !(block instanceof HTMLElement)) continue;

    if (collapsedPaths.has(path)) {
      block.classList.add("is-collapsed");
      divider.setAttribute("aria-expanded", "false");
    } else {
      block.classList.remove("is-collapsed");
      divider.setAttribute("aria-expanded", "true");
    }
  }

  refreshFiletypeChips();

  if (selectedPath) {
    const divider = codeStack.querySelector(`[data-divider][data-path="${CSS.escape(selectedPath)}"]`);
    const block = divider?.closest("[data-file-block]");
    if (divider instanceof HTMLElement && block instanceof HTMLElement && !block.classList.contains("is-filtered-out")) {
      hasSelectedPath = true;
      const startLine = Number.parseInt(divider.dataset.start ?? "1", 10);
      const endLine = Number.parseInt(divider.dataset.end ?? "1", 10);
      updateFileSelection(
        selectedPath,
        Number.isFinite(startLine) ? startLine : 1,
        Number.isFinite(endLine) ? endLine : 1,
      );
    }
  }

  if (!hasSelectedPath && filePathInput) {
    filePathInput.value = "";
    selectedPath = "";
  }

  if (!filePathInput || !filePathInput.value) {
    const firstDivider = findFirstVisibleDivider();
    if (firstDivider instanceof HTMLElement) {
      const path = firstDivider.dataset.path;
      const startLine = Number.parseInt(firstDivider.dataset.start ?? "1", 10);
      const endLine = Number.parseInt(firstDivider.dataset.end ?? "1", 10);
      if (path) {
        updateFileSelection(
          path,
          Number.isFinite(startLine) ? startLine : 1,
          Number.isFinite(endLine) ? endLine : 1,
        );
      }
    }
  }
}

function findFirstVisibleDivider() {
  if (!(codeStack instanceof HTMLElement)) return null;

  const dividers = codeStack.querySelectorAll("[data-divider]");
  for (const divider of dividers) {
    if (!(divider instanceof HTMLElement)) continue;
    const block = divider.closest("[data-file-block]");
    if (!(block instanceof HTMLElement)) continue;
    if (block.classList.contains("is-filtered-out")) continue;
    return divider;
  }

  return null;
}

function refreshFiletypeChips() {
  if (!(codeStack instanceof HTMLElement) || !(filetypeChips instanceof HTMLElement)) return;

  const typeMap = new Map();
  const blocks = codeStack.querySelectorAll("[data-file-block]");

  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) continue;
    const typeKey = (block.dataset.fileTypeKey ?? "text").trim();
    const typeLabel = (block.dataset.fileTypeLabel ?? typeKey.toUpperCase()).trim();

    const current = typeMap.get(typeKey);
    if (current) {
      current.count += 1;
      continue;
    }

    typeMap.set(typeKey, { key: typeKey, label: typeLabel, count: 1 });
  }

  for (const filteredTypeKey of [...filteredTypeKeys]) {
    if (!typeMap.has(filteredTypeKey)) {
      filteredTypeKeys.delete(filteredTypeKey);
    }
  }

  const items = [...typeMap.values()].sort((left, right) => left.label.localeCompare(right.label));
  if (items.length === 0) {
    filetypeChips.innerHTML = "";
    return;
  }

  filetypeChips.innerHTML = items
    .map((item) => {
      const isFiltered = filteredTypeKeys.has(item.key);
      const stateClass = isFiltered ? " is-filtered" : "";
      return `<button type="button" class="filetype-chip${stateClass}" data-filetype-chip data-type-key="${escapeHtml(item.key)}"><span>${escapeHtml(item.label)}</span><strong>${item.count.toString()}</strong></button>`;
    })
    .join("");

  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) continue;
    const typeKey = (block.dataset.fileTypeKey ?? "text").trim();
    block.classList.toggle("is-filtered-out", filteredTypeKeys.has(typeKey));
  }
}

function clearStatusTimer() {
  if (typeof statusHideTimer !== "number") return;
  window.clearTimeout(statusHideTimer);
  statusHideTimer = undefined;
}

function setAgentStatus(state, message) {
  if (!(agentStatus instanceof HTMLElement)) return;

  clearStatusTimer();

  if (!state) {
    agentStatus.removeAttribute("data-state");
    agentStatus.textContent = "";
    return;
  }

  agentStatus.dataset.state = state;
  agentStatus.textContent = message;

  if (state === "done") {
    statusHideTimer = window.setTimeout(() => {
      setAgentStatus("", "");
    }, 2200);
  }
}

function applyRunStatusFromFragment() {
  if (!(runOutput instanceof HTMLElement)) return;

  const fragment = runOutput.querySelector("[data-run-state]");
  if (!(fragment instanceof HTMLElement)) return;

  const state = fragment.dataset.runState;
  if (state === "done") {
    setAgentStatus("done", "Agent done");
    return;
  }

  setAgentStatus("failed", "Agent failed");
}

function refreshStylesheet(nextHash) {
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (const link of links) {
    if (!(link instanceof HTMLLinkElement)) continue;
    if (!link.href.startsWith(window.location.origin)) continue;

    const url = new URL(link.href);
    if (!url.pathname.endsWith(".css")) continue;

    url.searchParams.set("v", nextHash);
    link.href = url.toString();
  }
}

function refreshCodeStack() {
  if (!(codeStack instanceof HTMLElement)) return;
  if (typeof window.htmx === "undefined") return;

  const beforeY = window.scrollY;

  window.htmx.ajax("GET", "/fragments/code-stack", {
    target: "#code-stack",
    swap: "innerHTML",
  });

  window.requestAnimationFrame(() => {
    window.scrollTo(0, beforeY);
  });
}

document.body.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const chip = target.closest("[data-filetype-chip]");
  if (chip instanceof HTMLElement) {
    const typeKey = chip.dataset.typeKey?.trim();
    if (!typeKey) return;

    if (filteredTypeKeys.has(typeKey)) {
      filteredTypeKeys.delete(typeKey);
    } else {
      filteredTypeKeys.add(typeKey);
    }

    hydrateStack();
    return;
  }

  const divider = target.closest("[data-divider]");
  if (!(divider instanceof HTMLElement)) return;

  const path = divider.dataset.path;
  const startLine = Number.parseInt(divider.dataset.start ?? "1", 10);
  const endLine = Number.parseInt(divider.dataset.end ?? "1", 10);
  if (!path) return;

  const block = divider.closest("[data-file-block]");
  if (block instanceof HTMLElement) {
    toggleCollapsed(path, block, divider);
  }

  updateFileSelection(path, Number.isFinite(startLine) ? startLine : 1, Number.isFinite(endLine) ? endLine : 1);
});

document.body.addEventListener("htmx:afterSwap", (event) => {
  const detail = event.detail;
  if (!detail || !(detail.target instanceof HTMLElement)) return;

  if (detail.target.id === "code-stack") {
    hydrateStack();
    return;
  }

  if (detail.target.id === "run-output") {
    applyRunStatusFromFragment();
  }
});

document.body.addEventListener("htmx:beforeRequest", (event) => {
  const detail = event.detail;
  if (!detail || !(detail.elt instanceof HTMLElement)) return;
  if (!detail.elt.closest("#prompt-form")) return;
  setAgentStatus("running", "Agent running");
});

document.body.addEventListener("htmx:responseError", (event) => {
  const detail = event.detail;
  if (!detail || !(detail.elt instanceof HTMLElement)) return;
  if (!detail.elt.closest("#prompt-form")) return;
  setAgentStatus("failed", "Agent failed");
});

document.body.addEventListener("htmx:sendError", (event) => {
  const detail = event.detail;
  if (!detail || !(detail.elt instanceof HTMLElement)) return;
  if (!detail.elt.closest("#prompt-form")) return;
  setAgentStatus("failed", "Agent failed");
});

hydrateStack();

async function clearLegacyServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) return;

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((cacheKey) => cacheKey.startsWith("comment-mode-pwa-"))
        .map((cacheKey) => caches.delete(cacheKey)),
    );
  }

  sessionStorage.setItem(SW_CLEAR_FLAG, "1");
}

async function pollDevHash() {
  if (devHashRequestInFlight) return;
  devHashRequestInFlight = true;

  try {
    const response = await fetch(DEV_HASH_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return;

    const nextHash = (await response.text()).trim();
    if (!nextHash) return;

    if (typeof currentDevHash === "undefined") {
      currentDevHash = nextHash;
      return;
    }

    if (nextHash !== currentDevHash) {
      currentDevHash = nextHash;
      refreshStylesheet(nextHash);
      refreshCodeStack();
      return;
    }

    currentDevHash = nextHash;
  } catch {
    // Keep polling when temporary dev server errors happen.
  } finally {
    devHashRequestInFlight = false;
  }
}

function startDevHotReload() {
  void pollDevHash();
  window.setInterval(() => {
    void pollDevHash();
  }, 1000);
}

window.addEventListener("load", () => {
  void clearLegacyServiceWorker();
  startDevHotReload();

  if (promptForm instanceof HTMLFormElement) {
    promptForm.addEventListener("submit", () => {
      setAgentStatus("running", "Agent running");
    });
  }
});
