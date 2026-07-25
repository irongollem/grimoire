<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">GitHub Bug Reporter</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Fine-grained PAT (<code>issues: write</code> on irongollem/grimoire) used by the in-app bug/feature
        reporter to file GitHub issues. GitHub PATs can carry an expiry date — rotate it here when it lapses,
        no redeploy needed.
      </p>
    </div>

    <PlatformKeyField provider="github" label="GitHub token" hint="github_pat_…" />
  </div>
</template>

<script setup lang="ts">
import PlatformKeyField from "@/components/admin/PlatformKeyField.vue";
</script>
