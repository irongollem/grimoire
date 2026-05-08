<template>
  <div>
    <!-- Action bar -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
        @click="rollAllInitiative"
      >
        <IconDiceRoll class="h-3.5 w-3.5 text-primary" />
        Roll All Initiative
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        @click="clearInitiative"
      >
        <IconReset class="h-3.5 w-3.5" />
        Clear Initiative
      </button>
    </div>

    <!-- Loading / Empty -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!party?.length"
      title="No heroes in your party"
      description="Add your players' characters to track their HP, initiative, and passive skills."
    >
      <template #action>
        <RouterLink
          to="/play/character/create"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add first hero
        </RouterLink>
      </template>
    </EmptyState>

    <!-- Party cards -->
    <div v-else class="flex flex-col gap-3">
      <PartyTrackerRow
        v-for="member in sortedMembers"
        :key="member.id"
        :member="member"
        :species-name-map="speciesNameMap"
        :location-name-map="locationNameMap"
        :class-label="memberClassLabel(member.id, member.class)"
        :level-display="memberLevelDisplay(member.id, member.level)"
        :companions="companionsFor(member.id)"
        :dm-shared-journal="dmSharedEntriesFor(member.id)"
        :dm-player-name="dmPlayerNameFor(member.id)"
        @open-companion-form="handleOpenCompanionForm"
        @delete-companion="deleteCompanion"
      />
    </div>

    <!-- Unowned companions section -->
    <div v-if="unownedCompanions.length" class="mt-4 rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Unassigned Companions</span>
        <button
          type="button"
          class="font-cinzel text-[10px] text-primary hover:opacity-80 transition-opacity"
          @click="openCompanionForm(null)"
        >+ Add</button>
      </div>
      <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CompanionCard
          v-for="comp in unownedCompanions"
          :key="comp.id"
          :companion="comp"
          :source-name="companionSourceName(comp)"
          :source-link="companionSourceLink(comp)"
          @edit="openCompanionForm($event)"
          @delete="deleteCompanion($event)"
        />
      </div>
    </div>

    <PartyInventoryInline :party="party ?? []" />

    <!-- Companion form modal -->
    <CompanionForm
      v-if="companionFormOpen"
      :companion="editingCompanion ?? undefined"
      :party-members="party ?? []"
      @saved="companionFormOpen = false"
      @cancel="companionFormOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { ref, computed } from "vue";
import { IconDiceRoll, IconReset } from '@/lib/icons';
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useAllLocations } from "@/composables/useLocations";
import { useCompanions, useDeleteCompanion } from "@/composables/useCompanions";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useDmAllSharedJournalEntries } from "@/composables/usePlayerJournal";
import type { PlayerJournalEntry } from "@/composables/usePlayerJournal";
import { useAllSpecies } from "@/composables/useSpecies";
import { useAllCampaignCharacterClasses } from "@/composables/useCharacterClasses";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { useAllMonsters } from "@/composables/useMonsters";
import { useNpcs } from "@/composables/useNpcs";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import CompanionCard from "./CompanionCard.vue";
import CompanionForm from "./CompanionForm.vue";
import PartyTrackerRow from "./PartyTrackerRow.vue";
import PartyInventoryInline from "./PartyInventoryInline.vue";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";

const { data: party, isLoading } = useParty();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { data: allLocations } = useAllLocations();
const locationNameMap = computed(() => {
  const m = new Map<string, string>();
  for (const l of allLocations.value ?? []) m.set(l.id, l.name);
  return m;
});

const { data: allSpecies } = useAllSpecies();
const speciesNameMap = computed(() => {
  const m = new Map<string, string>();
  for (const s of allSpecies.value ?? []) m.set(s.id, s.name);
  return m;
});

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

const sortedMembers = computed(() => {
  const members = party.value ?? [];
  const allHaveInit = members.length > 0 && members.every((m) => m.current_initiative !== null);
  if (allHaveInit) {
    return [...members].sort((a, b) => (b.current_initiative ?? 0) - (a.current_initiative ?? 0));
  }
  return [...members].sort((a, b) => a.sort_order - b.sort_order);
});

