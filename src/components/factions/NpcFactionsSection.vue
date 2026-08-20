<template>
  <EntityLinkSection
    v-model="newFactionId"
    :entries="entries ?? []"
    :options="availableFactions"
    layout="chip"
    empty="No faction memberships yet."
    placeholder="Add faction…"
    :adding="adding"
    remove-label="faction membership"
    :entry-class="(e) => (e.status && e.status !== 'Active' ? 'opacity-60' : undefined)"
    @add="add"
    @remove="remove"
  >
    <template #entry="{ entry }">
      <div v-if="entry.faction.emblem_url" class="h-4 w-4 shrink-0">
        <FocalImage :src="entry.faction.emblem_url" alt="" format="token" class="w-full h-full" />
      </div>
      <RouterLink :to="`/factions/${entry.faction.id}`" class="font-cinzel text-2xs font-semibold text-foreground hover:text-primary transition-colors">
        {{ entry.faction.name }}
      </RouterLink>
      <AppSelect
        :model-value="entry.role ?? 'Member'"
        tone="bare"
        size="caption"
        weight="normal"
        class="cursor-pointer"
        @update:model-value="updateRole(entry, $event)"
      >
        <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">{{ r }}</option>
      </AppSelect>
      <!-- Status badge — shown when not Active -->
      <span
        v-if="entry.status && entry.status !== 'Active'"
        class="font-cinzel text-2xs font-semibold italic"
        :style="{ color: NPC_FACTION_STATUS_COLORS[entry.status as NpcFactionStatus] }"
      >{{ entry.status }}</span>
    </template>
  </EntityLinkSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  useNpcFactions,
  useAllFactions,
  useAddFactionNpc,
  useUpdateFactionNpcRole,
  useRemoveFactionNpc,
} from "@/composables/useFactions";
import { NPC_FACTION_ROLES, NPC_FACTION_STATUS_COLORS, type NpcFactionStatus } from "@/types/faction.types";
import type { FactionNpc, Faction } from "@/types/faction.types";
import EntityLinkSection from "@/components/common/EntityLinkSection.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AppSelect from "@/components/common/AppSelect.vue";

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
