<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
    <!-- Top bar -->
    <div class="shrink-0 px-4 py-3 border-b border-border bg-background flex items-center gap-3 flex-wrap">
      <RouterLink
        to="/npcs"
        class="inline-flex items-center gap-1 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft class="h-3.5 w-3.5" />
        NPCs
      </RouterLink>
      <span class="text-border">|</span>
      <h1 class="font-cinzel text-sm font-bold tracking-wider text-foreground">Relationship Web</h1>

      <div class="ml-auto flex items-center gap-2 flex-wrap">
        <!-- Search -->
        <div class="relative">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter nodes…"
            class="pl-7 pr-3 py-1.5 rounded-md border border-border bg-card font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-36"
          />
        </div>

        <!-- Show PCs toggle -->
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="showPcs
            ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
            : 'border-border text-muted-foreground hover:text-foreground'"
          @click="showPcs = !showPcs"
        >
          <Shield class="h-3 w-3" />
          Party Members
        </button>

        <!-- Location filter -->
        <select
          v-model="locationFilter"
          class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Locations</option>
          <option v-for="loc in locationOptions" :key="loc.id" :value="loc.id">
            {{ '\u00a0\u00a0'.repeat(loc.depth) }}{{ loc.name }}
          </option>
        </select>

        <!-- Relationship type filter -->
        <select
          v-model="typeFilter"
          class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Relationships</option>
          <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
        </select>

        <!-- Legend -->
        <div class="flex items-center gap-3 pl-2 border-l border-border">
          <span v-for="[type, color] in legendItems" :key="type" class="flex items-center gap-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground">
            <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: color }" />
            {{ type }}
          </span>
          <span class="flex items-center gap-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground">
            <span class="inline-block w-5 border-t-2 border-dashed border-muted-foreground/70" />
            PC link
          </span>
        </div>
      </div>
    </div>

    <!-- Graph area (fills remaining space; panel overlays it so the graph never resizes) -->
    <div class="flex-1 relative bg-muted/10 overflow-hidden">
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center">
        <LoadingSpinner />
      </div>
      <div v-else-if="nodeCount === 0" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Network class="h-10 w-10 opacity-30" />
        <p class="font-cinzel text-sm">No connections recorded yet.</p>
        <p class="font-fell text-xs">Add NPC relationships from any NPC sheet to populate the web.</p>
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
          class="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground font-cinzel text-[11px] font-semibold tracking-wider shadow-lg pointer-events-none"
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
          <template v-if="linkFormVisible">
            <div class="p-4 space-y-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase">New Connection</h2>
                <button type="button" @click="cancelLink" class="text-muted-foreground hover:text-foreground transition-colors">
                  <X class="h-4 w-4" />
                </button>
              </div>

              <!-- The two nodes -->
              <div class="flex items-center gap-2">
                <span class="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-muted font-cinzel text-xs font-semibold text-foreground truncate text-center">{{ linkLabelA }}</span>
                <Link2 class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-muted font-cinzel text-xs font-semibold text-foreground truncate text-center">{{ linkLabelB }}</span>
              </div>

              <!-- Relationship type -->
              <div>
                <label class="field-label">Relationship</label>
                <select v-model="linkType" class="field-input">
                  <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
                </select>
              </div>

              <!-- Notes -->
              <div>
                <label class="field-label">
                  {{ isNpcPcLink ? 'Notes' : 'Notes' }}
                  <span class="font-fell font-normal normal-case text-muted-foreground">(optional)</span>
                </label>
                <input v-model="linkNotes" placeholder="Brief context…" class="field-input" />
              </div>

              <!-- Actions -->
              <div class="flex gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  class="flex-1 px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
                  @click="cancelLink"
                >Cancel</button>
                <button
                  type="button"
                  :disabled="isSavingLink"
                  class="flex-1 px-3 py-1.5 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                  @click="saveLink"
                >{{ isSavingLink ? 'Saving…' : 'Save' }}</button>
                <button
                  v-if="editingLinkRelId"
                  type="button"
                  :disabled="isSavingLink"
                  class="w-full px-3 py-1.5 font-cinzel text-xs font-semibold text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                  @click="deleteLinkRel"
                >Delete connection</button>
              </div>
            </div>
          </template>

          <!-- ── NPC panel ───────────────────────────────── -->
          <template v-else-if="panelNpc">
            <!-- Portrait -->
            <div v-if="panelNpc.portrait_url" class="w-full h-36 shrink-0 bg-muted overflow-hidden">
              <FocalImage
                :src="panelNpc.portrait_url"
                :focal-point="panelNpc.portrait_focal_point ?? undefined"
                :alt="panelNpc.name"
                format="square"
                class="w-full h-full"
              />
            </div>

            <div class="p-4 space-y-3">
              <div class="flex items-start justify-between gap-2">
                <h2 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ panelNpc.name }}</h2>
                <button type="button" @click="clearSelection" class="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <X class="h-4 w-4" />
                </button>
              </div>
              <div v-if="panelNpc.occupation" class="font-fell text-xs text-muted-foreground">{{ panelNpc.occupation }}</div>
              <div v-if="panelNpc.race" class="font-fell text-xs text-foreground">{{ panelNpc.race }}</div>
              <div class="flex gap-1.5 flex-wrap">
                <span
                  class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider"
                  :style="{ backgroundColor: relColor(panelNpc.relationship) + '22', color: relColor(panelNpc.relationship) }"
                >{{ panelNpc.relationship }}</span>
                <span class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider bg-muted text-muted-foreground">{{ panelNpc.status }}</span>
              </div>

              <!-- Shift-click hint -->
              <div class="flex items-start gap-1.5 px-2.5 py-2 rounded-md bg-muted/60 text-muted-foreground">
                <Info class="h-3 w-3 shrink-0 mt-0.5" />
                <p class="font-fell text-[11px] leading-snug">Shift+click another node to define a relationship directly from this panel.</p>
              </div>

              <RouterLink
                :to="`/npcs/${panelNpc.id}`"
                class="block text-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Open Sheet
              </RouterLink>
            </div>

            <!-- Connected to this NPC -->
            <div v-if="panelNpcConnections.length" class="px-4 pb-4">
              <div class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground mb-2">CONNECTIONS</div>
              <div class="space-y-1.5">
                <template v-for="conn in panelNpcConnections" :key="conn.id">
                  <!-- Inline edit form -->
                  <div v-if="editingRelId === conn.id" class="rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
                    <select v-model="editRelType" class="field-input text-xs">
                      <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
                    </select>
                    <input v-model="editRelNotes" placeholder="Notes…" class="field-input text-xs" />
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        class="flex-1 px-2 py-1 font-cinzel text-[10px] font-semibold bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                        @click="saveEditRel(conn)"
                      >Save</button>
                      <button
                        type="button"
                        class="px-2 py-1 font-cinzel text-[10px] font-semibold border border-border rounded text-muted-foreground hover:text-foreground transition-colors"
                        @click="cancelEditRel"
                      >Cancel</button>
                      <button
                        type="button"
                        class="px-2 py-1 font-cinzel text-[10px] font-semibold text-destructive hover:opacity-80 transition-opacity"
                        @click="confirmDeleteRel(conn.id)"
                      >Delete</button>
                    </div>
                  </div>

                  <!-- Normal row — click to edit -->
                  <button
                    v-else
                    type="button"
                    class="w-full flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 hover:bg-muted/50 transition-colors group"
                    @click="startEditRel(conn)"
                  >
                    <span
                      class="shrink-0 px-1.5 py-0.5 rounded font-cinzel text-[9px] font-bold"
                      :style="{ backgroundColor: conn.color + '22', color: conn.color }"
                    >{{ conn.typeLabel }}</span>
                    <span class="font-fell text-foreground truncate flex-1 text-left">{{ conn.name }}</span>
                    <Pencil class="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </template>
              </div>
            </div>
          </template>

          <!-- ── PC panel ────────────────────────────────── -->
          <template v-else-if="panelPc">
            <!-- Portrait -->
            <div v-if="panelPc.portrait_url" class="w-full h-36 shrink-0 bg-muted overflow-hidden">
              <FocalImage
                :src="panelPc.portrait_url"
                :focal-point="panelPc.portrait_focal_point ?? undefined"
                :alt="panelPc.name"
                format="square"
                class="w-full h-full"
              />
            </div>

            <div class="p-4 space-y-3">
              <div class="flex items-start justify-between gap-2">
                <h2 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ panelPc.name }}</h2>
                <button type="button" @click="clearSelection" class="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <X class="h-4 w-4" />
                </button>
              </div>
              <div class="flex items-center gap-1.5 font-cinzel text-[10px] font-bold tracking-wider text-amber-400">
                <Shield class="h-3 w-3" />
                Party Member
              </div>
              <div v-if="panelPc.class || panelPc.race" class="font-fell text-xs text-muted-foreground">
                <span v-if="panelPc.class">{{ panelPc.class }}</span>
                <span v-if="panelPc.class && panelPc.race"> · </span>
                <span v-if="panelPc.race">{{ panelPc.race }}</span>
              </div>
              <div class="font-cinzel text-xs text-foreground">Level {{ panelPc.level }}</div>
              <RouterLink
                :to="`/party/${panelPc.id}`"
                class="block mt-2 text-center px-3 py-1.5 rounded-md bg-amber-600 text-white font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Open Sheet
              </RouterLink>
            </div>
          </template>

        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { RouterLink } from "vue-router";
import { ChevronLeft, Shield, X, Network, Link2, Info, Search, Pencil } from "lucide-vue-next";
import { VNetworkGraph, defineConfigs, type EventHandlers } from "v-network-graph";
import { ForceLayout } from "v-network-graph/lib/force-layout";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { useNpcs } from "@/composables/useNpcs";
import { useParty } from "@/composables/useParty";
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

@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
</style>
