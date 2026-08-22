<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
    <!-- Top bar -->
    <NpcWebTopBar
      v-model:search-query="ui.npcWebSearch"
      v-model:show-pcs="ui.npcWebShowPcs"
      v-model:location-filter="ui.npcWebFilterLocation"
      v-model:type-filter="ui.npcWebFilterType"
      :location-options="locationOptions"
      :type-options="typeOptions"
      :legend-items="legendItems"
      :has-active-filters="ui.npcWebHasActiveFilters"
      @clear="ui.resetNpcWebFilters()"
    />

    <!-- Graph area (fills remaining space; panel overlays it so the graph never resizes) -->
    <div class="flex-1 relative bg-muted/10 overflow-hidden">
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center">
        <LoadingSpinner />
      </div>
      <div v-else-if="nodeCount === 0" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <IconNetwork class="h-10 w-10 opacity-30" />
        <p class="font-cinzel text-sm">No connections recorded yet.</p>
        <p class="text-caption">Add NPC relationships from any NPC sheet to populate the web.</p>
      </div>
      <VNetworkGraph
        v-else
        v-model:layouts="layouts"
        :nodes="graphNodes"
        :edges="graphEdges"
        :configs="graphConfigs"
        :event-handlers="eventHandlers"
        :layers="GRAPH_LAYERS"
        class="w-full h-full select-none touch-none"
      >
        <!--
          Faction membership, drawn on the node rather than as nodes of its own.
          `node-labels` puts this above the nodes in the layer stack; positions
          come from `layouts`, which the force layout writes as it settles.
        -->
        <template #factionPips="{ scale }">
          <defs>
            <clipPath id="npcweb-pip-clip">
              <circle cx="0" cy="0" :r="PIP_RADIUS * scale" />
            </clipPath>
          </defs>
          <g v-for="badge in nodeBadges" :key="badge.nodeKey">
            <g
              v-for="pip in badge.pips"
              :key="pip.factionId"
              :transform="`translate(${badge.cx + pip.dx * scale}, ${badge.cy + pip.dy * scale})`"
              :opacity="pip.active ? 1 : 0.45"
            >
              <title>{{ pip.factionName }}{{ pip.active ? '' : ' (former)' }}</title>
              <circle :r="PIP_RADIUS * scale" class="fill-card stroke-border" :stroke-width="scale" />
              <image
                v-if="pip.emblemUrl"
                :href="pip.emblemUrl"
                :x="-PIP_RADIUS * scale"
                :y="-PIP_RADIUS * scale"
                :width="PIP_RADIUS * 2 * scale"
                :height="PIP_RADIUS * 2 * scale"
                preserveAspectRatio="xMidYMid slice"
                clip-path="url(#npcweb-pip-clip)"
              />
              <text
                v-else
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="PIP_RADIUS * scale"
                class="fill-muted-foreground font-semibold"
              >{{ pip.initial }}</text>
            </g>
            <text
              v-if="badge.overflow"
              :x="badge.cx + badge.overflowDx * scale"
              :y="badge.cy + badge.overflowDy * scale"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="PIP_RADIUS * scale"
              class="fill-muted-foreground font-semibold"
            >+{{ badge.overflow }}</text>
          </g>
        </template>
      </VNetworkGraph>

      <!-- Link mode hint -->
      <transition name="fade">
        <div
          v-if="linkFromKey && !linkToKey"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground text-label-lg font-semibold shadow-lg pointer-events-none"
        >
          Shift+click another node to link
        </div>
      </transition>

      <!-- Side panel — absolute overlay so the graph SVG never resizes -->
      <transition name="panel-slide">
        <div
          v-if="panelVisible"
          class="absolute right-0 top-0 h-full w-64 border-l border-border bg-card flex flex-col overflow-y-auto shadow-xl"
        >
          <!-- ── Link form ────────────────────────────────── -->
          <NpcWebLinkForm
            v-if="linkFormVisible"
            v-model:link-type="linkType"
            v-model:link-notes="linkNotes"
            :label-a="linkLabelA"
            :label-b="linkLabelB"
            :is-saving="isSavingLink"
            :can-delete="!!editingLinkRelId || !!editingLinkPcNoteId"
            :type-options="typeOptions"
            @cancel="cancelLink"
            @save="saveLink"
            @delete="deleteLinkRel"
          />

          <!-- ── NPC panel ───────────────────────────────── -->
          <NpcWebNpcPanel
            v-else-if="panelNpc"
            :npc="panelNpc"
            :connections="panelNpcConnections"
            :editing-rel-id="editingRelId"
            :edit-rel-type="editRelType"
            :edit-rel-notes="editRelNotes"
            :type-options="typeOptions"
            @close="clearSelection"
            @start-edit-rel="startEditRel"
            @save-edit-rel="saveEditRel"
            @cancel-edit-rel="cancelEditRel"
            @delete-rel="confirmDeleteRel"
            @update:edit-rel-type="editRelType = $event as NpcRelationshipType"
            @update:edit-rel-notes="editRelNotes = $event"
          />

          <!-- ── PC panel ────────────────────────────────── -->
          <NpcWebPcPanel
            v-else-if="panelPc"
            :pc="panelPc"
            :species-name="speciesNameMap.get(panelPc.species_id ?? '') ?? null"
            @close="clearSelection"
          />
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { IconNetwork } from '@/lib/icons';
import { npcRelationshipVar } from "@/lib/npcDisplay";
import { VNetworkGraph, type EventHandlers, type Layers, type Layouts } from "v-network-graph";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import NpcWebTopBar from "@/components/npcs/NpcWebTopBar.vue";
import NpcWebLinkForm from "@/components/npcs/NpcWebLinkForm.vue";
import NpcWebNpcPanel from "@/components/npcs/NpcWebNpcPanel.vue";
import NpcWebPcPanel from "@/components/npcs/NpcWebPcPanel.vue";
import { useNpcs } from "@/composables/useNpcs";
import { useParty } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useLocationTree } from "@/composables/useLocations";
import { useAllNpcRelations, useCreateNpcRelation, useUpdateNpcRelation, useDeleteNpcRelation } from "@/composables/useNpcRelations";
import { useAllNpcPcNotes, useUpsertNpcPcNoteDirect, useDeleteNpcPcNote } from "@/composables/useNpcPcNotes";
import { useNpcWebGraph, resolveVar } from "@/composables/useNpcWebGraph";
import { useAllFactionNpcs, useAllFactionPartyMembers } from "@/composables/useFactions";
import { factionBadgesByNode, pipOffsets } from "@/lib/npcWeb/factions";
import { useUiStore } from "@/stores/ui";
import {
  NPC_RELATIONSHIP_LABELS,
  NPC_RELATIONSHIP_TYPE_LABELS,
  NPC_RELATIONSHIP_TYPE_VAR,
  NPC_RELATIONSHIP_INVERSE,
} from "@/types/npc.types";
import type { NpcRelationship, NpcRelationshipType } from "@/types/npc.types";

