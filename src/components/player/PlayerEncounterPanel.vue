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
        <span class="text-label-lg font-bold text-foreground">ENCOUNTER</span>
      </div>
      <AppButton
        variant="ghost"
        size="icon-xs"
        icon-size="md"
        :icon="IconClose"
        tooltip="Close encounter panel"
        aria-label="Close encounter panel"
        @click="$emit('close')"
      />
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-3 space-y-3">

        <!-- No encounter in progress -->
        <div v-if="!liveState" class="text-center py-12 space-y-3">
          <IconEncounter class="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p class="font-cinzel text-sm text-muted-foreground">No encounter in progress.</p>
          <p class="text-caption text-muted-foreground italic">Your DM will start a live encounter when combat begins.</p>
        </div>

        <template v-else>
          <!-- View battle map (tablet+ only) — phones stay on the stats panel -->
          <AppButton
            v-if="canShowBattleMap"
            to="/play/encounter/map"
            variant="tinted"
            tone="primary"
            emphasis="soft"
            size="sm"
            class="hidden md:flex"
            :icon="IconMap"
            icon-size="md"
            label="View battle map"
          />

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
            <span class="text-caption text-muted-foreground italic ml-auto">DM is preparing</span>
          </div>

          <!-- Your companions — bench/unbench before the DM starts the encounter (#569).
               Writes combat_ready directly; the DM's runner reacts to the change live. -->
          <div
            v-if="isInLobby && myCompanions.length > 0"
            class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-2"
          >
            <span class="text-label-lg font-semibold text-amber-500/80 tracking-wider">YOUR COMPANIONS</span>
            <div
              v-for="companion in myCompanions"
              :key="companion.id"
              class="flex items-center gap-2.5"
            >
              <div class="shrink-0 w-8 h-8 rounded-full overflow-hidden border border-border bg-muted">
                <FocalImage
                  :src="companion.portrait_url"
                  format="token"
                  :focal-point="companion.portrait_focal_point ?? null"
                  placeholder="/assets/placeholders/companion.webp"
                />
              </div>
              <span class="min-w-0 flex-1 text-body text-foreground truncate">{{ companion.name }}</span>
              <AppButton
                variant="subtle"
                size="caption"
                shape="pill"
                surface="muted"
                fill="muted"
                :active="companionCombatReady(companion)"
                role="switch"
                :aria-checked="companionCombatReady(companion)"
                :label="companionCombatReady(companion) ? 'Joining' : 'Elsewhere'"
                class="shrink-0"
                @click="toggleCompanionCombatReady(companion)"
              />
            </div>
          </div>

          <!-- Round + active turn header (full / compact variants, CSS picks which).
               Explicit !isInLobby (not v-else): the companions strip sits between
               this and the lobby header, and v-else would pair with *its* v-if. -->
          <template v-if="!isInLobby">
            <div class="round-header-full flex items-center justify-center flex-wrap gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <div class="text-label-lg font-semibold text-muted-foreground">ROUND</div>
              <div class="text-title font-bold text-primary">{{ liveState.current_round }}</div>
              <div v-if="activeCombatant" class="ml-4 flex items-center gap-2 min-w-0">
                <span class="text-label-lg text-muted-foreground shrink-0">ACTIVE:</span>
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

          <!-- Turn timer (optional rule) — a shared soft countdown for the active turn -->
          <div v-if="turnTimerSeconds !== null && !isInLobby" class="flex items-center justify-center">
            <TurnTimer :seconds="turnTimerSeconds" :reset-key="turnResetKey" />
          </div>

          <!-- Your initiative — players roll their own each encounter (#504) -->
          <div
            v-if="myPlayer && showMyInitiative"
            class="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3"
          >
            <span class="text-label-lg font-semibold text-muted-foreground">
              YOUR INITIATIVE
            </span>
            <AppButton
              v-if="myInitiative === null"
              variant="tinted"
              tone="primary"
              emphasis="soft"
              size="lg"
              class="font-bold"
              :icon="IconDice"
              icon-size="md"
              :disabled="rollingInitiative"
              :label="rollingInitiative ? 'Rolling…' : `Roll d20 ${dexModLabel}`"
              @click="rollMyInitiative"
            />
            <span v-else class="text-title font-bold text-primary">{{ myInitiative }}</span>
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
                <p v-if="getEventMessage(event)" class="text-body text-foreground/90 italic leading-snug">
                  {{ getEventMessage(event) }}
                </p>
                <p
                  class="text-eyebrow text-amber-500/70"
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

  <!-- Combatant lightbox — monsters, and NPCs the player has no roster entry for -->
  <EncounterCombatantLightbox :combatant="selectedCombatant" @close="tappedCombatant = null" />

  <!-- NPC lightbox — the richer view, for NPCs the party has already met -->
  <PlayerNpcLightbox :npc="selectedNpc" @close="tappedCombatant = null" />

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
import { useCompanions, useUpdateCompanion } from "@/composables/useCompanions";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { liveState } from "@/composables/useEncounterLive";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import type { RunCombatant, HealthVisibility, EncounterEvent, EventAction } from "@/types/encounter.types";
import type { PlayerNpc } from "@/types/npc.types";
import type { Companion } from "@/types/companion.types";
import { usePlayerCombatPrefs } from "@/composables/usePlayerCombatPrefs";
import { useTurnChime } from "@/composables/useTurnChime";
import { useScreenShake } from "@/composables/useScreenShake";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useParty } from "@/composables/useParty";
import { useTurnTimerConfig } from "@/composables/useTurnTimerConfig";
import PartyMemberLightbox from "@/components/player/PartyMemberLightbox.vue";
import EncounterCombatantList from "@/components/player/EncounterCombatantList.vue";
import PlayerNpcLightbox from "@/components/play/PlayerNpcLightbox.vue";
import EncounterCombatantLightbox from "@/components/player/EncounterCombatantLightbox.vue";
import TurnTimer from "@/components/encounters/TurnTimer.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AppButton from "@/components/common/AppButton.vue";

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
  () => {
    const activeId = liveState.value?.active_combatant_instance_id;
    if (activeId) return sortedCombatants.value.find((c) => c.instance_id === activeId) ?? null;
    return sortedCombatants.value[liveState.value?.active_combatant_index ?? 0] ?? null;
  },
);

