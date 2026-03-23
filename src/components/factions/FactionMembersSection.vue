<template>
  <div class="flex flex-col gap-3">
    <h2 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">Members</h2>

    <div v-if="members?.length" class="flex flex-col gap-1.5">
      <div
        v-for="m in members"
        :key="m.id"
        class="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
      >
        <!-- Avatar -->
        <div class="h-8 w-8 shrink-0 rounded-full border border-border bg-muted overflow-hidden">
          <img v-if="m.npc.portrait_url" :src="m.npc.portrait_url" alt="" class="w-full h-full object-cover" />
          <div v-else class="w-full h-full flex items-center justify-center">
            <User class="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        </div>

        <div class="flex-1 min-w-0">
          <RouterLink :to="`/npcs/${m.npc.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors truncate block">
            {{ m.npc.name }}
          </RouterLink>
          <p v-if="m.npc.occupation || m.npc.race" class="font-fell text-[11px] text-muted-foreground italic truncate">
            {{ [m.npc.race, m.npc.occupation].filter(Boolean).join(" · ") }}
          </p>
        </div>

        <!-- Role -->
        <select
          :value="m.role ?? 'Member'"
          class="bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
          @change="updateRole(m, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>

        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-base leading-none" @click="removeMember(m)">×</button>
      </div>
    </div>

    <!-- Add member -->
    <div class="flex items-center gap-2">
      <EntityCombobox
        v-model="newNpcId"
        :options="availableNpcs"
        placeholder="Add NPC…"
      />
      <button
        type="button"
        :disabled="!newNpcId || adding"
        class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="addMember"
      >
        <Plus class="h-3 w-3" />
        Add
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, User } from "lucide-vue-next";
import {
  useFactionNpcs,
  useAddFactionNpc,
  useUpdateFactionNpcRole,
  useRemoveFactionNpc,
  type FactionNpcWithNpc,
} from "@/composables/useFactions";
import { useNpcs } from "@/composables/useNpcs";
import { NPC_FACTION_ROLES } from "@/types/faction.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ factionId: string }>();

const { data: members }  = useFactionNpcs(props.factionId);
const { data: allNpcs }  = useNpcs();
const addMut    = useAddFactionNpc();
const updateMut = useUpdateFactionNpcRole();
const removeMut = useRemoveFactionNpc();

const memberNpcIds = computed(() => new Set((members.value ?? []).map((m) => m.npc_id)));
const availableNpcs = computed(() =>
  (allNpcs.value ?? []).filter((n) => !memberNpcIds.value.has(n.id)),
);

const newNpcId = ref("");
const adding   = ref(false);

async function addMember() {
  if (!newNpcId.value) return;
  adding.value = true;
  try {
    await addMut.mutateAsync({ faction_id: props.factionId, npc_id: newNpcId.value, role: "Member" });
    newNpcId.value = "";
  } finally {
    adding.value = false;
  }
}

async function updateRole(m: FactionNpcWithNpc, role: string) {
  await updateMut.mutateAsync({ id: m.id, role, faction_id: m.faction_id, npc_id: m.npc_id });
}

async function removeMember(m: FactionNpcWithNpc) {
  await removeMut.mutateAsync({ id: m.id, faction_id: m.faction_id, npc_id: m.npc_id });
}
</script>
