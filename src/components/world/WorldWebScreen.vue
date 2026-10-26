<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <WorldWebTopBar
      :mode="mode"
      :counts="rest.counts"
      :group-options="groupOptions"
      :focus-options="focusOptions"
      @focus="enterFocus"
      @whole="leaveFocus"
    />

    <div class="relative min-h-0 flex-1 overflow-hidden bg-muted/10">
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
        <BannerLoader class="h-6" />
      </div>

      <div
        v-else-if="!directory.size"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground"
      >
        <IconNetwork class="h-10 w-10 opacity-30" />
        <p class="text-body">{{ readonly ? "Nothing in the world has been tied to anything you know of yet." : "No connections recorded yet." }}</p>
        <p v-if="!readonly" class="text-caption">Tie things together from any sheet, or with Connect… on a node, and the web fills in.</p>
      </div>

      <!-- ── Focus ─────────────────────────────────────────────────────── -->
      <template v-else-if="mode === 'focus' && focusGraph">
        <div class="absolute inset-0 flex flex-col" :class="panelOpen && !isPhone && 'md:pr-80'">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
            <WorldWebTrail :trail="trailItems" @walk="walkTrail" />
            <SegmentedControl v-model="steps" :options="STEP_OPTIONS" size="md" class="ml-auto" />
          </div>

          <div class="min-h-0" :class="isPhone ? 'h-[42%] shrink-0' : 'flex-1'">
            <WorldWebFocus
              :focus="focusGraph"
              :directory="directory"
              :connect-from="connectFrom"
              :focal-points="focalPoints"
              :is-editable-edge="!readonly"
              @node="onNodeTap"
              @edge="onEdgeTap"
            />
          </div>
          <p v-if="hiddenNote" class="px-4 pb-2 text-caption italic text-muted-foreground">{{ hiddenNote }}</p>

          <!-- A phone reads the same ties as a list under the ring; nothing is only in the picture. -->
          <div v-if="isPhone" class="min-h-0 flex-1 overflow-y-auto border-t border-border bg-card p-3">
            <div class="mb-3 flex flex-wrap gap-2">
              <AppButton v-if="canConnect(focusEntity)" variant="outline" size="md" :icon="IconLink" label="Connect…" @click="startConnect(focusGraph.center)" />
              <AppButton v-if="sheetPathFor(focusGraph.center)" variant="outline" size="md" :icon="IconExternalLink" label="Open sheet" :to="sheetPathFor(focusGraph.center) ?? undefined" />
            </div>
            <template v-if="connectFrom">
              <WorldWebConnectCard
                :from-key="connectFrom"
                :from-name="nameOf(connectFrom)"
                :target="connectTarget"
                :busy="editing.busy.value"
                @target="connectTarget = $event"
                @pick="finishConnect"
                @cancel="cancelConnect"
              />
            </template>
            <WorldWebTieGroups
              v-else
              :groups="focusGroups"
              :subject-key="focusGraph.center"
              :subject-name="nameOf(focusGraph.center)"
              :editable="!readonly"
              :busy="editing.busy.value"
              @node="onNodeTap"
              @retype="retype"
              @remove="removeTie"
              @words="saveWords"
            />
          </div>
        </div>
      </template>

      <!-- ── The whole web at rest ─────────────────────────────────────── -->
      <WorldWebGraph
        v-else
        :graph="rest"
        :badges="badges"
        :group="groupDrawn"
        :selected-key="selected"
        :connect-from="connectFrom"
        :focal-points="focalPoints"
        @node="onNodeTap"
        @edge="onEdgeKey"
        @background="clearSelection"
        @faction="openFaction"
      />

      <p
        v-if="!loading && mode === 'web' && directory.size && !rest.nodes.size"
        class="pointer-events-none absolute inset-x-0 top-1/3 text-center text-body italic text-muted-foreground"
      >
        Nothing matches. Clear the filters to see the whole web.
      </p>

      <!-- Hint while a Connect… waits for its other end. -->
      <div
        v-if="connectFrom && !connectTarget && !(isPhone && mode === 'focus')"
        class="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary/90 px-3 py-1.5 text-label-lg font-semibold text-primary-foreground shadow-lg"
      >
        Tap another node to connect {{ nameOf(connectFrom) }}
      </div>

      <!-- ── Side panel (a bottom sheet on a phone; in focus on a phone the list above is the panel) ── -->
      <WorldWebPanel v-if="panelOpen && !(isPhone && mode === 'focus')" :label="panelLabel">
        <WorldWebConnectCard
          v-if="connectFrom"
          :from-key="connectFrom"
          :from-name="nameOf(connectFrom)"
          :target="connectTarget"
          :busy="editing.busy.value"
          @target="connectTarget = $event"
          @pick="finishConnect"
          @cancel="cancelConnect"
        />

        <div v-else-if="edgeSelection" class="flex flex-col gap-3 p-4">
          <div class="flex items-start justify-between gap-2">
            <h2 class="text-heading-sm font-bold leading-tight text-foreground">
              {{ nameOf(edgeSelection.subject) }} and {{ nameOf(edgeSelection.other) }}
            </h2>
            <AppButton variant="ghost" size="icon-sm" :icon="IconClose" label="Close" @click="clearSelection" />
          </div>
          <WorldWebTieGroups
            :groups="edgeGroups"
            :subject-key="edgeSelection.subject"
            :subject-name="nameOf(edgeSelection.subject)"
            :editable="!readonly"
            :busy="editing.busy.value"
            @node="onNodeTap"
            @retype="retype"
            @remove="removeTie"
            @words="saveWords"
          />
        </div>

        <WorldWebNodeCard
          v-else-if="panelEntity"
          :entity="panelEntity"
          :ties="index.get(panelEntity.key) ?? NO_TIES"
          :editable="!readonly"
          :is-focus="mode === 'focus'"
          :sheet-path="sheetPathFor(panelEntity.key)"
          :busy="editing.busy.value"
          @close="clearSelection"
          @focus="enterFocus(panelEntity.key)"
          @connect="startConnect(panelEntity.key)"
          @node="onNodeTap"
          @retype="retype"
          @remove="removeTie"
          @words="saveWords"
        />
      </WorldWebPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import WorldWebConnectCard from "@/components/world/WorldWebConnectCard.vue";
