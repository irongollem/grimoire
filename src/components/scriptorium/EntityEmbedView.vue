<template>
  <NodeViewWrapper as="div" class="sc-entity-embed" contenteditable="false">
    <div v-if="isEditable" class="sc-entity-embed-toolbar" contenteditable="false">
      <span class="sc-entity-embed-badge">{{ typeLabel }} · linked</span>
      <div class="sc-entity-embed-actions">
        <SegmentedControl
          v-if="showSizeToggle"
          :model-value="size"
          :options="SIZE_OPTIONS"
          size="xs"
          variant="ghost"
          @update:model-value="setSize"
        />
        <AppButton
          v-if="showArtToggle"
          size="xs"
          variant="ghost"
          fill="muted"
          :icon="IconImage"
          icon-size="xs"
          :active="showArt"
          :tooltip="showArt ? 'Hide the portrait/art' : 'Show the portrait/art'"
          @click="toggleShowArt"
        />
        <AppButton
          size="xs"
          variant="ghost"
          fill="muted"
          label="New page"
          :active="startsPage"
          tooltip="Start this entry on a fresh page — turn off for a variant that follows its family's first entry on the same page"
          @click="toggleStartsPage"
        />
        <AppButton
          size="xs"
          variant="ghost"
          fill="muted"
          :icon="IconExternalLink"
          icon-size="xs"
          tooltip="Open"
          @click="openEntity"
        />
        <AppButton
          size="xs"
          variant="ghost"
          fill="muted"
          :icon="IconScissors"
          icon-size="xs"
          tooltip="Detach: stops updating from the source"
          @click="detach"
        />
      </div>
    </div>

    <div v-if="isLoading && rawHtml === undefined" class="sc-entity-embed-loading">Loading&hellip;</div>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized via sanitizeHtml() above -->
    <div v-else class="sc-entity-embed-body" v-html="sanitizedHtml" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/SegmentedControl.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useEntityEmbedData } from "@/composables/scriptorium/useEntityEmbedData";
import { entityRefKey, missingEntityMarkerHtml } from "@/lib/scriptorium/entityEmbeds";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { placeRoute } from "@/lib/locations/placeRoute";
import { IconExternalLink, IconScissors, IconImage } from "@/lib/icons";
import type { EntityEmbedType, EntityEmbedSize } from "@/lib/tiptap/entityEmbed";

const props = defineProps({ ...nodeViewProps });
const { confirm } = useConfirm();
const router = useRouter();

const isEditable = computed(() => props.editor.isEditable);
const entityType = computed(() => props.node.attrs.entityType as EntityEmbedType);
const entityId = computed(() => props.node.attrs.entityId as string);
const size = computed(() => (props.node.attrs.size as EntityEmbedSize | undefined) ?? "auto");
// Only a monster/NPC's linked embed renders as a stat block at all — sizing a
// spell/item/location/quest embed is meaningless, so the toggle only shows
// for the two entity types scriptoriumImport.ts frames as a stat block.
const showSizeToggle = computed(() => entityType.value === "monster" || entityType.value === "npc");
const SIZE_OPTIONS: SegmentedOption<EntityEmbedSize>[] = [
  { value: "auto", label: "Auto", tooltip: "Size itself from how much this stat block holds" },
  { value: "column", label: "Column", tooltip: "Always one column-width block" },
  { value: "wide", label: "Wide", tooltip: "Always span both page columns" },
];
function setSize(next: EntityEmbedSize) {
  props.updateAttributes({ size: next });
}

// showArt only affects the monster entry composition today (scriptoriumImport.ts) —
// an NPC's portrait keeps its existing centered, never-detachable placement.
const showArtToggle = computed(() => entityType.value === "monster");
const showArt = computed(() => (props.node.attrs.showArt as boolean | undefined) ?? true);
function toggleShowArt() {
  props.updateAttributes({ showArt: !showArt.value });
}

const startsPage = computed(() => (props.node.attrs.startsPage as boolean | undefined) ?? true);
function toggleStartsPage() {
  props.updateAttributes({ startsPage: !startsPage.value });
}

const TYPE_LABELS: Record<EntityEmbedType, string> = {
  npc: "NPC",
  monster: "Monster",
  spell: "Spell",
  item: "Item",
  location: "Location",
  quest: "Quest",
};
const typeLabel = computed(() => TYPE_LABELS[entityType.value]);

// Theme defaults to onednd2024 here — the galley shows the ability-score
// table in the default layout regardless of the document's own theme toggle.
// The preview pane and PDF export (ScriptoriumEditor.vue's resolveEntityEmbeds
// call) DO carry the real theme through, so the printed/exported book is
// always correct; this is a galley-only cosmetic gap for phb2014 documents.
const refs = computed(() => [{ type: entityType.value, id: entityId.value }]);
const { lookup, isLoading } = useEntityEmbedData(refs);
const rawHtml = computed(() => lookup.value[entityRefKey({ type: entityType.value, id: entityId.value })]);
const sanitizedHtml = computed(() =>
  sanitizeHtml(rawHtml.value ?? missingEntityMarkerHtml(entityType.value)),
);

const ENTITY_ROUTES: Record<Exclude<EntityEmbedType, "location">, string> = {
  npc: "/npcs",
  monster: "/monsters",
  spell: "/spells",
  item: "/vault",
  quest: "/quests",
};

function openEntity() {
  if (entityType.value === "location") {
    void router.push(placeRoute(entityId.value));
    return;
  }
  void router.push(`${ENTITY_ROUTES[entityType.value]}/${entityId.value}`);
}

async function detach() {
  const ok = await confirm(
    `Detach this ${typeLabel.value.toLowerCase()}? The content stays, but it will stop updating when the source changes.`,
    { title: "Detach linked entity", confirmLabel: "Detach", danger: false },
  );
  if (!ok) return;
  const pos = props.getPos();
  if (typeof pos !== "number") return;
  props.editor
    .chain()
    .focus()
    .insertContentAt({ from: pos, to: pos + props.node.nodeSize }, sanitizedHtml.value, {
      parseOptions: { preserveWhitespace: false },
    })
    .run();
}
</script>

<style scoped>
@reference "@/assets/main.css";

.sc-entity-embed {
  position: relative;
}

.sc-entity-embed-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  background: color-mix(in oklab, var(--primary) 8%, transparent);
  border: 1px dashed color-mix(in oklab, var(--primary) 35%, transparent);
}

.sc-entity-embed-badge {
  @apply text-eyebrow font-bold uppercase tracking-wider text-primary;
}

.sc-entity-embed-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.sc-entity-embed-loading {
  @apply text-caption text-muted-foreground italic;
  padding: 0.5rem 0;
}
</style>
