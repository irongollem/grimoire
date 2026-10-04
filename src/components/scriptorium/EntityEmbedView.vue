<template>
  <!-- NodeViewWrapper does not automatically forward the node's schema
       attributes (data-entity-type etc. from entityEmbed.ts's renderHTML) to
       this live DOM element the way the static HTML serialization path does
       — only data-block-id is bound explicitly here, because the phone
       reader's contents list (readerToc.ts, #915 story 6 round 2) needs it
       to resolve a monster/NPC entry's own name heading (raw injected HTML
       with no block id of its own) back to a scrollable target. -->
  <NodeViewWrapper
    as="div"
    class="sc-entity-embed"
    :data-block-id="props.node.attrs.blockId"
    contenteditable="false"
  >
    <div v-if="isEditable && !isPlayer" class="sc-entity-embed-toolbar" contenteditable="false">
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
        <SegmentedControl
          v-if="showArtChoiceToggle"
          :model-value="art"
          :options="ART_OPTIONS"
          size="xs"
          variant="ghost"
          @update:model-value="setArt"
        />
        <AppButton
          v-if="showLoreToggle"
          size="xs"
          variant="ghost"
          fill="muted"
          label="Lore"
          :active="showLore"
          :tooltip="showLore ? 'Hide the lore text' : 'Show the lore text'"
          @click="toggleShowLore"
        />
        <SegmentedControl
          v-if="showBandPositionToggle"
          :model-value="bandPosition"
          :options="BAND_POSITION_OPTIONS"
          size="xs"
          variant="ghost"
          @update:model-value="setBandPosition"
        />
        <AppButton
          size="xs"
          variant="ghost"
          fill="muted"
          label="New page"
          :active="startsPage"
          tooltip="Start this entry on a fresh page; turn off for a variant that follows its family's first entry on the same page"
          @click="toggleStartsPage"
        />
        <EmbedRevealControl
          :entity-type="entityType"
          :show-art="showArt"
          :reveal="reveal"
          @update:reveal="setReveal"
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

    <!-- A player never sees a loading line, a "missing" marker or any other
         trace of an embed they cannot read: it renders nothing at all, and the
         wrapper above stays an empty zero-height block (#970). -->
    <template v-if="!isPlayer">
      <div v-if="isLoading && rawHtml === undefined" class="sc-entity-embed-loading">Loading&hellip;</div>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized via sanitizeHtml() in processedHtml -->
      <div v-else class="sc-entity-embed-body" v-html="processedHtml" />
    </template>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized via sanitizeHtml() in processedHtml -->
    <div v-else-if="rawHtml" class="sc-entity-embed-body" v-html="processedHtml" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { useRouter } from "vue-router";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/SegmentedControl.vue";
import { useConfirm } from "@/composables/useConfirm";
import EmbedRevealControl from "@/components/scriptorium/EmbedRevealControl.vue";
import { usePlayerEntityEmbed } from "@/composables/scriptorium/usePlayerEntityEmbed";
import { useEntityEmbedData } from "@/composables/scriptorium/useEntityEmbedData";
import {
  entityRefKey,
  missingEntityMarkerHtml,
  applyEmbedNodeOptions,
  type EmbedNodeOptions,
} from "@/lib/scriptorium/entityEmbeds";
import type { EntityArtChoice } from "@/lib/scriptorium/entityArt";
import type { EntityEmbedReveal } from "@/lib/scriptorium/embedReveal";
import { SCRIPTORIUM_AUDIENCE_KEY, type ScriptoriumAudience } from "@/lib/scriptorium/audience";
import { SCRIPTORIUM_THEME_KEY } from "@/lib/scriptorium/scriptoriumTheme";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { placeRoute } from "@/lib/locations/placeRoute";
import { IconExternalLink, IconScissors, IconImage } from "@/lib/icons";
import type { EntityEmbedType, EntityEmbedSize } from "@/lib/tiptap/entityEmbed";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";

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

// showArt affects the monster and NPC entry compositions (scriptoriumImport.ts,
// #917 story 4) — both now emit their art via entityArtFiguresHtml(), so both
// can be hidden per node the same way. Every other embedded entity (spell,
// item, location, quest) has no art figure to toggle at all.
const showArtToggle = computed(() => entityType.value === "monster" || entityType.value === "npc");
const showArt = computed(() => (props.node.attrs.showArt as boolean | undefined) ?? true);
function toggleShowArt() {
  props.updateAttributes({ showArt: !showArt.value });
}

// Which of the (up to two) resolved figures an entry shows (#917 story 2,
// extended to NPCs in story 4) — only meaningful while art is shown at all,
// and only for the entity types entityArt.ts's cutout/picture figures apply
// to (monster, npc).
const showArtChoiceToggle = computed(() => showArtToggle.value && showArt.value);
const art = computed(() => (props.node.attrs.art as EntityArtChoice | undefined) ?? "auto");
const ART_OPTIONS: SegmentedOption<EntityArtChoice>[] = [
  { value: "auto", label: "Auto", tooltip: "The cutout when there is one, otherwise the picture" },
  { value: "cutout", label: "Cutout", tooltip: "The creature on a transparent background" },
  { value: "picture", label: "Picture", tooltip: "The full picture with its background" },
];
function setArt(next: EntityArtChoice) {
  props.updateAttributes({ art: next });
}

// showLore/bandPosition are monster-only too (#915 story 6 round 2) — the
// two-cell grid / band composition they affect only exists for a monster
// entry's own layout.
const showLoreToggle = computed(() => entityType.value === "monster");
const showLore = computed(() => (props.node.attrs.showLore as boolean | undefined) ?? true);
function toggleShowLore() {
  props.updateAttributes({ showLore: !showLore.value });
}

const showBandPositionToggle = computed(() => entityType.value === "monster");
const bandPosition = computed(
  () => (props.node.attrs.bandPosition as "top" | "bottom" | undefined) ?? "top",
);
const BAND_POSITION_OPTIONS: SegmentedOption<"top" | "bottom">[] = [
  { value: "top", label: "Top", tooltip: "Band first, art/lore below (default)" },
  { value: "bottom", label: "Bottom", tooltip: "Art/lore first, band below, a wide entry only" },
];
function setBandPosition(next: "top" | "bottom") {
  props.updateAttributes({ bandPosition: next });
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

// Theme is injected from whichever ancestor provides it — ScriptoriumEditor.vue's
// own `theme` ref for the live galley, ScriptoriumDocumentView.vue's computed
// (derived from the document's stored `theme` column) for the read-only
// renderer that the phone reader and quest handouts mount — so the
// ability-score table formats itself in the document's real theme rather
// than a hardcoded default (#917 story 2; see scriptoriumTheme.ts's own doc
// for why this was never merely a galley cosmetic gap). Falls back to
// "onednd2024" only when neither ancestor provided one.
const theme = inject(SCRIPTORIUM_THEME_KEY, ref<ScriptoriumTheme>("onednd2024"));

// Who is reading decides where the body comes from, and it is read once at
// setup because a mounted view's audience never changes. A player's embed must
// not so much as construct useEntityEmbedData: its queries read the DM's tables
// unscoped and its output carries the true name, portrait and lore. They get
// only the player-gated projections, resolved for this one embed (#970).
const audience = inject(
  SCRIPTORIUM_AUDIENCE_KEY,
  ref<ScriptoriumAudience>({ audience: "dm" }),
).value;
const isPlayer = audience.audience === "player";

function useDmBody() {
  const refs = computed(() => [{ type: entityType.value, id: entityId.value }]);
  const { lookup, isLoading } = useEntityEmbedData(refs, { theme });
  return {
    rawHtml: computed<string | null | undefined>(
      () => lookup.value[entityRefKey({ type: entityType.value, id: entityId.value })],
    ),
    isLoading,
  };
}

function usePlayerBody(campaignId: string) {
  const { html, isLoading } = usePlayerEntityEmbed(
    entityType.value,
    entityId.value,
    campaignId,
    () => theme.value,
  );
  return { rawHtml: computed<string | null | undefined>(() => html.value), isLoading };
}

const { rawHtml, isLoading } =
  audience.audience === "player" ? usePlayerBody(audience.campaignId) : useDmBody();

// The per-node options (size/art/lore/band) applied on top of the shared,
// resolved entity body — same shape resolveEntityEmbeds() applies to the
// paged preview/PDF string, read here straight off the node's live Tiptap
// attrs instead of `data-*` (#917 story 2: this view used to v-html the raw
// body untouched, so a node that had hidden its art or lore still showed it
// wherever this view is mounted read-only).
const nodeOptions = computed<EmbedNodeOptions>(() => ({
  size: size.value,
  showArt: showArt.value,
  showLore: showLore.value,
  bandPosition: bandPosition.value,
  art: art.value,
}));

/** Sanitizes `raw`, applies this node's options in a detached element, and
 *  returns the resulting HTML — what's actually shown, and (via `detach()`)
 *  what's inserted as plain content when the entity is detached. */
function buildProcessedHtml(raw: string, opts: EmbedNodeOptions): string {
  const container = document.createElement("div");
  container.innerHTML = sanitizeHtml(raw);
  applyEmbedNodeOptions(container, opts);
  return container.innerHTML;
}

const processedHtml = computed(() =>
  buildProcessedHtml(rawHtml.value ?? missingEntityMarkerHtml(entityType.value), nodeOptions.value),
);

const reveal = computed(() => (props.node.attrs.reveal as EntityEmbedReveal | null | undefined) ?? null);
function setReveal(next: EntityEmbedReveal | null) {
  props.updateAttributes({ reveal: next });
}

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
    .insertContentAt({ from: pos, to: pos + props.node.nodeSize }, processedHtml.value, {
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
  @apply text-eyebrow font-bold text-primary;
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