const { promptRoll } = usePromptedRoll();

async function rollInitiative(member: PartyMember) {
  const r = await promptRoll({
    counts: { 20: 1 },
    modifier: member.initiative_bonus,
    label: `${member.name} Initiative`,
    silent: true,
  });
  if (r) await updateMember({ id: member.id, update: { current_initiative: r.total } });
}

async function rollAllInitiative() {
  for (const member of party.value ?? []) {
    await rollInitiative(member);
  }
}

async function clearInitiative() {
  await Promise.all(
    (party.value ?? []).map((member) =>
      updateMember({ id: member.id, update: { current_initiative: null } }),
    ),
  );
}

// DM journal access
const { data: campaignMembers } = useCampaignMembers();
const { data: dmSharedJournal } = useDmAllSharedJournalEntries();

const partyMemberUserIdMap = computed(() => {
  const m = new Map<string, string>(); // party_member_id → user_id
  for (const cm of campaignMembers.value ?? []) {
    if (cm.party_member_id) m.set(cm.party_member_id, cm.user_id);
  }
  return m;
});

const journalByUserId = computed(() => {
  const m = new Map<string, PlayerJournalEntry[]>();
  for (const entry of dmSharedJournal.value ?? []) {
    const list = m.get(entry.user_id) ?? [];
    list.push(entry);
    m.set(entry.user_id, list);
  }
  return m;
});

function dmSharedEntriesFor(memberId: string): PlayerJournalEntry[] {
  const userId = partyMemberUserIdMap.value.get(memberId);
  return userId ? (journalByUserId.value.get(userId) ?? []) : [];
}

function dmPlayerNameFor(memberId: string): string {
  const userId = partyMemberUserIdMap.value.get(memberId);
  if (!userId) return "";
  return (campaignMembers.value ?? []).find((cm) => cm.user_id === userId)?.display_name ?? "";
}

// Companions
const { data: companions } = useCompanions();
const { data: allMonsters } = useAllMonsters();
const { data: allNpcs } = useNpcs();
const { mutateAsync: deleteComp } = useDeleteCompanion();

const companionFormOpen = ref(false);
const editingCompanion = ref<Companion | null>(null);

function companionsFor(memberId: string): Companion[] {
  return (companions.value ?? []).filter((c) => c.owner_party_member_id === memberId);
}

const unownedCompanions = computed(() =>
  (companions.value ?? []).filter((c) => !c.owner_party_member_id),
);

function companionSourceName(c: Companion): string {
  if (c.source_type === "monster" && c.source_monster_id) {
    return (allMonsters.value ?? []).find((m) => m.id === c.source_monster_id)?.name ?? "";
  }
  if (c.source_type === "npc" && c.source_npc_id) {
    return (allNpcs.value ?? []).find((n) => n.id === c.source_npc_id)?.name ?? "";
  }
  return "";
}

function companionSourceLink(c: Companion): string {
  if (c.source_type === "monster" && c.source_monster_id) return `/bestiary/${c.source_monster_id}`;
  if (c.source_type === "npc" && c.source_npc_id) return `/npcs/${c.source_npc_id}`;
  return "";
}

function openCompanionForm(companion: Companion | null, ownerMemberId?: string) {
  editingCompanion.value = companion;
  companionFormOpen.value = true;
  void ownerMemberId;
}

function handleOpenCompanionForm({ companion, ownerId }: { companion: Companion | null; ownerId?: string }) {
  editingCompanion.value = companion;
  companionFormOpen.value = true;
  void ownerId;
}

async function deleteCompanion(companion: Companion) {
  if (!await confirm(`Remove "${companion.name || "this companion"}"?`)) return;
  await deleteComp(companion);
}

defineExpose({ openCompanionForm });
</script>
