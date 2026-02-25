<script lang="ts">
  type RunResultRenderable = {
    success: boolean;
    messages: readonly string[];
    error?: string;
  };

  export let result: RunResultRenderable;
</script>

<div
  data-run-state={result.success ? "done" : "failed"}
  data-run-detail={result.error ?? result.messages[result.messages.length - 1] ?? ""}
></div>