import WorldWebFocus from "@/components/world/WorldWebFocus.vue";
import WorldWebGraph from "@/components/world/WorldWebGraph.vue";
import WorldWebNodeCard from "@/components/world/WorldWebNodeCard.vue";
import WorldWebPanel from "@/components/world/WorldWebPanel.vue";
import WorldWebTieGroups from "@/components/world/WorldWebTieGroups.vue";
import WorldWebTopBar from "@/components/world/WorldWebTopBar.vue";
import WorldWebTrail from "@/components/world/WorldWebTrail.vue";
import { useWorldWebEditing } from "@/composables/world/useWorldWebEditing";
import { useBelow } from "@/composables/useBreakpoint";
import { useHotkeys } from "@/composables/useHotkeys";
import { useToast } from "@/composables/useToast";
import { IconClose, IconExternalLink, IconLink, IconNetwork } from "@/lib/icons";
import type { TypeChoice } from "@/lib/worldLinks/connections";
import { buildFocus, indexTies, type FocusSteps } from "@/lib/worldWeb/focus";
import { groupMembers, groupOptions as groupOptionsOf } from "@/lib/worldWeb/groups";
import { dmSheetPath, isGroupKind, isLinkKind, nodeKey, parseNodeKey, playerListPath, type GroupKind } from "@/lib/worldWeb/kinds";
import { badgesFor, buildRestGraph, entityDirectory, type WebEntity } from "@/lib/worldWeb/model";
import { groupTies, type WorldTie } from "@/lib/worldWeb/ties";
import { pairKey } from "@/lib/worldWeb/model";
import { useWorldUiStore } from "@/stores/ui/world";
import type { WorldRef } from "@/types/connections.types";

const {
  ties,
  people,
  loading = false,
  readonly = false,
  focusKey = null,
  homeKey = null,
  focalPoints = {},
} = defineProps<{
  ties: readonly WorldTie[];
  /** People the web draws even with no ties (the DM's NPCs and PCs). A player's web draws only what the ties name. */
  people: readonly WebEntity[];
  loading?: boolean;
  /** A player's read: no editing, no Connect…. */
  readonly?: boolean;
  /** Open focused on this node (`?focus=`). */
  focusKey?: string | null;
  /** Where a focus-first screen starts when nothing was asked for: a player's own character. */
  homeKey?: string | null;
  focalPoints?: Record<string, { x: number; y: number }>;
}>();

const ui = useWorldUiStore();
const router = useRouter();
const toast = useToast();
const editing = useWorldWebEditing();
const isPhone = useBelow("md");

const NO_TIES: readonly WorldTie[] = [];
const STEP_OPTIONS = [
  { value: 1, label: "1 step" },
  { value: 2, label: "2 steps" },
] as const;

// ── Data ─────────────────────────────────────────────────────────────────────

const directory = computed(() => entityDirectory(ties, people));
const index = computed(() => indexTies(ties));

function nameOf(key: string): string {
  return directory.value.get(key)?.name ?? key;
}

// ── Group by ─────────────────────────────────────────────────────────────────