// ── Filters ───────────────────────────────────────────────────────────────────
// In useUiStore (Filter State Pattern), so opening an NPC from the web and
// coming back does not drop the query and the location/type narrowing.

const ui = useUiStore();

const typeOptions = Object.entries(NPC_RELATIONSHIP_TYPE_LABELS) as [NpcRelationshipType, string][];
const { locationOptions, getDescendantIds } = useLocationTree();

// ── Data ──────────────────────────────────────────────────────────────────────

const { data: allNpcs, isLoading: npcsLoading } = useNpcs();
const { data: partyMembers, isLoading: partyLoading } = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: npcRelations, isLoading: relLoading } = useAllNpcRelations();
const { data: pcNotes, isLoading: pcNotesLoading } = useAllNpcPcNotes();
// Membership badges are additive — the graph draws without them, so they are
// deliberately NOT part of `isLoading`. Blocking the whole web on a faction
// query would make the common case (no factions yet) slower for nothing.
const { data: factionNpcs } = useAllFactionNpcs();
const { data: factionPartyMembers } = useAllFactionPartyMembers();
const { mutateAsync: createRelation, isPending: isSavingNpcLink } = useCreateNpcRelation();
const { mutateAsync: updateRelation } = useUpdateNpcRelation();
const { mutateAsync: deleteRelation } = useDeleteNpcRelation();
const { mutateAsync: upsertPcNote, isPending: isSavingPcLink } = useUpsertNpcPcNoteDirect();
const { mutateAsync: deletePcNote } = useDeleteNpcPcNote();
const isSavingLink = computed(() => isSavingNpcLink.value || isSavingPcLink.value);

