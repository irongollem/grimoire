<template>
  <ListPageLayout
    title="NPC Sets"
    description="Playlists of NPCs — assemble the cast for a session, then export them to the Card Forge in one tap"
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
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
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

    <div v-else class="sets-grid">
      <NpcSetCard
        v-for="set in sets"
        :key="set.id"
        :set="set"
        :members="membersFor(set)"
        @edit="openEdit(set)"
        @delete="remove(set)"
        @export="exportToForge(set)"
      />
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
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import NpcSetCard from "@/components/npcs/NpcSetCard.vue";
import NpcSetEditorModal from "@/components/npcs/NpcSetEditorModal.vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useNpcSets, useDeleteNpcSet } from "@/composables/npcs/useNpcSets";
import { useCardForgeStore } from "@/stores/cardForge";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { Npc, NpcSet } from "@/types/npc.types";

const router = useRouter();
const { data: npcsData } = useNpcs();
const { data: setsData, isLoading } = useNpcSets();
const deleteSet = useDeleteNpcSet();
const forge = useCardForgeStore();
const { confirm } = useConfirm();
const toast = useToast();

const sets = computed<NpcSet[]>(() => setsData.value ?? []);

const npcById = computed(() => {
  const map = new Map<string, Npc>();
  for (const n of npcsData.value ?? []) map.set(n.id, n);
  return map;
});

// Resolve membership in stored (playlist) order, dropping ids of deleted NPCs.
function membersFor(set: NpcSet): Npc[] {
  const map = npcById.value;
  return set.npc_ids.map((id) => map.get(id)).filter((n): n is Npc => !!n);
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
