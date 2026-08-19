<template>
  <div class="flex flex-col gap-2">
    <div v-if="entries?.length" class="flex flex-wrap gap-1.5">
      <div
        v-for="e in entries"
        :key="e.id"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1"
        :class="e.status && e.status !== 'Active' && 'opacity-60'"
      >
        <div v-if="e.faction.emblem_url" class="h-4 w-4 shrink-0">
          <FocalImage :src="e.faction.emblem_url" alt="" format="token" class="w-full h-full" />
        </div>
        <RouterLink :to="`/factions/${e.faction.id}`" class="font-cinzel text-2xs font-semibold text-foreground hover:text-primary transition-colors">
          {{ e.faction.name }}
        </RouterLink>
        <AppSelect
          :model-value="e.role ?? 'Member'"
          tone="bare"
          size="caption"
          weight="normal"
          class="cursor-pointer"
          @update:model-value="updateRole(e, $event)"
        >
          <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">{{ r }}</option>
        </AppSelect>
        <!-- Status badge — shown when not Active -->
        <span
          v-if="e.status && e.status !== 'Active'"
          class="font-cinzel text-2xs font-semibold italic"
          :style="{ color: NPC_FACTION_STATUS_COLORS[e.status as NpcFactionStatus] }"
        >{{ e.status }}</span>
        <AppButton variant="ghost" tone="danger" size="inline-xs" class="shrink-0" label="×" @click="remove(e)" />
      </div>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">No faction memberships yet.</p>

    <div class="flex items-center gap-2 mt-1">
      <EntityCombobox v-model="newFactionId" :options="availableFactions" placeholder="Add faction…" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Add"
        class="shrink-0"
        :disabled="!newFactionId || adding"
        @click="add"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd } from '@/lib/icons';
import {
  useNpcFactions,
  useAllFactions,
  useAddFactionNpc,
  useUpdateFactionNpcRole,
  useRemoveFactionNpc,
} from "@/composables/useFactions";
import { NPC_FACTION_ROLES, NPC_FACTION_STATUS_COLORS, type NpcFactionStatus } from "@/types/faction.types";
import type { FactionNpc, Faction } from "@/types/faction.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AppButton from "@/components/common/AppButton.vue";
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