const isLoading = computed(
  () => npcsLoading.value || partyLoading.value || relLoading.value || pcNotesLoading.value,
);

// ── Graph data ────────────────────────────────────────────────────────────────
// Nodes, edges, colours and layout live in `useNpcWebGraph`; what stays here is
// interaction — selection, link building, panels. `pinnedKeys` is the one thing
// that crosses: a node being linked must survive the search filter.

const { graphNodes, graphEdges, graphConfigs, nodeCount } = useNpcWebGraph({
  npcs: () => allNpcs.value,
  partyMembers: () => partyMembers.value,
  relations: () => npcRelations.value,
  pcNotes: () => pcNotes.value,
  pinnedKeys: () => pinnedKeys.value,
  getDescendantIds,
});

// ── Faction membership badges ─────────────────────────────────────────────────

/** Node positions, written by the force layout and read by the badge layer. */
const layouts = ref<Layouts>({ nodes: {} });

/**
 * `node-labels` sits above `nodes` in v-network-graph's stack, so the emblems
 * draw over the circles rather than under them. The layer is inside the graph's
 * own pan/zoom transform, so positions are plain graph coordinates and the
 * badges zoom with everything else.
 */
const GRAPH_LAYERS: Layers = { factionPips: "node-labels" };

/**
 * Screen pixels, not graph units.
 *
 * `view.scalingObjects` is false — nodes hold a constant screen size however far
 * you zoom — and the layer slot hands out `scale` (`1 / zoomLevel`) so custom
 * drawing can do the same. Every size and offset below is therefore multiplied
 * by `scale` at the point of use. Skip that and the emblems balloon with the
 * zoom: at the fit-content zoom of a two-node graph they render five times the
 * width of the node they belong to.
 */
const PIP_RADIUS = 6;

const badgesByNode = computed(() => {
  const merged = new Map<string, ReturnType<typeof factionBadgesByNode>>();
  merged.set("npc", factionBadgesByNode(factionNpcs.value ?? [], (r) => `npc:${r.npc_id}`));
  merged.set("pc", factionBadgesByNode(factionPartyMembers.value ?? [], (r) => `pc:${r.party_member_id}`));
  return merged;
});

/**
 * Badges positioned against the nodes that are actually on screen.
 *
 * Keyed off `graphNodes` rather than the membership rows, so a filtered-out NPC
 * does not leave its emblems floating at a stale position — and off `layouts`,
 * so they follow the force simulation while it settles.
 */
const nodeBadges = computed(() => {
  const out: {
    nodeKey: string;
    cx: number;
    cy: number;
    overflow: number;
    overflowDx: number;
    overflowDy: number;
    pips: { factionId: string; factionName: string; emblemUrl: string | null; initial: string; active: boolean; dx: number; dy: number }[];
  }[] = [];

  for (const [nodeKey, node] of Object.entries(graphNodes.value)) {
    const badges = badgesByNode.value.get(nodeKey.startsWith("pc:") ? "pc" : "npc")?.get(nodeKey);
    if (!badges?.pips.length) continue;
    const pos = layouts.value.nodes[nodeKey];
    if (!pos) continue;

    const offsets = pipOffsets(badges.pips.length + (badges.overflow ? 1 : 0), node.nodeSize, PIP_RADIUS);
    out.push({
      nodeKey,
      cx: pos.x,
      cy: pos.y,
      overflow: badges.overflow,
      overflowDx: offsets[badges.pips.length]?.x ?? 0,
      overflowDy: offsets[badges.pips.length]?.y ?? 0,
      pips: badges.pips.map((pip, i) => ({ ...pip, dx: offsets[i].x, dy: offsets[i].y })),
    });
  }
  return out;
});

// ── Shift-key tracking (more reliable than relying on event.shiftKey in v-network-graph) ──

const isShiftHeld = ref(false);

onMounted(() => {
  const down = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftHeld.value = true; };
  const up   = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftHeld.value = false; };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  onUnmounted(() => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  });
});

