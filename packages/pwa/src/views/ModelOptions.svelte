<script lang="ts">
  type ModelOptionRenderable = {
    model: string;
    label: string;
  };

  export let catalog: readonly ModelOptionRenderable[] = [];
</script>

{#if catalog.length === 0}
  <option value="" selected>No models found</option>
{:else}
  {#each catalog as item, index}
    <option value={item.model} selected={index === 0}>{item.label}</option>
  {/each}
{/if}
