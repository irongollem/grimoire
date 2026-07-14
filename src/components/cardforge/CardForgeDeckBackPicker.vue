<template>
  <div class="picker-backdrop" @click.self="emit('close')">
    <div class="picker-box">
      <h2 class="picker-title">Deck Back</h2>
      <p class="picker-sub">
        All cards in this loot deck print with the same back image. Pick a
        design to load it now.
      </p>
      <div class="picker-grid">
        <button
          v-for="back in BUILTIN_DECK_BACKS"
          :key="back.id"
          type="button"
          class="picker-card"
          :class="{ active: activeId === back.id }"
          @click="select(back.id)"
        >
          <img :src="back.urls[store.cardSize]" :alt="back.name" />
          <div class="picker-meta">
            <span class="picker-name">{{ back.name }}</span>
            <span class="picker-blurb">{{ back.blurb }}</span>
          </div>
        </button>
      </div>
      <div class="picker-actions">
        <button type="button" class="picker-close" @click="emit('close')">
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useCardForgeStore } from "@/stores/cardForge";
import { BUILTIN_DECK_BACKS } from "@/components/cardforge/styles/loot/deckBacks";

/**
 * Which deck's back this picker is editing. The Interlude outcome deck needs a
 * shared back for the same reason the loot deck does, and reuses the same
 * artwork — but they are separate decks, so choosing a back for one must not
 * silently restyle the other.
 */
const { deck = "loot" } = defineProps<{ deck?: "loot" | "downtime" }>();

const emit = defineEmits<{ close: [] }>();
const store = useCardForgeStore();

const activeId = computed(() =>
  deck === "downtime" ? store.downtimeDeckBackId : store.lootDeckBackId,
);

function select(id: string) {
  if (deck === "downtime") store.downtimeDeckBackId = id;
  else store.lootDeckBackId = id;
  emit("close");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.picker-backdrop {
  @apply fixed inset-0 bg-black/60 flex items-center justify-center z-50;
}
.picker-box {
  @apply bg-card border border-border rounded-xl p-6 w-full max-w-3xl flex flex-col gap-3 max-h-[85vh] overflow-y-auto;
}
.picker-title {
  @apply font-cinzel text-lg font-bold text-foreground;
}
.picker-sub {
  @apply font-fell text-sm text-muted-foreground;
}
.picker-grid {
  @apply grid gap-3;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.picker-card {
  @apply flex flex-col gap-1 p-2 rounded-lg border border-border bg-muted/40 hover:border-primary/60 transition-colors cursor-pointer text-left;
}
.picker-card.active {
  @apply border-primary bg-primary/10;
}
.picker-card img {
  @apply w-full rounded;
  aspect-ratio: 1061 / 1482;
  object-fit: cover;
}
.picker-meta {
  @apply flex flex-col gap-0.5 px-1 pt-1 pb-0.5;
}
.picker-name {
  @apply font-cinzel text-xs font-semibold text-foreground;
}
.picker-blurb {
  @apply font-fell text-xs text-muted-foreground italic line-clamp-2;
}
.picker-actions {
  @apply flex justify-end pt-1;
}
.picker-close {
  @apply font-cinzel text-xs font-semibold px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors;
}

@media print {
  .picker-backdrop {
    display: none !important;
  }
}
</style>