// ── Selection & link state ────────────────────────────────────────────────────

// First node selected (graph key, e.g. "npc:abc")
const linkFromKey = ref<string | null>(null);
// Second node (only set when shift-clicking an NPC while linkFromKey is an NPC)
const linkToKey = ref<string | null>(null);

// Single-node panel (regular click, no link mode)
const singlePanelKey = ref<string | null>(null);

// Keys that are pinned (selected) and must always show regardless of search
const pinnedKeys = computed(() => {
  const keys: string[] = [];
  if (linkFromKey.value) keys.push(linkFromKey.value);
  if (linkToKey.value) keys.push(linkToKey.value);
  return new Set(keys);
});

const npcById = computed(() =>
  Object.fromEntries((allNpcs.value ?? []).map((n) => [n.id, n])),
);

function npcIdFromKey(key: string): string { return key.slice(4); }
function pcIdFromKey(key: string): string { return key.slice(3); }

const pcById = computed(() =>
  Object.fromEntries((partyMembers.value ?? []).map((m) => [m.id, m])),
);

// Resolve the two nodes in any link (npc side always npcId, pc side always pcId)
const linkFromNpc = computed(() =>
  linkFromKey.value?.startsWith("npc:") ? (npcById.value[npcIdFromKey(linkFromKey.value)] ?? null) : null,
);
const linkToNpc = computed(() =>
  linkToKey.value?.startsWith("npc:") ? (npcById.value[npcIdFromKey(linkToKey.value)] ?? null) : null,
);
const linkFromPc = computed(() =>
  linkFromKey.value?.startsWith("pc:") ? (pcById.value[pcIdFromKey(linkFromKey.value)] ?? null) : null,
);
const linkToPc = computed(() =>
  linkToKey.value?.startsWith("pc:") ? (pcById.value[pcIdFromKey(linkToKey.value)] ?? null) : null,
);

// Normalised for the link form: always (npc, pc) regardless of click order
const linkNpcNode = computed(() => linkFromNpc.value ?? linkToNpc.value ?? null);
const linkPcNode  = computed(() => linkFromPc.value  ?? linkToPc.value  ?? null);

// Which kind of link are we building?
const isNpcNpcLink = computed(() => !!linkFromNpc.value && !!linkToNpc.value);
const isNpcPcLink  = computed(() => !!linkNpcNode.value && !!linkPcNode.value);
const linkFormVisible = computed(() => isNpcNpcLink.value || isNpcPcLink.value);

// Link-form labels for "from" / "to" display
const linkLabelA = computed(() =>
  isNpcNpcLink.value ? linkFromNpc.value!.name : (linkNpcNode.value?.name ?? ""),
);
const linkLabelB = computed(() =>
  isNpcNpcLink.value ? linkToNpc.value!.name : (linkPcNode.value?.name ?? ""),
);

const panelNpc = computed(() => {
  if (linkFormVisible.value) return null;
  const key = singlePanelKey.value;
  if (!key?.startsWith("npc:")) return null;
  return npcById.value[npcIdFromKey(key)] ?? null;
});

const panelPc = computed(() => {
  if (linkFormVisible.value) return null;
  const key = singlePanelKey.value;
  if (!key?.startsWith("pc:")) return null;
  return (partyMembers.value ?? []).find((m) => m.id === pcIdFromKey(key)) ?? null;
});

const panelVisible = computed(() => linkFormVisible.value || !!panelNpc.value || !!panelPc.value);

const panelNpcConnections = computed(() => {
  if (!panelNpc.value) return [];
  const npcId = panelNpc.value.id;
  return (npcRelations.value ?? [])
    .filter((r) => r.npc_id === npcId || r.related_npc_id === npcId)
    .map((r) => {
      const otherId = r.npc_id === npcId ? r.related_npc_id : r.npc_id;
      const rawType = r.relationship_type as NpcRelationshipType;
      const isSource = r.npc_id === npcId;
      const effectiveType = isSource ? rawType : (NPC_RELATIONSHIP_INVERSE[rawType] ?? rawType);
      return {
        id: r.id,
        // storedType: the un-flipped type as saved in DB — needed for saves/edits
        storedType: rawType,
        isSource,
        otherId,
        name: npcById.value[otherId]?.name ?? "Unknown",
        typeLabel: NPC_RELATIONSHIP_TYPE_LABELS[effectiveType] ?? rawType,
        effectiveType,
        color: resolveVar(NPC_RELATIONSHIP_TYPE_VAR[effectiveType], "#6b7280"),
        notes: r.notes ?? "",
      };
    });
});

