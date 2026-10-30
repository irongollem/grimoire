<template>
  <!-- Desktop: fixed-column grid with a shared header row -->
  <template v-if="!isMobile">
    <div class="combatant-header">
      <span></span>
      <span>INIT</span>
      <span>NAME</span>
      <span>HP</span>
      <span>AC</span>
      <span>CONDITIONS</span>
    </div>
    <template v-for="combatant in store.sortedCombatants" :key="combatant.instance_id">
      <RunnerCombatantRow :combatant="combatant" :selected-id="selectedId" @select="emit('select', $event)" />
      <RunnerFallenOffer
        v-if="offered(combatant)"
        :combatant="combatant"
        @dismiss="dismissed.add(combatant.instance_id)"
        @mark="markFor(combatant)"
      />
    </template>
  </template>

  <!-- Mobile: stacked card per combatant -->
  <template v-else>
    <template v-for="combatant in store.sortedCombatants" :key="combatant.instance_id">
      <RunnerCombatantCard :combatant="combatant" :data-row-id="combatant.instance_id" @open="openSheet" />
      <RunnerFallenOffer
        v-if="offered(combatant)"
        :combatant="combatant"
        @dismiss="dismissed.add(combatant.instance_id)"
        @mark="markFor(combatant)"
      />
    </template>
  </template>

  <p v-if="!store.sortedCombatants.length" class="empty-runner">
    No combatants. Go back to the builder to add monsters and party members.
  </p>

  <RunnerCombatantSheet
    v-if="isMobile && sheetCombatant"
    v-model:open="sheetOpen"
    :combatant="sheetCombatant"
    @open-detail="emit('select', $event)"
  />

  <SetDownDialog :open="marking !== null" mode="fallen" :member="marking" @close="marking = null" />
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useCampaignMemorials } from "@/composables/memorials/useMemorials";
import { useParty } from "@/composables/party/useParty";
import SetDownDialog from "@/components/memorials/SetDownDialog.vue";
import RunnerFallenOffer from "@/components/encounters/RunnerFallenOffer.vue";
import type { RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useIsMobile } from "@/composables/useBreakpoint";
import RunnerCombatantRow from "@/components/encounters/RunnerCombatantRow.vue";
import RunnerCombatantCard from "@/components/encounters/RunnerCombatantCard.vue";
import RunnerCombatantSheet from "@/components/encounters/RunnerCombatantSheet.vue";
import { prefersReducedMotion } from "@/lib/motion";

defineProps<{ selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string | null] }>();

const isMobile = useIsMobile();
const store = useEncounterRunStore();
const { data: party } = useParty();
const { data: memorials } = useCampaignMemorials();

/** "Not yet" lasts for this run: the offer is not remembered anywhere else. */
const dismissed = reactive(new Set<string>());
const marking = ref<PartyMember | null>(null);

// Phone: the sheet follows the combatant by id and reads it live, so it closes
// itself if the combatant leaves the fight.
const sheetId = ref<string | null>(null);
const sheetCombatant = computed(() =>
  sheetId.value ? (store.sortedCombatants.find((c) => c.instance_id === sheetId.value) ?? null) : null,
);
// Closing keeps the id so the sheet can play its leave transition.
const sheetOpen = ref(false);
function openSheet(id: string) {
  sheetId.value = id;
  sheetOpen.value = true;
}

// The turn moves down the list; keep the active row on screen.
watch(
  () => store.activeCombatant?.instance_id,
  async (id) => {
    if (!isMobile.value || !store.started || !id) return;
    await nextTick();
    const row = document.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView?.({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  },
);

function memberOf(c: RunCombatant): PartyMember | null {
  const id = c.party_member_id;
  if (c.type !== "player" || !id || !party.value) return null;
  return party.value.find((m) => m.id === id) ?? null;
}

/** Three failed saves on a party member with no memorial in effect, not waved off yet. */
function offered(c: RunCombatant): boolean {
  if (c.death_saves.failures < 3 || dismissed.has(c.instance_id) || !memorials.value) return false;
  const member = memberOf(c);
  if (!member) return false;
  return !memorials.value.some((m) => m.party_member_id === member.id && m.restored_at === null);
}

function markFor(c: RunCombatant) {
  marking.value = memberOf(c);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.combatant-header {
  display: grid;
  grid-template-columns: 2.5rem 4.75rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pr-3 py-1.5 text-label text-muted-foreground border-b border-border bg-muted/30 items-center;
}

.combatant-header span:nth-child(2),
.combatant-header span:nth-child(4),
.combatant-header span:nth-child(5) {
  @apply text-center;
}

/* Matches the rows' narrow layout (RunnerCombatantRow): no conditions column. */
@container runner-list (max-width: 44rem) {
  .combatant-header {
    grid-template-columns: 2.5rem 4.75rem minmax(0, 1fr) 10rem 3rem;
  }
  .combatant-header span:nth-child(6) {
    display: none;
  }
}

.empty-runner {
  @apply text-center text-body text-muted-foreground italic py-16;
}
</style>
