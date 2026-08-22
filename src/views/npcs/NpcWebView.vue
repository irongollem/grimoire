<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
    <!-- Top bar -->
    <NpcWebTopBar
      v-model:search-query="ui.npcWebSearch"
      v-model:show-pcs="ui.npcWebShowPcs"
      v-model:location-filter="ui.npcWebFilterLocation"
      v-model:type-filter="ui.npcWebFilterType"
      v-model:focus-faction="ui.npcWebFocusFaction"
      v-model:relationship-filter="ui.npcWebFilterRelationship"
      :location-options="locationOptions"
      :type-options="typeOptions"
      :faction-options="factionOptions"
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
        ref="graphRef"
        v-model:layouts="layouts"
        @wheel="cameraTakenByUser = true"
        @pointerdown="cameraTakenByUser = true"
        :nodes="graphNodes"
        :edges="graphEdges"
        :configs="graphConfigs"
        :event-handlers="eventHandlers"
        :layers="GRAPH_LAYERS"
        class="w-full h-full select-none touch-none"
      >
        <!--
          The focused faction's boundary, under the edges and nodes so it reads
          as ground rather than as another thing on the graph.

          Fill plus a thick round-joined stroke of the same colour, which is what
          rounds the corners — and what makes the degenerate cases work: two
          members become a capsule and one becomes a disc, with no special casing.
        -->
        <template #factionHull="{ scale }">
          <path
            v-for="(d, i) in focusHullPaths"
            :key="i"
            :d="d"
            class="fill-primary/10 stroke-primary/25"
            :stroke-width="28 * scale"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </template>

        <!--
          Faction membership, drawn on the node rather than as nodes of its own.
          `node-labels` puts this above the nodes in the layer stack; positions
          come from `layouts`, which the force layout writes as it settles.
        -->
        <template #nodeOverlay="{ scale }">
          <!--
            Party portraits, laid over the gold circle that stands in for them.
            PCs only, deliberately: there are a handful of them and several
            hundred NPCs, and a graph that fetches every portrait at once to
            render each at 36px is a lot of network for very little picture.

            `foreignObject` rather than an SVG `<image>` because the crop has to
            honour the focal point the DM already set on the face, and SVG's
            `preserveAspectRatio` only offers nine fixed alignments. Inside it
            `FocalImage` does what it does everywhere else, including choosing a
            crop by smartcrop when no focal point was set.
          -->
          <foreignObject
            v-for="pc in pcPortraits"
            :key="pc.nodeKey"
            :x="pc.cx - pc.radius * scale"
            :y="pc.cy - pc.radius * scale"
            :width="pc.radius * 2 * scale"
            :height="pc.radius * 2 * scale"
            class="pointer-events-none"
            :opacity="pc.dimmed ? 0.22 : 1"
          >
            <div class="h-full w-full overflow-hidden rounded-full">
              <FocalImage
                :src="pc.portraitUrl"
                :focal-point="pc.focalPoint"
                format="token"
                :alt="pc.name"
              />
            </div>
          </foreignObject>

          <!--
            Painted with a background-coloured stroke under the fill
            (`paint-order`), which haloes the text: these sit inside the fence
            where relationship edges cross, and unhaloed 9px type over a line is
            unreadable.
          -->
          <text
            v-for="member in memberCaptions"
            :key="`caption-${member.nodeKey}`"
            :x="member.cx"
            :y="member.cy + member.dy * scale"
            text-anchor="middle"
            dominant-baseline="central"
            :font-size="10 * scale"
            :stroke-width="3 * scale"
            paint-order="stroke fill"
            class="fill-primary stroke-background font-semibold pointer-events-none"
          >{{ member.caption }}</text>

          <defs>
            <clipPath id="npcweb-pip-clip">
              <circle cx="0" cy="0" :r="PIP_RADIUS" />
            </clipPath>
          </defs>
          <g v-for="badge in nodeBadges" :key="badge.nodeKey">
            <g
              v-for="pip in badge.pips"
              :key="pip.factionId"
              :transform="`translate(${badge.cx + pip.dx * scale}, ${badge.cy + pip.dy * scale})`"
              class="cursor-pointer"
              @pointerenter="onPipEnter($event, pip)"
              @pointerleave="onPipLeave"
              @click.stop="onPipClick(pip)"
            >
              <!--
                Two nested transforms on purpose. The outer one is an attribute,
                placing the badge in graph space; this inner one is a *style*, so
                the browser can transition it — an attribute cannot be animated by
                CSS. Content is centred on the origin, so scaling about it needs
                no transform-origin.
              -->
              <g
                :style="{
                  transform: `scale(${scale * (isPipOpen(pip) ? badge.openScale : 1)})`,
                  transition: pipTransition,
                }"
                :opacity="(pip.active ? 1 : 0.45) * (badge.dimmed ? 0.3 : 1)"
              >
                <circle :r="PIP_RADIUS" class="fill-card stroke-border" stroke-width="1" />
                <image
                  v-if="pip.emblemUrl"
                  :href="pip.emblemUrl"
                  :x="-PIP_RADIUS"
                  :y="-PIP_RADIUS"
                  :width="PIP_RADIUS * 2"
                  :height="PIP_RADIUS * 2"
                  preserveAspectRatio="xMidYMid slice"
                  clip-path="url(#npcweb-pip-clip)"
                />
                <text
                  v-else
                  text-anchor="middle"
                  dominant-baseline="central"
                  :font-size="PIP_RADIUS"
                  class="fill-muted-foreground font-semibold"
                >{{ pip.initial }}</text>
              </g>
            </g>
            <text
              v-if="badge.overflow"
              :x="badge.cx + badge.overflowDx * scale"
              :y="badge.cy + badge.overflowDy * scale"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="PIP_RADIUS * scale"
              :opacity="badge.dimmed ? 0.3 : 1"
              class="fill-muted-foreground font-semibold"
            >+{{ badge.overflow }}</text>
          </g>
        </template>
      </VNetworkGraph>

      <!--
        Names the shape. A tinted region with no caption is a mystery, and the
        picker that set it is at the other end of the bar.
      -->
      <div
        v-if="focusedFactionName"
        class="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-label-lg font-semibold text-foreground"
      >
        {{ focusedFactionName }}
      </div>

      <!--
        Teleported to <body> because the graph area is `overflow-hidden`: a
        tooltip drawn inside it is clipped the moment a badge sits near an edge,
        which is exactly where a force layout likes to put things.
      -->
      <Teleport to="body">
        <div
          v-if="hoveredPip"
          ref="pipTooltipRef"
          :style="pipTooltipStyle"
          class="z-50 pointer-events-none rounded-md border border-border bg-popover px-2 py-1 shadow-lg"
        >
          <p class="text-label-lg font-semibold text-foreground">{{ hoveredPip.pip.factionName }}</p>
          <p class="text-caption text-muted-foreground">
            {{ pipTooltipDetail }}
          </p>
        </div>
      </Teleport>

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
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useRouter } from "vue-router";
import { IconNetwork } from '@/lib/icons';
import { npcRelationshipVar } from "@/lib/npcDisplay";
import { VNetworkGraph, type EventHandlers, type Layers, type Layouts } from "v-network-graph";
import FocalImage from "@/components/common/FocalImage.vue";
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
import { factionBadgesByNode, membershipCaption, pipOffsets, type FactionPip } from "@/lib/npcWeb/factions";
import { clusterByProximity, convexHull, hullPath, padOutward, type Point } from "@/lib/npcWeb/hull";
import { useAllFactions } from "@/composables/useFactions";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useIsTouch } from "@/composables/useBreakpoint";
import { prefersReducedMotion } from "@/lib/motion";
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
const router = useRouter();
const isTouch = useIsTouch();

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