// ── Inline connection editing ─────────────────────────────────────────────────

const editingRelId = ref<string | null>(null);
const editRelType  = ref<NpcRelationshipType>("ally");
const editRelNotes = ref("");

function startEditRel(conn: { id: string; effectiveType: NpcRelationshipType; notes: string }) {
  editingRelId.value = conn.id;
  editRelType.value  = conn.effectiveType;
  editRelNotes.value = conn.notes;
}

function cancelEditRel() {
  editingRelId.value = null;
}

async function saveEditRel(conn: { id: string; isSource: boolean }) {
  // If this NPC is the source, store type as-is. If it's the target, store the inverse.
  const storedType = conn.isSource
    ? editRelType.value
    : (NPC_RELATIONSHIP_INVERSE[editRelType.value] ?? editRelType.value);
  await updateRelation({ id: conn.id, update: { relationship_type: storedType, notes: editRelNotes.value.trim() || null } });
  editingRelId.value = null;
}

async function confirmDeleteRel(id: string) {
  await deleteRelation(id);
  editingRelId.value = null;
}

function clearSelection() {
  singlePanelKey.value = null;
  linkFromKey.value = null;
  linkToKey.value = null;
}

// ── Link form state ───────────────────────────────────────────────────────────

const linkType = ref<NpcRelationshipType>("ally");
const linkNotes = ref("");
const editingLinkRelId = ref<string | null>(null);
const editingLinkPcNoteId = ref<string | null>(null);
// When true the NPC is the source (npc_id) in the stored relation row — needed
// to correctly flip the relationship type on save.
const editingLinkNpcIsSource = ref(true);

function cancelLink() {
  singlePanelKey.value = linkFromKey.value;
  linkToKey.value = null;
  editingLinkRelId.value = null;
  editingLinkPcNoteId.value = null;
}

async function saveLink() {
  if (isNpcNpcLink.value && linkFromNpc.value && linkToNpc.value) {
    if (editingLinkRelId.value) {
      // Updating existing — storedType perspective is from the original source
      const storedType = editingLinkNpcIsSource.value
        ? linkType.value
        : (NPC_RELATIONSHIP_INVERSE[linkType.value] ?? linkType.value);
      await updateRelation({ id: editingLinkRelId.value, update: { relationship_type: storedType, notes: linkNotes.value.trim() || null } });
    } else {
      await createRelation({
        npc_id: linkFromNpc.value.id,
        related_npc_id: linkToNpc.value.id,
        relationship_type: linkType.value,
        notes: linkNotes.value.trim() || null,
      });
    }
  } else if (isNpcPcLink.value && linkNpcNode.value && linkPcNode.value) {
    await upsertPcNote({
      npcId: linkNpcNode.value.id,
      partyMemberId: linkPcNode.value.id,
      relationshipType: linkType.value,
      notes: linkNotes.value.trim(),
    });
  }
  clearSelection();
  linkType.value = "ally";
  linkNotes.value = "";
  editingLinkRelId.value = null;
  editingLinkPcNoteId.value = null;
}

async function deleteLinkRel() {
  if (editingLinkPcNoteId.value) {
    await deletePcNote(editingLinkPcNoteId.value);
  } else if (editingLinkRelId.value) {
    await deleteRelation(editingLinkRelId.value);
  }
  clearSelection();
  editingLinkRelId.value = null;
  editingLinkPcNoteId.value = null;
}

// ── Event handlers ────────────────────────────────────────────────────────────

