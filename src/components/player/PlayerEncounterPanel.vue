<template>
  <div class="flex flex-col h-full" :class="{ shake: isShaking }">
    <!-- Panel header -->
    <div class="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
      <div class="flex items-center gap-2">
        <span v-if="liveState" class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <IconEncounter v-else class="h-3.5 w-3.5 text-muted-foreground/40" />
        <span class="font-cinzel text-xs font-bold text-foreground tracking-wider">ENCOUNTER</span>
      </div>
      <button
        class="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Close encounter panel"
        @click="$emit('close')"
      >
        <IconClose class="h-4 w-4" />
      </button>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-3 space-y-3">

        <!-- No encounter in progress -->
        <div v-if="!liveState" class="text-center py-12 space-y-3">
          <IconEncounter class="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p class="font-cinzel text-sm text-muted-foreground">No encounter in progress.</p>
          <p class="font-fell text-xs text-muted-foreground italic">Your DM will start a live encounter when combat begins.</p>
        </div>

        <template v-else>
          <!-- View battle map (tablet+ only) — phones stay on the stats panel -->
          <RouterLink
            v-if="canShowBattleMap"
            to="/play/encounter/map"
            class="battle-map-cta hidden md:flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 hover:bg-primary/10 transition-colors"
          >
            <IconMap class="h-4 w-4 text-primary shrink-0" />
            <span class="font-cinzel text-xs font-semibold text-primary tracking-wider">View battle map</span>
          </RouterLink>

          <!-- Your Turn! banner -->
          <div
            v-if="isMyTurn && !isInLobby"
            class="flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-3 animate-pulse"
          >
            <IconEncounter class="h-4 w-4 text-primary shrink-0" />
            <span class="font-cinzel text-sm font-bold text-primary tracking-wider">YOUR TURN!</span>
            <IconEncounter class="h-4 w-4 text-primary shrink-0" />
          </div>

          <!-- Lobby header -->
          <div
            v-if="isInLobby"
            class="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
          >
            <IconEncounter class="h-4 w-4 text-amber-500/60 shrink-0" />
            <span class="font-cinzel text-sm font-semibold text-amber-500/80 tracking-wider">Gathering Party…</span>
            <span class="font-fell text-xs text-muted-foreground italic ml-auto">DM is preparing</span>
          </div>

          <!-- Round + active turn header (full / compact variants, CSS picks which) -->
          <template v-else>
            <div class="round-header-full flex items-center justify-center flex-wrap gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <div class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">ROUND</div>
              <div class="font-cinzel text-2xl font-bold text-primary">{{ liveState.current_round }}</div>
              <div v-if="activeCombatant" class="ml-4 flex items-center gap-2 min-w-0">
                <span class="font-cinzel text-xs text-muted-foreground tracking-wider shrink-0">ACTIVE:</span>
                <span class="font-cinzel text-sm font-bold text-foreground wrap-break-word min-w-0">
                  {{
                    activeCombatant.type === "monster" &&
                    (activeCombatant.reveal_state ?? "hidden") === "hidden"
                      ? "???"
                      : activeCombatant.name
                  }}
                </span>
              </div>
            </div>

            <div class="round-header-compact rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 flex items-center gap-1.5 min-w-0">
              <span class="font-cinzel text-sm font-bold text-primary shrink-0">{{ liveState.current_round }}:</span>
              <span class="font-cinzel text-xs font-semibold text-foreground truncate">
                {{
                  activeCombatant
                    ? (activeCombatant.type === "monster" && (activeCombatant.reveal_state ?? "hidden") === "hidden"
                        ? "???"
                        : activeCombatant.name)
                    : "—"
                }}
              </span>
            </div>
          </template>

          <!-- Your initiative — players roll their own each encounter (#504) -->
          <div
            v-if="myPlayer && showMyInitiative"
            class="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3"
          >
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
              YOUR INITIATIVE
            </span>
            <button
              v-if="myInitiative === null"
              type="button"
              class="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-cinzel text-sm font-bold text-primary tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50"
              :disabled="rollingInitiative"
              @click="rollMyInitiative"
            >
              <IconDice class="h-4 w-4" />
              {{ rollingInitiative ? "Rolling…" : `Roll d20 ${dexModLabel}` }}
            </button>
            <span v-else class="font-cinzel text-2xl font-bold text-primary">{{ myInitiative }}</span>
          </div>

          <!-- Player-visible narrative events — fired events with is_player_visible=true -->
          <template v-if="playerVisibleFiredEvents.length > 0 && !isInLobby">
            <div
              v-for="event in playerVisibleFiredEvents"
              :key="event.id"
              class="flex gap-2.5 items-start rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5"
            >
              <IconScrollText class="h-3.5 w-3.5 text-amber-500/60 shrink-0 mt-0.5" />
              <div class="min-w-0">
                <p v-if="getEventMessage(event)" class="font-fell text-sm text-foreground/90 italic leading-snug">
                  {{ getEventMessage(event) }}
                </p>
                <p
                  class="font-cinzel text-2xs text-amber-500/70 tracking-wider uppercase"
                  :class="getEventMessage(event) ? 'mt-1' : 'text-sm text-foreground'"
                >
                  {{ event.name }}
                </p>
              </div>
            </div>
          </template>

          <!-- Combatant list -->
          <EncounterCombatantList
            :visible-combatants="visibleCombatants"
            :active-instance-id="activeCombatant?.instance_id ?? null"
            :is-in-lobby="isInLobby"
            :health-vis="healthVis"
            :party-map="partyMap"
            @combatant-click="onCombatantClick"
          />
        </template>

      </div>
    </div>
  </div>

  <!-- Monster lightbox -->
  <EncounterMonsterLightbox :combatant="selectedMonsterCombatant" @close="selectedMonsterCombatant = null" />

  <!-- NPC lightbox -->
  <EncounterNpcLightbox :npc="selectedNpc" @close="selectedNpc = null" />

  <!-- Party member / companion lightbox -->
  <PartyMemberLightbox :member="selectedMember" @close="selectedMemberCombatant = null" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconClose, IconDice, IconEncounter, IconMap, IconScrollText } from '@/lib/icons';