const myMemberId = computed(() => auth.linkedPartyMemberId);

const myPlayer = computed(
  () => sortedCombatants.value.find((c) => c.party_member_id === myMemberId.value) ?? null,
);

const isInLobby = computed(() => (liveState.value?.current_round ?? 1) === 0);

// ── Bench/unbench own companions from the lobby (#569) ──────────────────────
// Writes combat_ready directly to the companions row (RLS lets the owning
// player update their own companion); the DM's runner reacts to the change
// live while parked in the lobby. Local overrides keep the toggle snappy
// instead of waiting on the query invalidation round-trip.
const { data: companions } = useCompanions();
const { mutateAsync: updateCompanion } = useUpdateCompanion();
const companionOverrides = ref<Record<string, boolean>>({});

const myCompanions = computed(() =>
  (companions.value ?? []).filter((c) => c.owner_party_member_id === myMemberId.value),
);

function companionCombatReady(companion: Companion): boolean {
  return companionOverrides.value[companion.id] ?? companion.combat_ready;
}

async function toggleCompanionCombatReady(companion: Companion) {
  const next = !companionCombatReady(companion);
  companionOverrides.value[companion.id] = next;
  try {
    await updateCompanion({ id: companion.id, update: { combat_ready: next } });
  } catch {
    companionOverrides.value[companion.id] = !next;
  }
}

// ── Turn timer (optional rule) — restarts whenever the DM advances the turn ──
const { turnTimerSeconds, turnResetKey } = useTurnTimerConfig(
  computed(() => liveState.value?.current_round ?? 0),
  computed(() => activeCombatant.value?.instance_id),
);

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
  return activeCombatant.value?.instance_id === myPlayer.value.instance_id;
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

// NPC lightbox — the player-visible projection, NOT the raw `npcs` table. The
// raw query is DM-only: RLS gates it on the NPC listing this player in
// `player_visible_to`, so an enemy the DM only revealed inside the encounter
// came back empty and the tap did nothing at all (#tap-to-enlarge).
const { data: sharedNpcs } = useSharedNpcs();

// The tapped combatant is stored raw and the lightbox choice is DERIVED, so a
// tap that lands before the sharedNpcs query resolves still upgrades to the
// rich NPC lightbox the moment the data arrives (instead of being locked into
// the bare fallback by a one-shot lookup at click time).
const tappedCombatant = ref<RunCombatant | null>(null);

// The richer NPC view — only for NPC-backed combatants the player-visible
// projection actually knows about (RLS/reveal gating lives in that query).
const selectedNpc = computed<PlayerNpc | null>(() => {
  const c = tappedCombatant.value;
  if (!c?.npc_id) return null;
  return sharedNpcs.value?.find((n) => n.id === c.npc_id) ?? null;
});

// Fallback lightbox for combatants the player has no roster entry for — the
// live combatant already carries the name and portrait the row is drawing, and
// the DM authorised showing it by setting reveal_state, so there's nothing to
// look up. This is the path that makes tapping an unmet enemy enlarge her face.
// Monsters, and NPCs the party hasn't met yet, stay here.
const selectedCombatant = computed<RunCombatant | null>(() =>
  selectedNpc.value ? null : tappedCombatant.value,
);

function onCombatantClick(combatant: RunCombatant) {
  if (combatant.party_member_id || combatant.companion_id) {
    selectedMemberCombatant.value = combatant;
    return;
  }
  tappedCombatant.value = combatant;
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