// ── Selection & link state ───────────────────────────────────────────────────
// Declared before the graph rather than beside the panels that use it, because
// `useNpcWebGraph` reads `pinnedKeys` — and `const` is not hoisted. While
// nothing evaluated the graph during setup this only looked like odd ordering;
// the moment the auto-fit watcher below read `graphNodes` eagerly it became
// "Cannot access 'pinnedKeys' before initialization" and the whole view failed
// to mount. Definition order here is load-bearing.

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
  focusedKeys: () => focusedKeys.value,
});

// ── Faction focus ─────────────────────────────────────────────────────────────

const { data: allFactions } = useAllFactions();

const factionOptions = computed(() =>
  (allFactions.value ?? []).map((f) => ({ id: f.id, name: f.name })),
);

/**
 * Every faction's members as node keys — what the focused fence is drawn around
 * and what the member captions are looked up from.
 *
 * Former members are included. They are drawn faded on the badge but they are
 * still *in* the shape: an expelled officer standing just outside the boundary
 * would be a nice picture and a false one, since the graph has no idea where
 * "just outside" is.
 */
const factionGroups = computed(() => {
  const groups = new Map<string, Set<string>>();
  const add = (factionId: string, nodeKey: string) => {
    const set = groups.get(factionId);
    if (set) set.add(nodeKey);
    else groups.set(factionId, new Set([nodeKey]));
  };
  for (const row of factionNpcs.value ?? []) add(row.faction_id, `npc:${row.npc_id}`);
  if (ui.npcWebShowPcs) {
    for (const row of factionPartyMembers.value ?? []) add(row.faction_id, `pc:${row.party_member_id}`);
  }
  return groups;
});