import { useEncounter } from "@/composables/useEncounters";
import { usePlayerVisibleLocation } from "@/composables/useLocations";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { liveState } from "@/composables/useEncounterLive";
import { sortCombatantsByInitiative } from "@/lib/combatantSort";
import type { RunCombatant, HealthVisibility, EncounterEvent, EventAction } from "@/types/encounter.types";
import type { Npc } from "@/types/npc.types";
import { usePlayerCombatPrefs } from "@/composables/usePlayerCombatPrefs";
import { useTurnChime } from "@/composables/useTurnChime";
import { useScreenShake } from "@/composables/useScreenShake";
import { useNpcs } from "@/composables/useNpcs";
import { useParty } from "@/composables/useParty";
import PartyMemberLightbox from "@/components/player/PartyMemberLightbox.vue";
import EncounterCombatantList from "@/components/player/EncounterCombatantList.vue";
import EncounterNpcLightbox from "@/components/player/EncounterNpcLightbox.vue";
import EncounterMonsterLightbox from "@/components/player/EncounterMonsterLightbox.vue";

defineEmits<{ close: [] }>();

const campaign = useCampaignStore();
const auth = useAuthStore();

// Battle map availability
const battleEncounterIdRef = computed(() => liveState.value?.encounter_id ?? "");
const { data: battleEncounter } = useEncounter(battleEncounterIdRef);
const battleLocationIdRef = computed(() => battleEncounter.value?.location_id ?? "");
const { data: battleLocation } = usePlayerVisibleLocation(battleLocationIdRef);
const canShowBattleMap = computed(
  () =>
    !!liveState.value &&
    !!battleLocation.value?.is_battle_map &&
    !!battleLocation.value?.map_url &&
    !!battleLocation.value?.grid_calibration,
);
// Player-visible pre-scripted events — shown as narrative beats in the combat panel
const playerVisibleFiredEvents = computed<EncounterEvent[]>(() => {
  const fired = new Set(liveState.value?.events_fired ?? []);
  const encounterEvents = battleEncounter.value?.events ?? [];
  return encounterEvents.filter((e) => e.is_player_visible && fired.has(e.id));
});

function getEventMessage(event: EncounterEvent): string | null {
  const action = event.actions.find(
    (a): a is Extract<EventAction, { type: "broadcast_message" }> =>
      a.type === "broadcast_message",
  );
  return action?.message ?? null;
}

const { turnAudioEnabled } = usePlayerCombatPrefs();
const { playTurnChime } = useTurnChime();
const { isShaking, triggerShake } = useScreenShake();

const healthVis = computed<HealthVisibility>(
  () => (campaign.activeCampaign?.health_visibility as HealthVisibility) ?? "strategic",
);

const sortedCombatants = computed(() =>
  liveState.value ? sortCombatantsByInitiative(liveState.value.combatants_live) : [],
);

