<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
    <!-- Top bar -->
    <NpcWebTopBar
      v-model:search-query="searchQuery"
      v-model:show-pcs="showPcs"
      v-model:location-filter="locationFilter"
      v-model:type-filter="typeFilter"
      :location-options="locationOptions"
      :type-options="typeOptions"
      :legend-items="legendItems"
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
        :nodes="graphNodes"
        :edges="graphEdges"
        :configs="graphConfigs"
        :event-handlers="eventHandlers"
        class="w-full h-full select-none touch-none"
      />

      <!-- Link mode hint -->
      <transition name="fade">
        <div
          v-if="linkFromKey && !linkToKey"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground font-cinzel text-[0.6875rem] font-semibold tracking-wider shadow-lg pointer-events-none"
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
import { VNetworkGraph, defineConfigs, type EventHandlers } from "v-network-graph";
import { ForceLayout } from "v-network-graph/lib/force-layout";
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
import {
  NPC_RELATIONSHIP_TYPE_LABELS,
  NPC_RELATIONSHIP_TYPE_COLORS,
  NPC_RELATIONSHIP_INVERSE,
} from "@/types/npc.types";
import type { NpcRelationshipType } from "@/types/npc.types";

// ── Filters ───────────────────────────────────────────────────────────────────

const showPcs = ref(true);
const typeFilter = ref<NpcRelationshipType | "">("");
const locationFilter = ref("");
const searchQuery = ref("");

const typeOptions = Object.entries(NPC_RELATIONSHIP_TYPE_LABELS) as [NpcRelationshipType, string][];
const { locationOptions, getDescendantIds } = useLocationTree();

// ── Data ──────────────────────────────────────────────────────────────────────

const { data: allNpcs, isLoading: npcsLoading } = useNpcs();
const { data: partyMembers, isLoading: partyLoading } = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: npcRelations, isLoading: relLoading } = useAllNpcRelations();
const { data: pcNotes, isLoading: pcNotesLoading } = useAllNpcPcNotes();
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

const NPC_RELATIONSHIP_COLORS: Record<string, string> = {
  ally: "#2563eb",
  neutral: "#6b7280",
  enemy: "#dc2626",
  unknown: "#9ca3af",
};

function relColor(rel: string): string {
  return NPC_RELATIONSHIP_COLORS[rel] ?? "#6b7280";
}

// Keys that are pinned (selected) and must always show regardless of search
const pinnedKeys = computed(() => {
  const keys: string[] = [];
  if (linkFromKey.value) keys.push(linkFromKey.value);
  if (linkToKey.value) keys.push(linkToKey.value);
  return new Set(keys);
});

function npcMatchesSearch(npc: { name: string; disguise_name?: string | null }, q: string): boolean {
  const lower = q.toLowerCase();
  return npc.name.toLowerCase().includes(lower) || (npc.disguise_name ?? "").toLowerCase().includes(lower);
}

const graphNodes = computed(() => {
  const nodes: Record<string, { name: string; nodeType: "npc" | "pc"; nodeColor: string; nodeSize: number }> = {};
  const q = searchQuery.value.trim();

  const locationDescendants = locationFilter.value ? getDescendantIds(locationFilter.value) : null;

  for (const npc of allNpcs.value ?? []) {
    const key = `npc:${npc.id}`;
    if (q && !npcMatchesSearch(npc, q) && !pinnedKeys.value.has(key)) continue;
    if (locationDescendants && !locationDescendants.has(npc.location_id ?? "")) continue;
    nodes[key] = {
      name: npc.name,
      nodeType: "npc",
      nodeColor: relColor(npc.relationship),
      nodeSize: 18,
    };
  }

  if (showPcs.value) {
    for (const pc of partyMembers.value ?? []) {
      const key = `pc:${pc.id}`;
      if (q && !pc.name.toLowerCase().includes(q.toLowerCase()) && !pinnedKeys.value.has(key)) continue;
      nodes[key] = {
        name: pc.name,
        nodeType: "pc",
        nodeColor: "#d97706",
        nodeSize: 22,
      };
    }
  }

  return nodes;
});

const graphEdges = computed(() => {
  const edges: Record<string, { source: string; target: string; edgeColor: string; dashed: boolean }> = {};

  for (const rel of npcRelations.value ?? []) {
    const rawType = rel.relationship_type as NpcRelationshipType;
    if (typeFilter.value && rawType !== typeFilter.value && NPC_RELATIONSHIP_INVERSE[rawType] !== typeFilter.value) {
      continue;
    }
    const a = `npc:${rel.npc_id}`;
    const b = `npc:${rel.related_npc_id}`;
    const key = a < b ? `${a}--${b}` : `${b}--${a}`;
    if (!edges[key]) {
      edges[key] = {
        source: a,
        target: b,
        edgeColor: NPC_RELATIONSHIP_TYPE_COLORS[rawType] ?? "#6b7280",
        dashed: false,
      };
    }
  }

  if (showPcs.value) {
    for (const note of pcNotes.value ?? []) {
      if (typeFilter.value && note.relationship_type !== typeFilter.value) continue;
      const npcKey = `npc:${note.npc_id}`;
      const pcKey = `pc:${note.party_member_id}`;
      const key = `${npcKey}--${pcKey}`;
      if (!edges[key]) {
        edges[key] = {
          source: npcKey,
          target: pcKey,
          edgeColor: NPC_RELATIONSHIP_TYPE_COLORS[note.relationship_type] ?? "#d97706",
          dashed: true,
        };
      }
    }
  }

  return edges;
});

const nodeCount = computed(() => Object.keys(graphNodes.value).length);

// ── Graph config ──────────────────────────────────────────────────────────────

const graphConfigs = defineConfigs({
  view: {
    autoPanAndZoomOnLoad: "fit-content",
    layoutHandler: new ForceLayout({
      positionFixedByDrag: true,
    }),
  },
  node: {
    normal: {
      color: (n) => (n as { nodeColor: string }).nodeColor,
      radius: (n) => (n as { nodeSize: number }).nodeSize,
      strokeWidth: 2,
      strokeColor: "#00000040",
    },
    hover: {
      color: (n) => (n as { nodeColor: string }).nodeColor,
      radius: (n) => (n as { nodeSize: number }).nodeSize + 3,
    },
    label: {
      visible: true,
      fontSize: 11,
      color: "#e2d9c8",
    },
    focusring: { visible: false },
    selectable: false,
  },
  edge: {
    normal: {
      color: (e) => (e as unknown as { edgeColor: string }).edgeColor,
      width: 2,
      dasharray: (e) => ((e as unknown as { dashed: boolean }).dashed ? "5,4" : "0"),
    },
    hover: {
      color: (e) => (e as unknown as { edgeColor: string }).edgeColor,
      width: 3,
    },
    marker: {
      source: { type: "none" },
      target: { type: "none" },
    },
  },
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
        color: NPC_RELATIONSHIP_TYPE_COLORS[effectiveType] ?? "#6b7280",
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

const legendItems: [string, string][] = [
  ["Ally", "#2563eb"],
  ["Neutral", "#6b7280"],
  ["Enemy", "#dc2626"],
];
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