/** Members of the focused faction that are actually on screen. */
const focusedKeys = computed(() => {
  const id = ui.npcWebFocusFaction;
  if (!id) return new Set<string>();
  const members = factionGroups.value.get(id);
  if (!members) return new Set<string>();
  return new Set([...members].filter((key) => key in graphNodes.value));
});

const focusedFactionName = computed(
  () => factionOptions.value.find((f) => f.id === ui.npcWebFocusFaction)?.name ?? "",
);

/**
 * The boundary itself, in graph coordinates.
 *
 * Padded by a node radius and a bit so members sit inside it rather than on it,
 * and rebuilt from `layouts` on every tick so it follows the simulation while it
 * settles instead of snapping into place at the end.
 */
const HULL_PADDING = 34;

/**
 * One shape per group of members who actually sit together, not one shape round
 * the whole roster.
 *
 * A single convex hull is only honest when a faction is in one place. When it is
 * not, two members on opposite sides stretch the shape across everything between
 * them — on a real campaign a four-member faction drew a sliver spanning most of
 * the graph, swallowing dozens of non-members and saying nothing beyond "this
 * faction exists somewhere".
 *
 * Letting the faction be in two places is usually the truth anyway, and it beats
 * the alternative of pulling members together in the layout: that works, and it
 * rearranges the graph under the reader every time they focus, taking their
 * sense of where everyone is with it.
 */
const focusHullPaths = computed(() => {
  const points: Point[] = [];
  for (const key of focusedKeys.value) {
    const pos = layouts.value.nodes[key];
    if (pos) points.push({ x: pos.x, y: pos.y });
  }
  if (!points.length) return [];
  return clusterByProximity(points).map((cluster) =>
    hullPath(padOutward(convexHull(cluster), HULL_PADDING)),
  );
});

/**
 * How each member of the focused faction belongs — "Leader", "Agent · Expelled".
 *
 * Only while a faction is focused, and that restraint is the point: inside the
 * fence a Leader and an Informant otherwise look identical, and everywhere else
 * on this graph the same text would be noise on every node at once.
 */
const focusedMemberships = computed(() => {
  const id = ui.npcWebFocusFaction;
  const out = new Map<string, string>();
  if (!id) return out;

  const record = (nodeKey: string, row: { role: string | null; status: string }) => {
    if (!focusedKeys.value.has(nodeKey)) return;
    const caption = membershipCaption({ ...row, active: row.status === "Active" });
    // A plain member gets no caption. Everyone inside the fence is a member, so
    // printing it is a word that says what the shape already said — and it is
    // the *un*remarkable ones being quiet that lets "Leader" and "Expelled"
    // carry. The tooltip still says "Member", because a tooltip that opens onto
    // nothing is a different kind of wrong.
    if (caption === "Member") return;
    out.set(nodeKey, caption);
  };
  for (const row of factionNpcs.value ?? []) {
    if (row.faction_id === id) record(`npc:${row.npc_id}`, row);
  }
  for (const row of factionPartyMembers.value ?? []) {
    if (row.faction_id === id) record(`pc:${row.party_member_id}`, row);
  }
  return out;
});