const groupOptions = computed<Record<GroupKind, ReturnType<typeof groupOptionsOf>>>(() => ({
  faction: groupOptionsOf(ties, "faction"),
  location: groupOptionsOf(ties, "location"),
  deity: groupOptionsOf(ties, "deity"),
}));

const groupKey = computed(() => {
  const kind = ui.worldWebGroupKind;
  return isGroupKind(kind) && ui.worldWebGroupId ? nodeKey(kind, ui.worldWebGroupId) : null;
});
const groupMemberSet = computed(() => (groupKey.value ? groupMembers(ties, groupKey.value) : new Set<string>()));

// ── The web at rest ──────────────────────────────────────────────────────────

const selected = ref<string | null>(null);
/** A line the DM opened: its two ends, and every tie between them. Declared before the focus watcher below, which clears it on its first run. */
const edgeSelection = ref<{ subject: string; other: string; ties: WorldTie[] } | null>(null);
const connectFrom = ref<string | null>(null);
const connectTarget = ref<(WorldRef & { name: string }) | null>(null);

/** Nodes that must show whatever the filters say: the group being drawn, who it gathers, what is open. */
const pinned = computed(() => {
  const keys = new Set<string>(groupMemberSet.value);
  for (const key of [groupKey.value, selected.value, connectFrom.value]) if (key) keys.add(key);
  return keys;
});

const rest = computed(() =>
  buildRestGraph(directory.value, ties, {
    search: ui.worldWebSearch,
    hiddenKinds: new Set(ui.worldWebHiddenKinds),
    family: ui.worldWebTieFamily,
    pinned: pinned.value,
  }),
);

const badges = computed(() => badgesFor(ties));

/** The group's own node on the fence, and who the hull gathers among the nodes actually drawn. */
const groupDrawn = computed(() => {
  const anchor = groupKey.value;
  if (!anchor || !rest.value.nodes.has(anchor)) return null;
  return { anchor, members: new Set([...groupMemberSet.value].filter((k) => rest.value.nodes.has(k))) };
});

const focusOptions = computed(() =>
  [...directory.value.values()].map((e) => ({ id: e.key, name: e.name })).sort((a, b) => a.name.localeCompare(b.name)),
);

// ── Focus ────────────────────────────────────────────────────────────────────

const mode = ref<"web" | "focus">("web");
const trail = ref<string[]>([]);
const steps = ref<FocusSteps>(1);
const wholeAsked = ref(false);

const center = computed(() => trail.value[trail.value.length - 1] ?? null);
const focusGraph = computed(() => (center.value ? buildFocus(index.value, center.value, steps.value, nameOf) : null));
const focusEntity = computed(() => (center.value ? (directory.value.get(center.value) ?? null) : null));
const focusGroups = computed(() => (center.value ? groupTies(index.value.get(center.value) ?? NO_TIES, center.value) : []));
const trailItems = computed(() => trail.value.map((key) => ({ key, name: nameOf(key) })));
const hiddenNote = computed(() => {
  const hidden = focusGraph.value?.hidden;
  if (!hidden || (!hidden.first && !hidden.second)) return null;
  return `${hidden.first + hidden.second} more are tied in than the picture can hold. The list has all of them.`;
});

const MAX_TRAIL = 12;

function enterFocus(key: string) {
  if (!directory.value.has(key)) return;
  mode.value = "focus";
  trail.value = [key];
  selected.value = null;
  edgeSelection.value = null;
}

function pushFocus(key: string) {
  if (key === center.value) return;
  trail.value = [...trail.value, key].slice(-MAX_TRAIL);
}

function walkTrail(i: number) {
  trail.value = trail.value.slice(0, i + 1);
}

function leaveFocus() {
  const was = center.value;
  mode.value = "web";
  wholeAsked.value = true;
  trail.value = [];
  edgeSelection.value = null;
  selected.value = was && rest.value.nodes.has(was) ? was : null;
}

/** A phone, and a player, open on a focus rather than on every dot at once. */
function mostTied(): string | null {
  let best: string | null = null;
  let most = 0;
  for (const [key, list] of index.value) {
    if (!directory.value.has(key)) continue;
    // Ties break on name, so the same world always opens on the same node.
    if (list.length > most || (list.length === most && best !== null && nameOf(key).localeCompare(nameOf(best)) < 0)) {
      best = key;
      most = list.length;
    }
  }
  return best;
}

function startKey(): string | null {
  if (focusKey && directory.value.has(focusKey)) return focusKey;
  if (wholeAsked.value) return null;
  if (!readonly && !isPhone.value) return null;
  if (homeKey && directory.value.has(homeKey)) return homeKey;
  return mostTied();
}

