<template>
  <div class="flex flex-col gap-2">
    <div v-if="entries?.length" class="flex flex-col gap-2">
      <ConnectionSlip
        v-for="entry in entries"
        :key="entry.id"
        :name="entry.faction.name"
        :image="entry.faction.emblem_url"
        image-format="token"
        :to="`/factions/${entry.faction.id}`"
        :tags="statusTags(entry)"
        :class="isActive(entry) ? undefined : 'opacity-60'"
      >
        <template #tags>
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
        </template>
        <template #actions>
          <OverflowMenu
            variant="ghost"
            :label="`More actions for ${entry.faction.name}`"
            :items="MENU"
            size="icon-sm"
            @select="remove(entry)"
          />
        </template>
      </ConnectionSlip>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">No faction memberships yet.</p>

    <div class="flex items-center gap-2">
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
import {
  useNpcFactions,
  useAllFactions,
  useAddFactionNpc,
  useUpdateFactionNpcRole,
  useRemoveFactionNpc,
} from "@/composables/factions/useFactions";
import { NPC_FACTION_ROLES, NPC_FACTION_STATUS_COLORS, type NpcFactionStatus } from "@/types/faction.types";
import type { FactionNpc, Faction } from "@/types/faction.types";
import ConnectionSlip, { type ConnectionTag } from "@/components/common/entity/ConnectionSlip.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { IconAdd } from "@/lib/icons";

const props = defineProps<{ npcId: string }>();

type NpcFactionEntry = FactionNpc & { faction: Pick<Faction, "id" | "name" | "faction_type" | "emblem_url"> };

const MENU: OverflowMenuEntry[] = [{ key: "remove", label: "Remove from faction", danger: true }];

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

function isActive(e: NpcFactionEntry): boolean {
  return !e.status || e.status === "Active";
}

/** A membership that is not Active says so, in the status's own colour. */
function statusTags(e: NpcFactionEntry): ConnectionTag[] {
  return isActive(e) ? [] : [{ label: e.status, color: NPC_FACTION_STATUS_COLORS[e.status as NpcFactionStatus] }];
}

async function updateRole(e: NpcFactionEntry, role: string) {
  await updateMut.mutateAsync({ id: e.id, role, faction_id: e.faction_id, npc_id: e.npc_id });
}

async function remove(e: NpcFactionEntry) {
  await removeMut.mutateAsync({ id: e.id, faction_id: e.faction_id, npc_id: e.npc_id });
}
</script>