const memberCaptions = computed(() => {
  const out: { nodeKey: string; caption: string; cx: number; cy: number; dy: number }[] = [];
  for (const [nodeKey, caption] of focusedMemberships.value) {
    const pos = layouts.value.nodes[nodeKey];
    const node = graphNodes.value[nodeKey];
    if (!pos || !node) continue;
    // Below the name, which the graph draws below the node.
    out.push({ nodeKey, caption, cx: pos.x, cy: pos.y, dy: node.nodeSize + 26 });
  }
  return out;
});

// ── Party portraits ───────────────────────────────────────────────────────────

/**
 * A party member's node wears their face.
 *
 * Only the party: a campaign holds a handful of PCs and several hundred NPCs,
 * and fetching every NPC portrait to draw each one at 36px is a great deal of
 * network for very little picture. The gold circle underneath still carries the
 * "this is a PC" signal, and shows through while the image loads or when a
 * member has no portrait at all.
 */
const pcPortraits = computed(() => {
  const out: {
    nodeKey: string;
    name: string;
    portraitUrl: string;
    focalPoint: { x: number; y: number } | null;
    cx: number;
    cy: number;
    radius: number;
    dimmed: boolean;
  }[] = [];

  if (!ui.npcWebShowPcs) return out;

  for (const pc of partyMembers.value ?? []) {
    if (!pc.portrait_url) continue;
    const nodeKey = `pc:${pc.id}`;
    const node = graphNodes.value[nodeKey];
    const pos = layouts.value.nodes[nodeKey];
    if (!node || !pos) continue;
    out.push({
      nodeKey,
      name: pc.name,
      portraitUrl: pc.portrait_url,
      focalPoint: pc.portrait_focal_point ?? null,
      cx: pos.x,
      cy: pos.y,
      radius: node.nodeSize,
      dimmed: node.dimmed,
    });
  }
  return out;
});

// ── Faction membership badges ─────────────────────────────────────────────────

/** Node positions, written by the force layout and read by the badge layer. */
const layouts = ref<Layouts>({ nodes: {} });

/**
 * Frame the graph on what is actually in it.
 *
 * `autoPanAndZoomOnLoad: "fit-content"` fits once, at load — which is before the
 * force simulation has run, so it frames every node stacked at the origin and
 * then the simulation spreads them straight out of shot. On a sparse web the
 * result is an empty canvas at 7x zoom that reads as a broken view rather than a
 * settling one; reviewing anything here meant spinning the mouse wheel first.
 *
 * So: refit once the positions stop moving. Debounced on `layouts` rather than
 * hooked to a "simulation ended" event, because ForceLayout does not expose one
 * and positions going quiet is the same fact observed from outside.
 *
 * Two rules keep it from fighting the user. It never refits after they have
 * touched the camera — a view that re-centres itself while you are reading it is
 * worse than one badly framed. And changing *what is shown* clears that, because
 * filtering down to one NPC while the camera sits over where the others used to
 * be is the same empty canvas by another route.
 */
const graphRef = ref<InstanceType<typeof VNetworkGraph> | null>(null);
const cameraTakenByUser = ref(false);
const framed = ref(false);

const frameWhenSettled = useDebounceFn(() => {
  if (framed.value || cameraTakenByUser.value) return;
  framed.value = true;
  graphRef.value?.fitToContents();
}, 400);

watch(layouts, () => { if (!framed.value) void frameWhenSettled(); }, { deep: true });

// Which nodes are on screen, not where they are: a filter change re-frames, a
// simulation tick does not.
watch(
  () => Object.keys(graphNodes.value).sort().join(","),
  () => {
    framed.value = false;
    cameraTakenByUser.value = false;
    void frameWhenSettled();
  },
);

/**
 * `node-labels` sits above `nodes` in v-network-graph's stack, so the emblems
 * draw over the circles rather than under them. The layer is inside the graph's
 * own pan/zoom transform, so positions are plain graph coordinates and the
 * badges zoom with everything else.
 */
