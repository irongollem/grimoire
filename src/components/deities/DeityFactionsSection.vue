<template>
  <div class="flex flex-col gap-2">
    <div v-if="entries?.length" class="flex flex-wrap gap-1.5">
      <div
        v-for="e in entries"
        :key="e.id"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1"
      >
        <div v-if="e.faction.emblem_url" class="h-4 w-4 shrink-0">
          <FocalImage :src="e.faction.emblem_url" alt="" format="token" class="w-full h-full" />
        </div>
        <IconShield v-else class="h-3 w-3 text-muted-foreground shrink-0" />
        <RouterLink
          :to="`/factions/${e.faction.id}`"
          class="font-cinzel text-2xs font-semibold text-foreground hover:text-primary transition-colors"
        >{{ e.faction.name }}</RouterLink>
        <span v-if="e.faction.faction_type" class="font-fell text-2xs text-muted-foreground italic">{{ e.faction.faction_type }}</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive transition-colors text-sm leading-none shrink-0"
          @click="remove(e)"
        >×</button>
      </div>
    </div>
    <p v-else class="font-fell text-xs text-muted-foreground italic">No factions worship this deity.</p>

    <div class="flex items-center gap-2 mt-1">
      <EntityCombobox v-model="newFactionId" :options="availableFactions" placeholder="Add faction…" />
      <button
        type="button"
        :disabled="!newFactionId || adding"
        class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="add"
      >
        <IconAdd class="h-3 w-3" />
        Add
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconAdd, IconShield } from '@/lib/icons';
import {
  useDeityFactions,
  useAddFactionDeity,
  useRemoveFactionDeity,
} from "@/composables/useFactions";
import { useAllFactions } from "@/composables/useFactions";
import type { FactionDeity } from "@/types/faction.types";
import type { Faction } from "@/types/faction.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
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
