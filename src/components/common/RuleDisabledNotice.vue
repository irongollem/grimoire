<script setup lang="ts">
/**
 * Shown in place of an optional module's view when the DM has switched that
 * rule off for the campaign.
 *
 * Nav entries already hide a disabled module, but a bookmarked or hand-typed
 * URL still reaches the view — so the view itself must refuse to render rather
 * than let a player keep acting inside a module the table isn't using.
 */
const { moduleName, hint } = defineProps<{
  moduleName: string;
  /** What the reader can do about it, in their own terms. */
  hint?: string;
}>();
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-16 text-center">
    <p class="font-cinzel text-lg font-semibold">{{ moduleName }} is switched off</p>
    <p class="mt-2 text-sm text-muted-foreground">
      Your DM hasn't enabled this module for this campaign.
    </p>
    <p v-if="hint" class="mt-2 text-2xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>
