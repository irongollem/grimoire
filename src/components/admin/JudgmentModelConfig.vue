<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">Judgment model (TypeSafe Jev)</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Jev answers small typed questions and writes no text: whether an imported entry is one a campaign already has,
        whether a search hit is what was asked for, which manual page answers a question, which listed row a generator
        meant, and whether a suggested NPC line gives a disguise away. It runs only for campaigns with AI on, is free
        to users and is recorded as <code>entity_judgment</code>. With no key here, every one of those falls back to
        how it worked before (#1061). Setting the key sends campaign text to TypeSafe, so it belongs after the privacy
        policy names them.
      </p>
    </div>

    <PlatformKeyField provider="typesafe" label="TypeSafe API key" hint="TypeSafe key" />
  </div>
</template>

<script setup lang="ts">
import PlatformKeyField from "@/components/admin/PlatformKeyField.vue";
</script>
