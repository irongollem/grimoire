<template>
  <EntityLinkSection
    v-model="newFactionId"
    :entries="entries ?? []"
    :options="availableFactions"
    layout="chip"
    empty="No factions worship this deity."
    placeholder="Add faction…"
    :adding="adding"
    remove-label="faction"
    @add="add"
    @remove="remove"
  >
    <template #entry="{ entry }">
      <div v-if="entry.faction.emblem_url" class="h-4 w-4 shrink-0">
        <FocalImage :src="entry.faction.emblem_url" alt="" format="token" class="w-full h-full" />
      </div>
      <IconShield v-else class="h-3 w-3 text-muted-foreground shrink-0" />
      <RouterLink
        :to="`/factions/${entry.faction.id}`"
        class="font-cinzel text-2xs font-semibold text-foreground hover:text-primary transition-colors"
      >{{ entry.faction.name }}</RouterLink>
      <span v-if="entry.faction.faction_type" class="text-caption-sm text-muted-foreground italic">{{ entry.faction.faction_type }}</span>
    </template>
  </EntityLinkSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconShield } from '@/lib/icons';
import {
  useDeityFactions,
  useAddFactionDeity,
  useRemoveFactionDeity,
} from "@/composables/factions/useFactions";
import { useAllFactions } from "@/composables/factions/useFactions";
import type { FactionDeity } from "@/types/faction.types";
import type { Faction } from "@/types/faction.types";
import EntityLinkSection from "@/components/common/EntityLinkSection.vue";
import FocalImage from "@/components/common/FocalImage.vue";

const props = defineProps<{ deityId: string }>();

type DeityFactionEntry = FactionDeity & { faction: Pick<Faction, "id" | "name" | "faction_type" | "emblem_url"> };

const { data: entries } = useDeityFactions(props.deityId);
const { data: allFactions } = useAllFactions();
const addMut = useAddFactionDeity();
const removeMut = useRemoveFactionDeity();

const linkedIds = computed(() => new Set((entries.value ?? []).map((e) => e.faction_id)));
const availableFactions = computed(() =>
  (allFactions.value ?? []).filter((f) => !linkedIds.value.has(f.id)),
);

const newFactionId = ref("");
const adding = ref(false);

async function add() {
  if (!newFactionId.value) return;
  adding.value = true;
  try {
    await addMut.mutateAsync({ faction_id: newFactionId.value, deity_id: props.deityId });
    newFactionId.value = "";
  } finally {
    adding.value = false;
  }
}

async function remove(e: DeityFactionEntry) {
  await removeMut.mutateAsync({ id: e.id, faction_id: e.faction_id, deity_id: e.deity_id });
}
</script>