const eventHandlers: EventHandlers = {
  "edge:click": ({ edge: edgeKey }) => {
    if (!edgeKey) return;
    // edge key format: "npc:A--npc:B" or "npc:A--pc:B"
    const parts = edgeKey.split("--");
    const keyA = parts[0];
    const keyB = parts[1];
    if (!keyA || !keyB) return;

    clearSelection();
    linkFromKey.value = keyA;
    linkToKey.value = keyB;
    singlePanelKey.value = null;
    editingLinkRelId.value = null;

    // Try to find an existing NPC↔NPC relation for this edge
    if (keyA.startsWith("npc:") && keyB.startsWith("npc:")) {
      const idA = keyA.slice(4);
      const idB = keyB.slice(4);
      const rel = (npcRelations.value ?? []).find(
        (r) => (r.npc_id === idA && r.related_npc_id === idB) ||
               (r.npc_id === idB && r.related_npc_id === idA),
      );
      if (rel) {
        editingLinkRelId.value = rel.id;
        // Determine perspective: keyA is the "from" in the form; if rel.npc_id === idA it's already source
        const npcIsSource = rel.npc_id === idA;
        editingLinkNpcIsSource.value = npcIsSource;
        const rawType = rel.relationship_type as NpcRelationshipType;
        linkType.value = npcIsSource ? rawType : (NPC_RELATIONSHIP_INVERSE[rawType] ?? rawType);
        linkNotes.value = rel.notes ?? "";
        return;
      }
    }

    // NPC↔PC — look up existing note
    if (keyA.startsWith("npc:") || keyB.startsWith("npc:")) {
      const npcId = keyA.startsWith("npc:") ? keyA.slice(4) : keyB.slice(4);
      const pcId  = keyA.startsWith("pc:")  ? keyA.slice(3) : keyB.slice(3);
      const note = (pcNotes.value ?? []).find(
        (n) => n.npc_id === npcId && n.party_member_id === pcId,
      );
      if (note) {
        editingLinkPcNoteId.value = note.id;
        linkType.value = note.relationship_type;
        linkNotes.value = note.notes ?? "";
        return;
      }
    }
    linkType.value = "ally";
    linkNotes.value = "";
  },
  "node:click": ({ node }) => {
    if (isShiftHeld.value && linkFromKey.value && linkFromKey.value !== node) {
      const fromIsNpc = linkFromKey.value.startsWith("npc:");
      const toIsNpc   = node.startsWith("npc:");
      const isNpcNpc  = fromIsNpc && toIsNpc;
      const isNpcPc   = (fromIsNpc && !toIsNpc) || (!fromIsNpc && toIsNpc);
      if (isNpcNpc || isNpcPc) {
        linkToKey.value = node;
        singlePanelKey.value = null;
        linkType.value = "ally";
        linkNotes.value = "";
        return;
      }
    }

    // Regular click — select single node (second click on same node deselects)
    if (singlePanelKey.value === node && !linkToKey.value) {
      clearSelection();
      return;
    }
    clearSelection();
    singlePanelKey.value = node;
    linkFromKey.value = node;
  },
};

// ── Legend ────────────────────────────────────────────────────────────────────

/**
 * Derived from the same two maps the nodes are drawn from, never restated.
 *
 * It used to be three hand-written pairs — Ally #2563eb, Neutral #6b7280, Enemy
 * #dc2626 — which is the pre-5e enum that `20260519000001` replaced with the
 * six-step attitude scale. The graph itself moved with it (see
 * `npcRelationshipCanvasColor`, whose own docstring records the same drift being
 * fixed a layer down), so for every release since, the key under the graph named
 * three groups that could no longer appear in it and gave them colours nothing
 * on screen was painting.
 *
 * That is the failure mode a legend has and a chart does not: it is prose about
 * a picture, so it stays green through every check while quietly describing a
 * different picture. Building it from `NPC_RELATIONSHIP_LABELS` and the ramp
 * tokens is what makes the next enum change reach it — and the hexes go with it,
 * since a fixed literal cannot follow the theme the graph now follows.
 *
 * `unknown` is included: it is a real stored value, it is what an NPC with no
 * attitude set renders as, and a grey node with no entry in the key is exactly
 * the question this legend exists to answer.
 */
const legendItems = computed<[string, string][]>(() =>
  (Object.keys(NPC_RELATIONSHIP_LABELS) as NpcRelationship[]).map((relationship) => [
    NPC_RELATIONSHIP_LABELS[relationship],
    npcRelationshipVar(relationship),
  ]),
);
</script>

<style scoped>
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: width 0.2s ease, opacity 0.15s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  width: 0;
  opacity: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
