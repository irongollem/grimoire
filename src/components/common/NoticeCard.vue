<template>
  <div
    class="rounded-lg border border-border bg-card px-4 py-4 flex flex-col gap-3"
    role="status"
  >
    <div class="flex flex-col gap-1">
      <span class="font-cinzel text-label-lg font-semibold text-foreground">{{ title }}</span>
      <p class="text-caption text-muted-foreground"><slot /></p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A titled explanation with a row of actions, in a plain card.
 *
 * The shell of the notices that stand above a page and say why it looks the
 * way it does — `CampaignLensNotice` on the dashboard. Extracted in #847 when
 * it had a twin (the no-DM-campaigns notice, since grown into
 * `DmCampaignGate`, which replaces the page rather than annotating it); the
 * next notice of this kind should reach for it rather than re-typing it.
 *
 * The body is a slot rather than a prop because these paragraphs name controls
 * mid-sentence and need markup to do it.
 *
 * Not the amber `EmbedMissingContentBanner`, which is a different thing on
 * purpose: a one-line banner with a link, dismissible, for a condition that is
 * informational rather than an explanation of the page.
 */
defineProps<{ title: string }>();
</script>
