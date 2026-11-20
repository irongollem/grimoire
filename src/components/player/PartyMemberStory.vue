<template>
  <div v-if="passages.length > 0" data-testid="member-story">
    <p class="text-eyebrow text-muted-foreground mb-1.5">Their story so far</p>
    <article v-for="p in passages" :key="p.id" class="mb-3 last:mb-0" :data-testid="`member-story-${p.id}`">
      <h3 v-if="p.title" class="m-0 text-heading-xs font-semibold text-foreground">{{ p.title }}</h3>
      <RichTextViewer v-if="p.body" :content="p.body" />
    </article>
  </div>
</template>

<script setup lang="ts">
/**
 * What this player may read of another character's backstory, past the Before play text the lightbox already shows
 * (#1226 story 10). The database's projection decides: a passage arrives only when it was told to the viewer, on a
 * backstory the DM shared with them, so nothing is filtered here.
 */
import { computed } from "vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import { usePlayerCanon } from "@/composables/canon/usePlayerCanon";

const { memberId } = defineProps<{ memberId: string }>();
const { world } = usePlayerCanon();
const passages = computed(() => world.value?.backstories.find((b) => b.memberId === memberId)?.passages ?? []);
</script>
