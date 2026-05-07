<template>
  <div class="flex flex-col gap-3">
    <h2 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">Player Members</h2>

    <!-- Active members -->
    <div v-if="activeMembers.length" class="flex flex-col gap-1.5">
      <div
        v-for="m in activeMembers"
        :key="m.id"
        class="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="h-8 w-8 shrink-0 rounded-full border border-border bg-muted overflow-hidden">
          <img v-if="m.party_member.portrait_url" :src="m.party_member.portrait_url" alt="" class="w-full h-full object-cover" />
          <div v-else class="w-full h-full flex items-center justify-center">
            <IconSword class="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        </div>

        <div class="flex-1 min-w-0">
          <span class="font-cinzel text-xs font-semibold text-foreground truncate block">
            {{ m.party_member.name }}
          </span>
          <p v-if="speciesNameMap.get(m.party_member.species_id ?? '') || memberClassLabel(m.party_member.id, m.party_member.class)" class="font-fell text-[11px] text-muted-foreground italic truncate">
            {{ [speciesNameMap.get(m.party_member.species_id ?? ''), memberClassLabel(m.party_member.id, m.party_member.class), memberLevelDisplay(m.party_member.id, m.party_member.level) ? `Lv${memberLevelDisplay(m.party_member.id, m.party_member.level)}` : ''].filter(Boolean).join(' · ') }}
          </p>
        </div>

        <select
          :value="m.role ?? 'Member'"
          class="bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
          @change="updateRole(m, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>

        <select
          :value="m.status ?? 'Active'"
          class="bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
          :style="{ color: NPC_FACTION_STATUS_COLORS[m.status as NpcFactionStatus] ?? NPC_FACTION_STATUS_COLORS.Active }"
          @change="updateStatus(m, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in NPC_FACTION_STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>

        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-base leading-none" @click="removeMember(m)">×</button>
      </div>
    </div>

    <!-- Former members -->
    <div v-if="formerMembers.length">
      <button
        type="button"
        class="flex items-center gap-1.5 font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground transition-colors mb-1.5"
        @click="showFormer = !showFormer"
      >
        <IconChevronDown class="h-3 w-3 transition-transform" :class="showFormer && 'rotate-180'" />
        Former Members ({{ formerMembers.length }})
      </button>

      <div v-if="showFormer" class="flex flex-col gap-1.5">
        <div
          v-for="m in formerMembers"
          :key="m.id"
          class="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 opacity-70"
        >
          <div class="h-8 w-8 shrink-0 rounded-full border border-border bg-muted overflow-hidden">
            <img v-if="m.party_member.portrait_url" :src="m.party_member.portrait_url" alt="" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <IconSword class="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <span class="font-cinzel text-xs font-semibold text-foreground truncate block">{{ m.party_member.name }}</span>
            <p v-if="speciesNameMap.get(m.party_member.species_id ?? '') || m.party_member.class" class="font-fell text-[11px] text-muted-foreground italic truncate">
              {{ [speciesNameMap.get(m.party_member.species_id ?? ''), m.party_member.class].filter(Boolean).join(' · ') }}
            </p>
          </div>

          <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ m.role ?? 'Member' }}</span>

          <select
            :value="m.status"
            class="bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
            :style="{ color: NPC_FACTION_STATUS_COLORS[m.status as NpcFactionStatus] ?? NPC_FACTION_STATUS_COLORS.Active }"
            @change="updateStatus(m, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="s in NPC_FACTION_STATUSES" :key="s" :value="s">{{ s }}</option>
          </select>

          <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-base leading-none" @click="removeMember(m)">×</button>
        </div>
      </div>
    </div>

    <p v-if="!activeMembers.length && !formerMembers.length" class="font-fell text-xs text-muted-foreground italic">No player members yet.</p>

    <!-- Add member -->
    <div class="flex items-center gap-2">
      <EntityCombobox
        v-model="newMemberId"
        :options="availableMembers"
        placeholder="Add party member…"
      />
      <button
        type="button"
        :disabled="!newMemberId || adding"
        class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="addMember"
      >
        <IconAdd class="h-3 w-3" />
        Add
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconChevronDown, IconSword } from '@/lib/icons';
import {
  useFactionPartyMembers,
  useAddFactionPartyMember,
  useUpdateFactionPartyMemberRole,
  useUpdateFactionPartyMemberStatus,
  useRemoveFactionPartyMember,
  type FactionPartyMemberWithMember,
} from "@/composables/useFactions";
import { useParty } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useAllCampaignCharacterClasses } from "@/composables/useCharacterClasses";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { NPC_FACTION_ROLES, NPC_FACTION_STATUSES, NPC_FACTION_STATUS_COLORS, type NpcFactionStatus } from "@/types/faction.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ factionId: string }>();

const { data: members }     = useFactionPartyMembers(props.factionId);
const { data: allMembers }  = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: allCharacterClasses } = useAllCampaignCharacterClasses();
const classesByMember = computed(() => {
  const m = new Map<string, CharacterClass[]>();
  for (const cc of allCharacterClasses.value ?? []) {
    const list = m.get(cc.party_member_id) ?? [];
    list.push(cc);
    m.set(cc.party_member_id, list);
  }
  return m;
});
function memberClassLabel(memberId: string, legacyClass: string | null): string {
  const list = classesByMember.value.get(memberId) ?? [];
  if (list.length > 1) return formatMulticlassLabel(list);
  if (list.length === 1) return list[0].class_name;
  return legacyClass ?? "";
}
function memberLevelDisplay(memberId: string, legacyLevel: number): number {
  const list = classesByMember.value.get(memberId) ?? [];
  return list.length > 0 ? totalLevel(list) : legacyLevel;
}
const addMut          = useAddFactionPartyMember();
const updateRoleMut   = useUpdateFactionPartyMemberRole();
const updateStatusMut = useUpdateFactionPartyMemberStatus();
const removeMut       = useRemoveFactionPartyMember();

const activeMembers = computed(() => (members.value ?? []).filter((m) => !m.status || m.status === "Active"));
const formerMembers = computed(() => (members.value ?? []).filter((m) => m.status && m.status !== "Active"));

const memberIds = computed(() => new Set((members.value ?? []).map((m) => m.party_member_id)));
const availableMembers = computed(() =>
  (allMembers.value ?? []).filter((m) => !memberIds.value.has(m.id)),
);

const newMemberId = ref("");
const adding      = ref(false);
const showFormer  = ref(false);

async function addMember() {
  if (!newMemberId.value) return;
  adding.value = true;
  try {
    await addMut.mutateAsync({ faction_id: props.factionId, party_member_id: newMemberId.value, role: "Member" });
    newMemberId.value = "";
  } finally {
    adding.value = false;
  }
}

async function updateRole(m: FactionPartyMemberWithMember, role: string) {
  await updateRoleMut.mutateAsync({ id: m.id, role, faction_id: m.faction_id, party_member_id: m.party_member_id });
}

async function updateStatus(m: FactionPartyMemberWithMember, status: string) {
  await updateStatusMut.mutateAsync({ id: m.id, status, faction_id: m.faction_id, party_member_id: m.party_member_id });
}

async function removeMember(m: FactionPartyMemberWithMember) {
  await removeMut.mutateAsync({ id: m.id, faction_id: m.faction_id, party_member_id: m.party_member_id });
}
</script>
