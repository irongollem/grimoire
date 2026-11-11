<template>
  <!-- NodeViewWrapper does not automatically forward the node's schema
       attributes (data-entity-type etc. from entityEmbed.ts's renderHTML) to
       this live DOM element the way the static HTML serialization path does
       — only data-block-id is bound explicitly here, because the phone
       click-to-edit and Inspect's notes (#1115, `closest("[data-block-id]")`) need it
       to resolve a monster/NPC entry's own name heading (raw injected HTML
       with no block id of its own) back to a scrollable target. -->
  <NodeViewWrapper
    ref="embedRoot"
    as="div"
    class="sc-entity-embed"
    :data-block-id="props.node.attrs.blockId"
    contenteditable="false"
  >
    <!-- On the page the entry keeps only Open and Detach; everything else is chosen in the panel beside the page. -->
    <div v-if="isEditable && !isPlayer" class="sc-entity-embed-toolbar" contenteditable="false">
      <span class="sc-entity-embed-badge">{{ typeLabel }} · linked</span>
      <div class="sc-entity-embed-actions">
        <AppButton size="xs" variant="ghost" fill="muted" :icon="IconExternalLink" icon-size="xs" label="Open" @click="openEntity" />
        <AppButton
          size="xs"
          variant="ghost"
          fill="muted"
          :icon="IconScissors"
          icon-size="xs"
          label="Detach…"
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
      <div v-else class="sc-entity-embed-body" v-html="shownHtml" />
    </template>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized via sanitizeHtml() in processedHtml -->
    <div v-else-if="rawHtml" class="sc-entity-embed-body" v-html="shownHtml" />
    <!-- Open shows a monster's or spell's sheet over the book (each modal teleports to the body). -->
    <component :is="peekModal" v-if="peeking && peekModal" :id="entityId" @close="peeking = false" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useConfirm } from "@/composables/useConfirm";
import { PRINTED_BOOK_KEY } from "@/scriptorium/composables/usePrintedBook";
import { applyEntryFit } from "@/scriptorium/lib/entryFit";
import { remeasurePages } from "@/scriptorium/lib/remeasurePages";
import { usePlayerEntityEmbed } from "@/scriptorium/composables/usePlayerEntityEmbed";
import { useEntityEmbedData } from "@/scriptorium/composables/useEntityEmbedData";
import {
  entityRefKey,
  missingEntityMarkerHtml,
  applyEmbedNodeOptions,
  type EmbedNodeOptions,
} from "@/scriptorium/lib/entityEmbeds";
import type { EntityArtChoice } from "@/scriptorium/lib/entityArt";
import { SCRIPTORIUM_AUDIENCE_KEY, type ScriptoriumAudience } from "@/scriptorium/lib/audience";
import { SCRIPTORIUM_THEME_KEY } from "@/scriptorium/lib/scriptoriumTheme";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { placeRoute } from "@/lib/locations/placeRoute";
import { useOpenNpc } from "@/composables/npcs/useNpcPeek";
import { detachedEntryBreakAt } from "@/scriptorium/tiptap/detachedEntry";
import { IconExternalLink, IconScissors } from "@/lib/icons";
import { EMBED_DETACH_EVENT, EMBED_OPEN_EVENT } from "@/scriptorium/lib/panel/embedSignals";
import type { EntityEmbedType, EntityEmbedSize } from "@/lib/tiptap/nodeViewTypes";
import type { ScriptoriumTheme } from "@/scriptorium/types";

const props = defineProps({ ...nodeViewProps });
const { confirm } = useConfirm();
const router = useRouter();

const isEditable = computed(() => props.editor.isEditable);
const entityType = computed(() => props.node.attrs.entityType as EntityEmbedType);
const entityId = computed(() => props.node.attrs.entityId as string);

// What the entry shows is chosen in the panel beside the page (size, art, lore,
// band); this view only draws it, from the node's live attrs. Each default is
// what a node that never set the option means.
const size = computed(() => (props.node.attrs.size as EntityEmbedSize | undefined) ?? "auto");
const showArt = computed(() => (props.node.attrs.showArt as boolean | undefined) ?? true);
const art = computed(() => (props.node.attrs.art as EntityArtChoice | undefined) ?? "auto");
const showLore = computed(() => (props.node.attrs.showLore as boolean | undefined) ?? true);
const bandPosition = computed(
  () => (props.node.attrs.bandPosition as "top" | "bottom" | undefined) ?? "top",
);

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
const typeLabel = computed(() => TYPE_LABELS[entityType.value]);

// Theme is injected from whichever ancestor provides it — ScriptoriumEditor.vue's
// own `theme` ref for the live galley, ScriptoriumDocumentView.vue's computed
// (derived from the document's stored `theme` column) for the read-only
// renderer that the phone reader and quest handouts mount — so the
// ability-score table formats itself in the document's real theme rather
// than a hardcoded default (#917 story 2; see scriptoriumTheme.ts's own doc
// for why this was never merely a galley cosmetic gap). Falls back to
// "grimoire" (the house look) only when neither ancestor provided one.
const theme = inject(SCRIPTORIUM_THEME_KEY, ref<ScriptoriumTheme>("grimoire"));

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

