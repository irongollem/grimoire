<template>
  <ListPageLayout
    title="NPC Sets"
    description="Playlists of NPCs: assemble the cast for a session, then export them to the Card Forge in one tap"
  >
    <template #title-suffix>
      <ManualHelpLink page="npc-sets" />
    </template>

    <template #actions>
      <ListActionButton :icon="IconChevronLeft" label="NPCs" to="/npcs" />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Set"
        mobile-label="Set"
        @click="openCreate"
      />
      <ListLayoutToggle v-model="layout" />
    </template>

    <!-- Same auto-fill grid as the sets; each placeholder is a set card:
         name and count, a row of portrait thumbs, the export button. -->
    <ListSkeleton v-if="isLoading && layout === 'rows'" variant="stack" :count="6" />
    <div v-else-if="isLoading" role="status" class="sets-grid">
      <span class="sr-only">Loading…</span>
      <div
        v-for="n in 6"
        :key="n"
        class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <div class="flex flex-col gap-1.5">
          <SkeletonBlock class="h-5 w-3/5" />
          <SkeletonBlock class="h-3 w-1/4" />
        </div>
        <div class="flex gap-1.5">
          <SkeletonBlock v-for="t in 4" :key="t" class="size-10 rounded-md" />
        </div>
        <SkeletonBlock class="h-9 w-full rounded-md" />
      </div>
    </div>

    <EmptyState
      v-else-if="!sets.length"
      title="No NPC sets yet"
      description="Group the NPCs you'll need for a session into a set, then send the whole set to the Card Forge to print their cards."
    >
      <template #icon><IconLayers class="h-16 w-16" /></template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Create your first set" @click="openCreate" />
      </template>
    </EmptyState>

    <div v-else ref="containerRef">
      <EntityCollection
        :items="sets"
        :item-key="setKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="GRID_ROW_PX"
        :row-estimate="ROW_PX"
      >
        <template #card="{ item: set }">
          <NpcSetCard
            :set="set"
            :members="membersFor(set)"
            @edit="openEdit(set)"
            @delete="remove(set)"
            @export="exportToForge(set)"
          />
        </template>
        <template #row="{ item: set }">
          <NpcSetRow
            :set="set"
            :members="membersFor(set)"
            @edit="openEdit(set)"
            @delete="remove(set)"
            @export="exportToForge(set)"
          />
        </template>
      </EntityCollection>
    </div>
  </ListPageLayout>

  <NpcSetEditorModal
    v-if="editorOpen"
    :set="editing"
    @close="editorOpen = false"
    @saved="editorOpen = false"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { IconAdd, IconChevronLeft, IconLayers } from "@/lib/icons";
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SkeletonBlock from "@/components/common/feedback/SkeletonBlock.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout } from "@/composables/useListLayout";
import { useAutoFillColumns } from "@/composables/useGridColumns";
import NpcSetRow from "@/components/npcs/NpcSetRow.vue";
import NpcSetCard from "@/components/npcs/NpcSetCard.vue";
import NpcSetEditorModal from "@/components/npcs/NpcSetEditorModal.vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useNpcSets, useDeleteNpcSet } from "@/composables/npcs/useNpcSets";
import { useCardForgeStore } from "@/stores/cardForge";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { NpcListRow, NpcSet } from "@/types/npc.types";

const router = useRouter();
const { data: npcsData } = useNpcs();
const { data: setsData, isLoading } = useNpcSets();
const deleteSet = useDeleteNpcSet();
const forge = useCardForgeStore();
const { confirm } = useConfirm();
const toast = useToast();

// The page header's toggle writes the same key. Cards is today's look.
const layout = useListLayout("npc-sets", "grid");
const containerRef = ref<HTMLElement | null>(null);
// 18rem minimum card, matching the skeleton's `.sets-grid` track.
const columns = useAutoFillColumns(containerRef, 18, 0.75);
const setKey = (set: NpcSet) => set.id;
// Heights in px before a card or row is measured: a card is 2 border + 32
// padding + head 44 + thumbs 36 + export button 36 + gaps 36 = 186; a row is
// 2 + 32 + the 44 name block (or 36 thumbs) = 82.
const GRID_ROW_PX = 186;
const ROW_PX = 82;

const sets = computed<NpcSet[]>(() => setsData.value ?? []);

const npcById = computed(() => {
  const map = new Map<string, NpcListRow>();
  for (const n of npcsData.value ?? []) map.set(n.id, n);
  return map;
});

// Resolve membership in stored (playlist) order, dropping ids of deleted NPCs.
function membersFor(set: NpcSet): NpcListRow[] {
  const map = npcById.value;
  return set.npc_ids.map((id) => map.get(id)).filter((n): n is NpcListRow => !!n);
}

// ── Editor ────────────────────────────────────────────────────────────────────

const editorOpen = ref(false);
const editing = ref<NpcSet | null>(null);

function openCreate() {
  editing.value = null;
  editorOpen.value = true;
}
function openEdit(set: NpcSet) {
  editing.value = set;
  editorOpen.value = true;
}

// ── Delete ──────────────────────────────────────────────────────────────────

async function remove(set: NpcSet) {
  const ok = await confirm(`Delete the set "${set.name}"? The NPCs themselves are not affected.`, {
    title: "Delete set",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await deleteSet.mutateAsync(set.id);
}

// ── Export to Card Forge ──────────────────────────────────────────────────────

function exportToForge(set: NpcSet) {
  const ids = membersFor(set).map((n) => n.id);
  if (!ids.length) return;
  forge.loadNpcIds(ids);
  toast.success(`Loaded ${ids.length} NPC${ids.length === 1 ? "" : "s"} into the Card Forge.`);
  router.push("/forge");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.sets-grid {
  @apply grid gap-4;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
}
</style>