// Open where asked once the ties have arrived; `?focus=` moving to another node re-focuses.
watch(
  () => [loading, directory.value.size, focusKey] as const,
  () => {
    if (loading || !directory.value.size) return;
    if (focusKey && directory.value.has(focusKey) && center.value !== focusKey) {
      enterFocus(focusKey);
      return;
    }
    if (mode.value === "web" && !wholeAsked.value && trail.value.length === 0) {
      const start = startKey();
      if (start) enterFocus(start);
    }
  },
  { immediate: true },
);

// ── Selection, edges and the panel ──────────────────────────────────────────

const edgeGroups = computed(() => (edgeSelection.value ? groupTies(edgeSelection.value.ties, edgeSelection.value.subject) : []));

const panelEntity = computed(() => {
  const key = mode.value === "focus" ? center.value : selected.value;
  return key ? (directory.value.get(key) ?? null) : null;
});
const panelOpen = computed(() => !!connectFrom.value || !!edgeSelection.value || !!panelEntity.value);
const panelLabel = computed(() => (connectFrom.value ? "Connect" : (panelEntity.value?.name ?? "Tie")));

function sheetPathFor(key: string): string | null {
  const ref = parseNodeKey(key);
  if (!ref) return null;
  return readonly ? playerListPath(ref.kind) : dmSheetPath(ref);
}

function canConnect(entity: WebEntity | null): boolean {
  return !readonly && entity !== null && isLinkKind(entity.kind);
}

function clearSelection() {
  selected.value = null;
  edgeSelection.value = null;
  cancelConnect();
}

/** A tap on a node, wherever it is drawn: finish a Connect…, else move the focus or open the node. */
function onNodeTap(key: string) {
  if (connectFrom.value && key !== connectFrom.value) {
    chooseTarget(key);
    return;
  }
  edgeSelection.value = null;
  if (mode.value === "focus") pushFocus(key);
  else selected.value = selected.value === key ? null : key;
}

function openEdge(subject: string, other: string, pairTies: WorldTie[]) {
  if (connectFrom.value) return;
  edgeSelection.value = { subject, other, ties: pairTies };
  selected.value = null;
}

function onEdgeKey(edgeKey: string) {
  const edge = rest.value.edges.find((e) => e.key === edgeKey);
  if (edge) openEdge(edge.source, edge.target, edge.ties);
}

function onEdgeTap(tie: WorldTie) {
  const a = nodeKey(tie.from_kind, tie.from_id);
  const b = nodeKey(tie.to_kind, tie.to_id);
  const pair = pairKey(a, b);
  const same = ties.filter((t) => pairKey(nodeKey(t.from_kind, t.from_id), nodeKey(t.to_kind, t.to_id)) === pair);
  openEdge(a, b, same);
}

function openFaction(factionId: string) {
  if (readonly) void router.push("/play/factions");
  else void router.push({ name: "faction-detail", params: { id: factionId } });
}

// ── Connect… ─────────────────────────────────────────────────────────────────

function startConnect(key: string) {
  connectFrom.value = key;
  connectTarget.value = null;
  edgeSelection.value = null;
}

function cancelConnect() {
  connectFrom.value = null;
  connectTarget.value = null;
}

function chooseTarget(key: string) {
  const ref = parseNodeKey(key);
  if (!ref || !isLinkKind(ref.kind)) {
    toast.info("A quest says what it involves on the quest itself.");
    return;
  }
  connectTarget.value = { kind: ref.kind, id: ref.id, name: nameOf(key) };
}

async function finishConnect(choice: TypeChoice) {
  if (!connectFrom.value || !connectTarget.value) return;
  const ok = await editing.connect(connectFrom.value, connectTarget.value, choice);
  if (ok) cancelConnect();
}

// ── Editing a tie ────────────────────────────────────────────────────────────

/** The subject a tie is edited from: the open node, the open edge's first end, or the focus centre. */
function editSubject(tie: WorldTie): string {
  const open = edgeSelection.value?.subject ?? (mode.value === "focus" ? center.value : selected.value);
  if (open && (nodeKey(tie.from_kind, tie.from_id) === open || nodeKey(tie.to_kind, tie.to_id) === open)) return open;
  return nodeKey(tie.from_kind, tie.from_id);
}

async function retype(tie: WorldTie, choice: TypeChoice) {
  await editing.retypeTie(tie, editSubject(tie), choice);
}
async function removeTie(tie: WorldTie) {
  if (await editing.removeTie(tie, editSubject(tie))) edgeSelection.value = null;
}
async function saveWords(tie: WorldTie, words: { note: string; told: string }) {
  await editing.saveWords(tie, words);
}

// Escape peels one layer: Connect…, then the open edge or node.
useHotkeys(
  [{ combo: "Escape", description: "Close the open node", hidden: true, handler: clearSelection }],
  { enabled: () => panelOpen.value && !(mode.value === "focus" && !connectFrom.value && !edgeSelection.value) },
);
</script>