const GRAPH_LAYERS: Layers = { factionHull: "base", nodeOverlay: "node-labels" };

/**
 * Screen pixels, not graph units.
 *
 * `view.scalingObjects` is false — nodes hold a constant screen size however far
 * you zoom — and the layer slot hands out `scale` (`1 / zoomLevel`) so custom
 * drawing can do the same. Every size and offset below is therefore multiplied
 * by `scale` at the point of use. Skip that and the emblems balloon with the
 * zoom: at the fit-content zoom of a two-node graph they render five times the
 * width of the node they belong to.
 *
 * 9 rather than 6, because constant-size nodes make zooming useless as a way to
 * read a badge — whatever it is at rest is all it will ever be. Half again is
 * the most it can take without the row of three reaching over a neighbouring
 * node; the rest of the legibility comes from opening it on hover.
 */
const PIP_RADIUS = 9;

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
/**
 * A badge is 18px across and a faction emblem is detailed art, so at rest it can
 * only ever say "there is an allegiance here" — not which. Pointing at one
 * blows it up to the size of the node it hangs off, which is the largest it can
 * be without covering its neighbour, and names it.
 *
 * The native `title` this replaces did technically work, but a tooltip that
 * arrives after the browser's two-to-three second delay is not an affordance:
 * the badge read as an unexplained blip, which is how it was reported.
 */
const hoveredPip = ref<{ pip: FactionPip; el: Element } | null>(null);
const pipTooltipRef = ref<HTMLElement | null>(null);
const pipTriggerRef = computed(() => hoveredPip.value?.el ?? null);
const pipTooltipOpen = computed(() => !!hoveredPip.value);

const { floatingRef: pipFloatingRef, floatingStyle: pipTooltipStyle } = useAnchoredPopover(
  pipTriggerRef,
  pipTooltipOpen,
  () => { hoveredPip.value = null; },
);
watch(pipTooltipRef, (el) => { pipFloatingRef.value = el; });

/** Web Animations is absent in the test DOM, and a reader may have asked for stillness. */
const pipTransition = computed(() => (prefersReducedMotion() ? "none" : "transform 120ms ease-out"));

const pipTooltipDetail = computed(() =>
  hoveredPip.value ? membershipCaption(hoveredPip.value.pip) : "",
);

function isPipOpen(pip: FactionPip): boolean {
  return hoveredPip.value?.pip.factionId === pip.factionId;
}

function onPipEnter(event: PointerEvent, pip: FactionPip) {
  hoveredPip.value = { pip, el: event.currentTarget as Element };
}

function onPipLeave() {
  hoveredPip.value = null;
}

/**
 * The badge is a way into the faction, not just a label — "no clue what the blip
 * means" and "not a clickable link" were the same report.
 *
 * On touch the first tap is the hover: `pointerenter` fires alongside the tap, so
 * navigating on that same tap would send you to a faction you never got to see
 * named. So the first tap opens the badge and the second follows it.
 */
function onPipClick(pip: FactionPip) {
  if (isTouch.value && hoveredPip.value?.pip.factionId !== pip.factionId) return;
  router.push({ name: "faction-detail", params: { id: pip.factionId } });
}

const nodeBadges = computed(() => {
  const out: {
    nodeKey: string;
    cx: number;
    cy: number;
    dimmed: boolean;
    openScale: number;
    overflow: number;
    overflowDx: number;
    overflowDy: number;
    // Derived from FactionPip rather than restated: the hand-written copy this
    // replaces silently stopped matching the moment role and status were added.
    pips: (FactionPip & { dx: number; dy: number })[];
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
      dimmed: node.dimmed,
      // Opened, a badge matches the node it hangs off — the largest it can be
      // without reaching over a neighbour.
      openScale: node.nodeSize / PIP_RADIUS,
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
const legendItems = computed(() =>
  (Object.keys(NPC_RELATIONSHIP_LABELS) as NpcRelationship[]).map((relationship) => ({
    value: relationship,
    label: NPC_RELATIONSHIP_LABELS[relationship],
    color: npcRelationshipVar(relationship),
  })),
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
