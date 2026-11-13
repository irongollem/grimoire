<template>
  <span class="beat-bookmark" :class="`is-${state}`" aria-hidden="true" data-testid="beat-bookmark" :data-state="state">
    <svg v-if="state === 'failed'" viewBox="0 0 10 10" class="beat-bookmark__mark"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
    <svg v-else-if="state === 'unreachable'" viewBox="0 0 10 10" class="beat-bookmark__mark"><path d="M1.5 8.5l7-7" /></svg>
  </span>
</template>

<script setup lang="ts">
import type { BeatBookmark } from "@/lib/quests/beatMark";

defineProps<{ state: BeatBookmark }>();
</script>

<style scoped>
.beat-bookmark { position: relative; display: inline-block; flex: none; width: .875rem; height: 1.3rem; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%); background: var(--muted-foreground); opacity: .45; }
.beat-bookmark.is-done { background: var(--tone-success); opacity: 1; }
.beat-bookmark.is-here { background: var(--primary-fill, var(--primary)); opacity: 1; }
.beat-bookmark.is-failed { background: var(--tone-danger); opacity: 1; }
/* Dark and slashed: it must differ from untouched by fill and mark, not shade. */
.beat-bookmark.is-unreachable { background: var(--foreground); opacity: .85; }
.beat-bookmark__mark { position: absolute; inset: 0 0 .35rem 0; width: 100%; height: calc(100% - .35rem); fill: none; stroke: var(--card); stroke-width: 1.4; stroke-linecap: round; }
.is-failed .beat-bookmark__mark { stroke: var(--on-danger); }
</style>
