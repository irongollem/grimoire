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
      <SegmentedControl v-model="store.mode" :options="MODES" />
      <SegmentedControl v-model="store.cardSize" :options="CARD_SIZES" />
      <SegmentedControl v-model="store.cardStyle" :options="CARD_STYLES" />

      <AppButton
        v-if="showsDeckBack"
        variant="subtle"
        size="sm"
        @click="showDeckBackPicker = !showDeckBackPicker"
      >
        Deck Back: {{ activeDeckBack?.name ?? "—" }}
      </AppButton>

      <AppButton
        variant="subtle"
        size="sm"
        label="Load Collection"
        :disabled="!store.library.length"
        @click="store.showLoadModal = true"
      />
      <AppButton
        variant="subtle"
        size="sm"
        label="Save Collection"
        :disabled="!selectedCount"
        @click="store.showSaveModal = true"
      />

      <AppButton
        variant="primary"
        size="md"
        :disabled="!selectedCount"
        @click="store.printCards"
      >
        Print {{ selectedCount ? `(${selectedCount})` : "" }}
      </AppButton>
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
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

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
  { value: "collection", label: "Collection" },
  { value: "loot", label: "Loot Deck" },
] as const;

const CARD_SIZES = [
  { value: "mtg", label: "Trading card (63×88mm)" },
  { value: "tarot", label: "Tarot (70×120mm)" },
] as const;

const CARD_STYLES = [
  { value: "inked", label: "Inked" },
  { value: "modern", label: "Modern" },
] as const;
</script>

<style scoped>
@reference "@/assets/main.css";

.forge-topbar {
  @apply flex items-start justify-between gap-4 flex-wrap shrink-0;
}
.forge-title {
  @apply text-title font-bold text-foreground;
}
.forge-sub {
  @apply text-body text-muted-foreground;
}
.topbar-actions {
  @apply flex items-center gap-2 flex-wrap;
}
.duplex-hint {
  @apply text-caption text-muted-foreground italic w-full mt-0.5;
}
</style>
