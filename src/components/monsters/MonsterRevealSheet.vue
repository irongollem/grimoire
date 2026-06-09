<template>
  <!--
    Mobile-only (<md) reveal bottom-sheet for a monster detail screen.
    Mirrors the share-popover logic in MonsterList.vue / MonsterDetailView.vue,
    wired through useMonsterVisibility (the discovery model — not the NPC
    field-list model). Monsters reveal name/art/CR by default and gate the full
    stat block behind a per-discovery "reveal stats" toggle.

      - "Whole party" row toggles every party member at once
      - one row per party member toggles that member
      - "Stats visible / hidden" toggle (only once shared)
      - "Done" footer button closes the sheet
  -->
  <MobileSheet v-model:open="open" title="Reveal to players">
    <div class="flex flex-col gap-1 pb-2">
      <!-- Whole party -->
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left font-fell text-sm transition-colors"
        :class="wholePartyShared
          ? 'bg-primary/15 text-primary'
          : 'text-foreground active:bg-muted/50'"
        @click="onWholeParty"
      >
        <IconParty class="size-4 shrink-0" />
        Whole party
      </button>

      <!-- Per-player toggles -->
      <button
        v-for="member in party"
        :key="member.id"
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left font-fell text-sm transition-colors"
        :class="isMemberVisible(member.id)
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground active:bg-muted/50'"
        @click="toggleMember(member.id)"
      >
        <component
          :is="isMemberVisible(member.id) ? IconReveal : IconHide"
          class="size-4 shrink-0"
        />
        {{ member.name }}
      </button>

      <p v-if="!party?.length" class="px-3 py-3 font-fell text-sm italic text-muted-foreground">
        No party members to share with yet.
      </p>

      <!-- Stat-block reveal toggle (only meaningful once shared) -->
      <div class="mt-2 border-t border-border pt-3">
        <p class="px-1 pb-2 font-cinzel text-2xs font-bold uppercase tracking-widest text-muted-foreground">
          What players see
        </p>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-lg border px-3 py-3 text-left font-fell text-sm transition-colors"
          :class="[
            currentDiscovery?.reveal_stats ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-foreground',
            !currentDiscovery && 'pointer-events-none opacity-40',
          ]"
          @click="toggleStats"
        >
          <IconChart class="size-4 shrink-0" />
          {{ currentDiscovery?.reveal_stats ? "Full stat block" : "Name, art & CR only" }}
        </button>
        <p v-if="!currentDiscovery" class="px-1 pt-2 font-fell text-xs italic text-muted-foreground">
          Select at least one player to choose what they see.
        </p>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="w-full rounded-lg bg-primary px-4 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90"
        @click="open = false"
      >
        Done
      </button>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import { IconChart, IconHide, IconParty, IconReveal } from "@/lib/icons";
import { useMonsterVisibility } from "@/composables/useMonsterVisibility";
import type { Monster } from "@/types/monster.types";

const { monster } = defineProps<{ monster: Monster }>();
const open = defineModel<boolean>("open", { required: true });

const {
  party,
  currentDiscovery,
  allPartyIds,
  isMemberVisible,
  setWholeParty,
  toggleMember,
  unshare,
  updateStats,
} = useMonsterVisibility(toRef(() => monster));

const wholePartyShared = computed(
  () =>
    !!currentDiscovery.value &&
    allPartyIds.value.length > 0 &&
    allPartyIds.value.every((id) => isMemberVisible(id)),
);

// Tapping "Whole party" while already fully shared unshares everyone, matching
// the NPC reveal sheet's symmetric behaviour.
function onWholeParty() {
  if (wholePartyShared.value) unshare();
  else setWholeParty();
}

function toggleStats() {
  const d = currentDiscovery.value;
  if (!d) return;
  updateStats({ id: d.id, revealStats: !d.reveal_stats });
}
</script>
