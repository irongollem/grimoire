<template>
  <div class="flex flex-col gap-2">
    <div v-if="entries?.length" class="flex flex-wrap gap-1.5">
      <div
        v-for="e in entries"
        :key="e.id"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1"
      >
        <img v-if="e.faction.emblem_url" :src="e.faction.emblem_url" alt="" class="h-4 w-4 rounded-full object-cover shrink-0" />
        <RouterLink :to="`/factions/${e.faction.id}`" class="font-cinzel text-[10px] font-semibold text-foreground hover:text-primary transition-colors">
          {{ e.faction.name }}
        </RouterLink>
        <select
          :value="e.role ?? 'Member'"
          class="bg-transparent border-none font-fell text-[10px] text-muted-foreground focus:outline-none cursor-pointer"
          @change="updateRole(e, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
        <button type="button" class="text-muted-foreground hover:text-destructive transition-colors text-sm leading-none shrink-0" @click="remove(e)">×</button>
      </div>
    </div>
    <p v-else class="font-fell text-xs text-muted-foreground italic">No faction memberships yet.</p>

    <div class="flex items-center gap-2 mt-1">
      <EntityCombobox v-model="newFactionId" :options="availableFactions" placeholder="Add faction…" />
      <button
        type="button"
        :disabled="!newFactionId || adding"
        class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="add"
      >
        <Plus class="h-3 w-3" />
        Add
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus } from "lucide-vue-next";
import {
  useNpcFactions,
  useAllFactions,
  useAddFactionNpc,
  useUpdateFactionNpcRole,
  useRemoveFactionNpc,
} from "@/composables/useFactions";
import { NPC_FACTION_ROLES } from "@/types/faction.types";
import type { FactionNpc } from "@/types/faction.types";
import type { Faction } from "@/types/faction.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ npcId: string }>();

type NpcFactionEntry = FactionNpc & { faction: Pick<Faction, "id" | "name" | "faction_type" | "emblem_url"> };

const { data: entries }    = useNpcFactions(props.npcId);
const { data: allFactions } = useAllFactions();
const addMut    = useAddFactionNpc();
const updateMut = useUpdateFactionNpcRole();
const removeMut = useRemoveFactionNpc();

const joinedIds = computed(() => new Set((entries.value ?? []).map((e) => e.faction_id)));
const availableFactions = computed(() =>
  (allFactions.value ?? []).filter((f) => !joinedIds.value.has(f.id)),
);

const newFactionId = ref("");
const adding       = ref(false);

async function add() {
  if (!newFactionId.value) return;
  adding.value = true;
  try {
    await addMut.mutateAsync({ faction_id: newFactionId.value, npc_id: props.npcId, role: "Member" });
    newFactionId.value = "";
  } finally {
    adding.value = false;
  }
}

async function updateRole(e: NpcFactionEntry, role: string) {
  await updateMut.mutateAsync({ id: e.id, role, faction_id: e.faction_id, npc_id: e.npc_id });
}

async function remove(e: NpcFactionEntry) {
  await removeMut.mutateAsync({ id: e.id, faction_id: e.faction_id, npc_id: e.npc_id });
}
</script>
