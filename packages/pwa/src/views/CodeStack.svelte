<script lang="ts">
  type CodeStackRenderableEntry = {
    path: string;
    fileTypeKey: string;
    fileTypeLabel: string;
    lineCount: number;
    language: string;
    codeHtml: string;
  };

  export let entries: readonly CodeStackRenderableEntry[] = [];
</script>

{#if entries.length === 0}
  <p class="empty-state">No code files were found in this workspace.</p>
{:else}
  {#each entries as entry}
    <section class="file-block" data-file-block data-file-type-key={entry.fileTypeKey} data-file-type-label={entry.fileTypeLabel}>
      <button
        type="button"
        class="file-divider"
        data-divider
        data-path={entry.path}
        data-type-key={entry.fileTypeKey}
        data-start="1"
        data-end={entry.lineCount}
        aria-expanded="true"
      >
        <span class="divider-path">/// {entry.path}</span>
        <span class="divider-type">{entry.fileTypeLabel}</span>
      </button>
      <pre class="code-block"><code class={`hljs language-${entry.language}`}>{@html entry.codeHtml}</code></pre>
    </section>
  {/each}
{/if}
