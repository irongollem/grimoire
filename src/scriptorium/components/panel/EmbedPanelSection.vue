<template>
  <div data-testid="panel-embed">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Linked entry</h2>
      <p class="text-body text-foreground">{{ typeLabel }} · updates from its source</p>
    </PanelSection>

    <PanelSection title="How it shows">
      <PanelField v-if="showSizeToggle" label="Size">
        <SegmentedControl :model-value="size" :options="SIZE_OPTIONS" size="xs" block @update:model-value="emit('update', { size: $event })" />
      </PanelField>
      <AppCheckbox
        v-if="showArtToggle"
        size="sm"
        label="Show the art"
        :model-value="showArt"
        @update:model-value="emit('update', { showArt: $event })"
      />
      <PanelField v-if="showArtChoiceToggle" label="Art">
        <SegmentedControl :model-value="art" :options="ART_OPTIONS" size="xs" block @update:model-value="emit('update', { art: $event })" />
      </PanelField>
      <AppCheckbox
        v-if="entityType === 'monster'"
        size="sm"
        label="Show the lore"
        :model-value="showLore"
        @update:model-value="emit('update', { showLore: $event })"
      />
      <PanelField v-if="entityType === 'monster'" label="Band">
        <SegmentedControl :model-value="bandPosition" :options="BAND_POSITION_OPTIONS" size="xs" block @update:model-value="emit('update', { bandPosition: $event })" />
      </PanelField>
      <AppCheckbox
        size="sm"
        label="Starts a new page"
        hint="Turn off for a variant that follows its family's first entry on the same page."
        :model-value="startsPage"
        @update:model-value="emit('update', { startsPage: $event })"
      />
    </PanelSection>

    <PanelSection title="When shared">
      <PanelField label="Reveals">
        <div class="flex items-center gap-2">
          <EmbedRevealControl :entity-type="entityType" :show-art="showArt" :reveal="reveal" @update:reveal="emit('update', { reveal: $event })" />
          <span class="min-w-0 text-caption text-muted-foreground" data-testid="panel-embed-reveal">{{ revealSummary }}</span>
        </div>
      </PanelField>
    </PanelSection>

    <PanelSection>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="subtle" size="sm" :icon="IconExternalLink" label="Open" @click="emit('open')" />
        <AppButton variant="subtle" size="sm" :icon="IconScissors" label="Detach…" tooltip="Detach: the content stays but stops updating from the source" @click="emit('detach')" />
      </div>
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * A linked entry (#1176, frame 06): everything the entry's hover toolbar had.
 * On the page the entry keeps only Open and Detach; the rest is chosen here.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import EmbedRevealControl from "@/scriptorium/components/EmbedRevealControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import type { EntityArtChoice } from "@/scriptorium/lib/entityArt";
import { describeEmbedReveal, type EntityEmbedReveal } from "@/scriptorium/lib/embedReveal";
import { IconExternalLink, IconScissors } from "@/lib/icons";
import type { EntityEmbedSize, EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";

const { attrs } = defineProps<{ attrs: Readonly<Record<string, unknown>> }>();
const emit = defineEmits<{
  update: [patch: Record<string, unknown>];
  open: [];
  detach: [];
}>();

const TYPE_LABELS: Record<EntityEmbedType, string> = {
  npc: "NPC",
  monster: "Monster",
  spell: "Spell",
  item: "Item",
  location: "Location",
  quest: "Quest",
  deity: "Deity",
  species: "Species",
  faction: "Faction",
  subclass: "Subclass",
};
const entityType = computed(() => attrs.entityType as EntityEmbedType);
const typeLabel = computed(() => TYPE_LABELS[entityType.value]);

// Only a monster or NPC renders as a stat block, so only they have a size; deities, species and
// factions print a plain picture (art on or off, no cut-out choice); the lore and band are a monster's.
const ART_TYPES: readonly EntityEmbedType[] = ["monster", "npc", "deity", "species", "faction"];
const showSizeToggle = computed(() => entityType.value === "monster" || entityType.value === "npc");
const showArtToggle = computed(() => ART_TYPES.includes(entityType.value));
const showArt = computed(() => attrs.showArt !== false);
const showArtChoiceToggle = computed(() => showSizeToggle.value && showArt.value);
const showLore = computed(() => attrs.showLore !== false);
const startsPage = computed(() => attrs.startsPage !== false);
const size = computed(() => (attrs.size as EntityEmbedSize | undefined) ?? "auto");
const art = computed(() => (attrs.art as EntityArtChoice | undefined) ?? "auto");
const bandPosition = computed(() => (attrs.bandPosition === "bottom" ? "bottom" : "top"));
const reveal = computed(() => (attrs.reveal as EntityEmbedReveal | null | undefined) ?? null);

const revealSummary = computed(() =>
  describeEmbedReveal({ entityType: entityType.value, showArt: showArt.value, reveal: reveal.value }),
);

const SIZE_OPTIONS: SegmentedOption<EntityEmbedSize>[] = [
  { value: "auto", label: "Auto", tooltip: "Size itself from how much this stat block holds" },
  { value: "column", label: "One column", tooltip: "Always one column-width block" },
  { value: "wide", label: "Full width", tooltip: "Always span both page columns" },
];
const ART_OPTIONS: SegmentedOption<EntityArtChoice>[] = [
  { value: "auto", label: "Auto", tooltip: "The cutout when there is one, otherwise the picture" },
  { value: "cutout", label: "Cutout", tooltip: "The creature on a transparent background" },
  { value: "picture", label: "Picture", tooltip: "The full picture with its background" },
];
const BAND_POSITION_OPTIONS: SegmentedOption<"top" | "bottom">[] = [
  { value: "top", label: "Top", tooltip: "Band first, art and lore below (default)" },
  { value: "bottom", label: "Bottom", tooltip: "Art and lore first, band below, a wide entry only" },
];
</script>