// What the entry shows is the processed body with the fit the printer gave it, so it takes the room it takes
// on its page. Detach keeps the processed body alone: a fit is a property of one page, not of the content.
const printed = inject(PRINTED_BOOK_KEY, null);
const shownHtml = computed(() => {
  const id: unknown = props.node.attrs.blockId;
  const fit = typeof id === "string" ? printed?.entryFits.value.get(id) : undefined;
  if (!fit) return processedHtml.value;
  const container = document.createElement("div");
  container.innerHTML = processedHtml.value;
  applyEntryFit(container, fit);
  return container.innerHTML;
});

// The printer's fit arrives after the entry is drawn, and changes how full its page is.
watch(shownHtml, () => remeasurePages(props.editor), { flush: "post" });

/*
 * Open shows the entry's sheet over the book where there is one, so the book stays where it was: the
 * monster and spell routes are children of their lists, so navigating there put the bestiary behind the
 * sheet. An NPC opens in the app's NPC peek (useOpenNpc). Everything else goes to its own page.
 */
type PeekedType = "npc" | "monster" | "spell";
const PEEK_MODALS: Record<Exclude<PeekedType, "npc">, Component> = {
  monster: defineAsyncComponent(() => import("@/components/monsters/MonsterDetailModal.vue")),
  spell: defineAsyncComponent(() => import("@/components/spells/SpellDetailModal.vue")),
};
const ENTITY_ROUTES: Record<Exclude<EntityEmbedType, "location" | PeekedType>, string> = {
  item: "/vault",
  quest: "/quests",
  deity: "/deities",
  species: "/species",
  faction: "/factions",
  subclass: "/levelup/custom",
};
const peekModal = computed(() => {
  const type = entityType.value;
  return type === "monster" || type === "spell" ? PEEK_MODALS[type] : null;
});
const peeking = ref(false);
const openNpc = useOpenNpc();

function openEntity() {
  const type = entityType.value;
  if (type === "npc") openNpc(entityId.value);
  else if (type === "monster" || type === "spell") peeking.value = true;
  else if (type === "location") void router.push(placeRoute(entityId.value));
  else void router.push(`${ENTITY_ROUTES[type]}/${entityId.value}`);
}

// The panel beside the page asks this entry to open or detach by event (see embedSignals.ts).
const embedRoot = useTemplateRef<{ $el: HTMLElement }>("embedRoot");
let listening: HTMLElement | null = null;
function onOpenSignal() {
  openEntity();
}
function onDetachSignal() {
  void detach();
}
onMounted(() => {
  listening = embedRoot.value?.$el ?? null;
  listening?.addEventListener(EMBED_OPEN_EVENT, onOpenSignal);
  listening?.addEventListener(EMBED_DETACH_EVENT, onDetachSignal);
});
onBeforeUnmount(() => {
  listening?.removeEventListener(EMBED_OPEN_EVENT, onOpenSignal);
  listening?.removeEventListener(EMBED_DETACH_EVENT, onDetachSignal);
});

async function detach() {
  const ok = await confirm(
    `Detach this ${typeLabel.value.toLowerCase()}? The content stays, but it will stop updating when the source changes.`,
    { title: "Detach linked entity", confirmLabel: "Detach", danger: false },
  );
  if (!ok) return;
  const pos = props.getPos();
  if (typeof pos !== "number") return;
  // The size comes from the document, never from props.node: the node view holds a reactive copy of the
  // node, whose nodeSize reads 2 for this leaf (its type check compares a proxy with ProseMirror's own
  // object), and replacing two positions deleted the next entry along with this one.
  const here = props.editor.state.doc.nodeAt(pos);
  if (!here || here.type.name !== "entityEmbed") return;
  // An entry that started its own page keeps doing so (detachedEntryBreakAt).
  const startsPage = (props.node.attrs.startsPage as boolean | undefined) ?? true;
  props.editor
    .chain()
    .focus()
    .insertContentAt({ from: pos, to: pos + here.nodeSize }, processedHtml.value, {
      parseOptions: { preserveWhitespace: false },
    })
    .command(({ tr, state }) => {
      const at = startsPage ? detachedEntryBreakAt(tr.doc, pos) : null;
      if (at !== null) tr.insert(at, state.schema.nodes.pageBreak.create());
      return true;
    })
    .run();
}
</script>

<style scoped>
@reference "@/assets/main.css";

.sc-entity-embed {
  position: relative;
}

/* Open and Detach hang over the entry's top edge when it is hovered or selected. They take no
   room: the printed entry has no toolbar, so a toolbar in the flow made the entry taller than
   its page (#1176). */
.sc-entity-embed-toolbar {
  position: absolute;
  right: 0;
  bottom: 100%;
  z-index: 3;
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--card);
  border: 1px solid var(--border);
}
.sc-entity-embed:hover > .sc-entity-embed-toolbar,
.sc-entity-embed:focus-within > .sc-entity-embed-toolbar,
.sc-entity-embed.ProseMirror-selectednode > .sc-entity-embed-toolbar {
  display: flex;
}

/* The printed entry has its content directly inside it; this wrapper only holds it. */
.sc-entity-embed-body {
  display: contents;
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