const visibleCombatants = computed(() =>
  sortedCombatants.value.filter(
    (c) => c.type === "player" || (c.reveal_state ?? "hidden") !== "hidden",
  ),
);

const activeCombatant = computed(
  () => sortedCombatants.value[liveState.value?.active_combatant_index ?? 0] ?? null,
);

const myMemberId = computed(() => auth.linkedPartyMemberId);

const myPlayer = computed(
  () => sortedCombatants.value.find((c) => c.party_member_id === myMemberId.value) ?? null,
);

const isInLobby = computed(() => (liveState.value?.current_round ?? 1) === 0);

// ── Player-rolled initiative (#504) ─────────────────────────────────────────────
// The player rolls their own d20 + DEX. We write the total to their party_members
// row (RLS lets a player update their own character); the DM's runner ingests the
// change live and pushes it into the shared encounter state, which loops back here.
const { promptRoll } = usePromptedRoll();
const { mutateAsync: updateMyMember } = useUpdatePartyMember();
const rollingInitiative = ref(false);
// Local echo so the player sees their result instantly, before the DM's runner
// round-trips it back into the live combatant list.
const myRolledInitiative = ref<number | null>(null);

const myInitiative = computed<number | null>(
  () => myPlayer.value?.initiative ?? myRolledInitiative.value,
);
// Show the chip while gathering (lobby) or whenever this player still has no
// initiative — i.e. exactly the "prefilled + disabled" case players complained
// about is now a live Roll button instead.
const showMyInitiative = computed(() => isInLobby.value || myInitiative.value === null);
const dexModLabel = computed(() => {
  const m = myPlayer.value?.dex_mod ?? 0;
  return m >= 0 ? `+${m}` : `${m}`;
});

// A new encounter clears the local echo so a stale value can't linger.
watch(() => liveState.value?.encounter_id, () => { myRolledInitiative.value = null; });

async function rollMyInitiative() {
  const member = myPlayer.value;
  if (!member?.party_member_id || rollingInitiative.value) return;
  rollingInitiative.value = true;
  try {
    const result = await promptRoll({
      counts: { 20: 1 },
      // Initiative = DEX mod + the member's initiative_bonus (feat/special extra).
      modifier: member.dex_mod + (partyMap.value.get(member.party_member_id ?? "")?.initiative_bonus ?? 0),
      label: "Initiative",
    });
    if (!result) return; // physical-dice prompt cancelled
    myRolledInitiative.value = result.total;
    await updateMyMember({
      id: member.party_member_id,
      update: { current_initiative: result.total },
    });
  } finally {
    rollingInitiative.value = false;
  }
}

const isMyTurn = computed(() => {
  if (!myPlayer.value || !liveState.value || isInLobby.value) return false;
  const active = sortedCombatants.value[liveState.value.active_combatant_index];
  return active?.instance_id === myPlayer.value.instance_id;
});

watch(isMyTurn, (now, prev) => {
  if (now && !prev) {
    triggerShake();
    if (turnAudioEnabled.value) playTurnChime();
  }
});

// Portrait / HP helpers via party map (passed to EncounterCombatantList)
const { data: partyList } = useParty();
const partyMap = computed(() => new Map(partyList.value?.map((m) => [m.id, m]) ?? []));

// Party member / companion lightbox
const selectedMemberCombatant = ref<RunCombatant | null>(null);
const selectedMember = computed(() => {
  const c = selectedMemberCombatant.value;
  if (!c) return null;
  const id = c.party_member_id ?? c.companion_id;
  return partyList.value?.find((m) => m.id === id) ?? null;
});

// NPC lightbox
const { data: allNpcs } = useNpcs();
const selectedNpc = ref<Npc | null>(null);

// Monster lightbox
const selectedMonsterCombatant = ref<RunCombatant | null>(null);

function onCombatantClick(combatant: RunCombatant) {
  if (combatant.npc_id) {
    const npc = allNpcs.value?.find((n) => n.id === combatant.npc_id);
    if (npc) selectedNpc.value = npc;
    return;
  }
  if (combatant.type === "monster" && !combatant.npc_id && combatant.monster_id) {
    selectedMonsterCombatant.value = combatant;
    return;
  }
  if (combatant.party_member_id || combatant.companion_id) {
    selectedMemberCombatant.value = combatant;
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to    { opacity: 0; }

/* ── Compact mode: panel narrower than 200px ─────────────────────────────── */
.round-header-compact { display: none; }

@container (max-width: 200px) {
  .round-header-full    { display: none; }
  .round-header-compact { display: flex; }
}
</style>
