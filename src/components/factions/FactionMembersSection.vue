<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-label-lg font-semibold text-muted-foreground uppercase">Members</h2>

    <!-- Active members -->
    <div v-if="activeMembers.length" class="flex flex-col gap-1.5">
      <FactionMemberRow
        v-for="m in activeMembers"
        :key="m.id"
        :portrait-url="m.npc.portrait_url"
        :portrait-focal-point="m.npc.portrait_focal_point"
        :fallback-icon="IconUser"
        :role="m.role ?? null"
        :status="m.status ?? null"
        @update:role="updateRole(m, $event)"
        @update:status="updateStatus(m, $event)"
        @remove="removeMember(m)"
      >
        <template #name>
          <RouterLink :to="`/npcs/${m.npc.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors truncate block">
            {{ m.npc.name }}
          </RouterLink>
        </template>
        <template #subtitle>
          <p v-if="m.npc.occupation || m.npc.race" class="text-caption text-muted-foreground italic truncate">
            {{ [m.npc.race, m.npc.occupation].filter(Boolean).join(" · ") }}
          </p>
        </template>
      </FactionMemberRow>
    </div>

    <!-- Former members -->
    <div v-if="formerMembers.length">
      <AppButton
        variant="ghost"
        size="inline-xs"
        class="uppercase mb-1.5"
        @click="showFormer = !showFormer"
      >
        <template #icon>
          <IconChevronDown class="h-3 w-3 transition-transform" :class="showFormer && 'rotate-180'" />
        </template>
        Former Members ({{ formerMembers.length }})
      </AppButton>

      <div v-if="showFormer" class="flex flex-col gap-1.5">
        <FactionMemberRow
          v-for="m in formerMembers"
          :key="m.id"
          former
          readonly-role
          :portrait-url="m.npc.portrait_url"
          :portrait-focal-point="m.npc.portrait_focal_point"
          :fallback-icon="IconUser"
          :role="m.role ?? null"
          :status="m.status ?? null"
          @update:status="updateStatus(m, $event)"
          @remove="removeMember(m)"
        >
          <template #name>
            <RouterLink :to="`/npcs/${m.npc.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors truncate block">
              {{ m.npc.name }}
            </RouterLink>
          </template>
          <template #subtitle>
            <p v-if="m.npc.occupation || m.npc.race" class="text-caption text-muted-foreground italic truncate">
              {{ [m.npc.race, m.npc.occupation].filter(Boolean).join(" · ") }}
            </p>
          </template>
        </FactionMemberRow>
      </div>
    </div>

    <p v-if="!activeMembers.length && !formerMembers.length" class="text-caption text-muted-foreground italic">No members yet.</p>

    <!-- Add member -->
    <div class="flex items-center gap-2">
      <EntityCombobox
        v-model="newNpcId"
        :options="availableNpcs"
        placeholder="Add NPC…"
      />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Add"
        class="shrink-0"
        :disabled="!newNpcId || adding"
        @click="addMember"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconChevronDown, IconUser } from '@/lib/icons';
import {
  useFactionNpcs,
  useAddFactionNpc,
  useUpdateFactionNpcRole,
  useUpdateFactionNpcStatus,
  useRemoveFactionNpc,
  type FactionNpcWithNpc,
} from "@/composables/useFactions";
import { useNpcs } from "@/composables/useNpcs";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import FactionMemberRow from "@/components/factions/FactionMemberRow.vue";
import AppButton from "@/components/common/AppButton.vue";

const props = defineProps<{ factionId: string }>();

const { data: members }  = useFactionNpcs(props.factionId);
const { data: allNpcs }  = useNpcs();
const addMut       = useAddFactionNpc();
const updateRoleMut   = useUpdateFactionNpcRole();
const updateStatusMut = useUpdateFactionNpcStatus();
const removeMut    = useRemoveFactionNpc();

const activeMembers = computed(() => (members.value ?? []).filter((m) => !m.status || m.status === "Active"));
const formerMembers = computed(() => (members.value ?? []).filter((m) => m.status && m.status !== "Active"));

const memberNpcIds = computed(() => new Set((members.value ?? []).map((m) => m.npc_id)));
const availableNpcs = computed(() =>
  (allNpcs.value ?? []).filter((n) => !memberNpcIds.value.has(n.id)),
);

const newNpcId  = ref("");
const adding    = ref(false);
const showFormer = ref(false);

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
  await updateRoleMut.mutateAsync({ id: m.id, role, faction_id: m.faction_id, npc_id: m.npc_id });
}

async function updateStatus(m: FactionNpcWithNpc, status: string) {
  await updateStatusMut.mutateAsync({ id: m.id, status, faction_id: m.faction_id, npc_id: m.npc_id });
}

async function removeMember(m: FactionNpcWithNpc) {
  await removeMut.mutateAsync({ id: m.id, faction_id: m.faction_id, npc_id: m.npc_id });
}
</script>
