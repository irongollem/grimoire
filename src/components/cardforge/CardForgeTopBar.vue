<template>
  <div class="forge-topbar">
    <div>
      <div class="inline-flex items-center gap-2">
        <h1 class="forge-title">Card Forge</h1>
        <ManualHelpLink page="card-forge-card-printer" />
      </div>
      <p class="forge-sub">
        {{
          store.mode === "loot"
            ? "Build a printable loot deck — items only, full info on the front, shared back."
            : "Craft printable cards for your NPCs, monsters, items &amp; spells"
        }}
      </p>
    </div>

    <div class="topbar-actions">
      <div class="size-toggle">
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          class="size-btn"
          :class="{ active: store.mode === m.id }"
          @click="store.mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="size-toggle">
        <button
          v-for="sz in CARD_SIZES"
          :key="sz.id"
          type="button"
          class="size-btn"
          :class="{ active: store.cardSize === sz.id }"
          @click="store.cardSize = sz.id"
        >
          {{ sz.label }}
        </button>
      </div>

      <div class="size-toggle">
        <button
          v-for="st in CARD_STYLES"
          :key="st.id"
          type="button"
          class="size-btn"
          :class="{ active: store.cardStyle === st.id }"
          @click="store.cardStyle = st.id"
        >
          {{ st.label }}
        </button>
      </div>

      <button
        v-if="showsDeckBack"
        type="button"
        class="lib-btn"
        @click="showDeckBackPicker = !showDeckBackPicker"
      >
        Deck Back: {{ activeDeckBack?.name ?? "—" }}
      </button>

      <button
        type="button"
        class="lib-btn"
        :disabled="!store.library.length"
        @click="store.showLoadModal = true"
      >
        Load Collection
      </button>
      <button
        type="button"
        class="lib-btn"
        :disabled="!selectedCount"
        @click="store.showSaveModal = true"
      >
        Save Collection
      </button>

      <button
        type="button"
        class="print-btn"
        :disabled="!selectedCount"
        @click="store.printCards"
      >
        Print {{ selectedCount ? `(${selectedCount})` : "" }}
      </button>
    </div>

    <CardForgeDeckBackPicker
      v-if="showDeckBackPicker && showsDeckBack"
      :deck="deckBackTarget"
      @close="showDeckBackPicker = false"
    />

    <p class="duplex-hint">
      {{
        store.mode === "loot"
          ? "Prints item fronts then a sheet of identical deck backs. Flip on the long (left) edge for double-sided."
          : "Prints fronts then backs. For double-sided printing, flip on the long (left) edge — backs are column-reversed so they align."
      }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useCardForgeStore } from "@/stores/cardForge";
import { useCardForgeData } from "@/composables/useCardForgeData";
import { deckBackById } from "@/components/cardforge/styles/loot/deckBacks";
import CardForgeDeckBackPicker from "./CardForgeDeckBackPicker.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";

const store = useCardForgeStore();
const { selectedSubjects } = useCardForgeData();
const selectedCount = computed(() => selectedSubjects.value.length);

const showDeckBackPicker = ref(false);
/** The loot deck and the Interlude outcome deck each need a shared back. */
const deckBackTarget = computed<"loot" | "downtime">(() =>
  store.mode === "loot" ? "loot" : "downtime",
);
const showsDeckBack = computed(
  () => store.mode === "loot" || store.source === "downtime",
);
const activeDeckBack = computed(() =>
  deckBackById(
    deckBackTarget.value === "downtime" ? store.downtimeDeckBackId : store.lootDeckBackId,
  ),
);

const MODES = [
  { id: "collection", label: "Collection" },
  { id: "loot", label: "Loot Deck" },
] as const;

const CARD_SIZES = [
  { id: "mtg", label: "Trading card (63×88mm)" },
  { id: "tarot", label: "Tarot (70×120mm)" },
] as const;

const CARD_STYLES = [
  { id: "inked", label: "Inked" },
  { id: "modern", label: "Modern" },
] as const;
</script>

<style scoped>
@reference "@/assets/main.css";

.forge-topbar {
  @apply flex items-start justify-between gap-4 flex-wrap shrink-0;
}
.forge-title {
  @apply font-cinzel text-2xl font-bold text-foreground;
}
.forge-sub {
  @apply text-body text-muted-foreground;
}
.topbar-actions {
  @apply flex items-center gap-2 flex-wrap;
}
.size-toggle {
  @apply flex rounded-md overflow-hidden border border-border;
}
.size-btn {
  @apply font-cinzel text-xs font-semibold px-3 py-1.5 text-muted-foreground bg-card transition-colors;
}
.size-btn.active {
  @apply bg-primary text-primary-foreground;
}
.lib-btn {
  @apply font-cinzel text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground disabled:cursor-not-allowed;
}
.print-btn {
  @apply inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40;
}
.duplex-hint {
  @apply text-caption text-muted-foreground italic w-full mt-0.5;
}
</style>
