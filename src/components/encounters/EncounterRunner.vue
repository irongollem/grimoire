<template>
  <div class="runner-root">
    <!-- Top bar -->
    <div class="runner-topbar">
      <RouterLink :to="`/encounters/${encounterId}`" class="back-link">
        ← Back to Builder
      </RouterLink>

      <div class="round-controls">
        <button @click="store.prevTurn()" :disabled="store.round === 0" class="prev-btn">‹</button>
        <span class="round-label">{{ store.round === 0 ? 'Pre-Combat' : 'Round ' + store.round }}</span>
        <TurnTimer
          v-if="turnTimerSeconds !== null && store.round > 0"
          :seconds="turnTimerSeconds"
          :reset-key="turnResetKey"
        />
        <button @click="store.nextTurn()" :disabled="store.round === 0" class="next-btn">Next Turn ›</button>
      </div>

      <div class="top-right">
        <span class="encounter-name">{{ store.encounterName }}</span>
        <ManualHelpLink page="encounter-runner" />
        <button
          v-if="!store.started"
          :disabled="store.rollingInitiative"
          @click="handleRollInitiative"
          class="roll-btn"
          title="Roll initiative for everyone who hasn't rolled yet"
        >
          <IconDiceRoll class="h-3.5 w-3.5" />
          <span class="btn-label">Roll Initiative</span>
        </button>
        <button
          v-if="isLive && store.round === 0"
          :disabled="store.rollingInitiative"
          @click="handleStartCombat"
          class="start-combat-btn"
          title="Start Combat"
        >
          <IconEncounter class="h-3.5 w-3.5" />
          <span class="btn-label">Start Combat</span>
        </button>
        <button
          v-if="campaign.activeCampaignId"
          class="go-live-btn"
          :class="isLive ? 'live-active' : ''"
          :disabled="goingLive"
          :title="isLive ? 'Live' : 'Go Live'"
          @click="handleGoLive"
        >
          <IconLive class="h-3.5 w-3.5" />
          <span class="btn-label">{{ goingLive ? 'Starting…' : isLive ? '● Live' : 'Go Live' }}</span>
        </button>
        <RouterLink
          v-if="canOpenBattleMap"
          :to="`/encounters/${encounterId}/run/map`"
          class="map-btn"
          title="Open battle map"
        >
          <IconMap class="h-3.5 w-3.5" />
          <span class="btn-label">Battle Map</span>
        </RouterLink>
        <button
          v-else
          class="map-btn"
          disabled
          :title="battleMapDisabledReason"
        >
          <IconMap class="h-3.5 w-3.5" />
          <span class="btn-label">Battle Map</span>
        </button>
        <button
          v-if="canOpenBattleMap"
          class="map-btn-secondary"
          title="Open battle map in a new window (for a second monitor)"
          @click="openBattleMapInNewWindow"
        >
          ↗
        </button>
        <button
          @click="handleAbandon"
          class="abandon-btn"
          title="Abandon — end run without syncing HP or discovering monsters"
        >
          <IconDungeon class="h-3.5 w-3.5" />
          <span class="btn-label">Abandon</span>
        </button>
        <button @click="handleEndCombat" class="end-btn" title="End Combat">
          <IconFlag class="h-3.5 w-3.5" />
          <span class="btn-label">End Combat</span>
        </button>
      </div>
    </div>

    <!-- Body: list + optional detail panel -->
    <div class="runner-body-wrap">
      <!-- Initiative list -->
      <div class="runner-body">
        <!-- Boss mechanics panel (lair actions + legendary actions + surprise) -->
        <RunnerBossMechanics />
        <RunnerCombatantList
          :selected-id="selectedId"
          @select="selectedId = $event"
        />
        <!-- Spawn panel at the bottom of the main list -->
        <RunnerSpawnPanel />
      </div>

      <!-- Stat block detail panel with draggable left border -->
      <template v-if="selectedId !== null || selectedTrapId !== null">
        <div
          class="resize-handle"
          title="Drag to resize"
          @mousedown.prevent="startDetailResize($event)"
          @touchstart.prevent="startDetailResizeTouch($event)"
        />
        <div class="panel-shell" :style="{ width: detailWidth + 'px' }">
          <RunnerEntityDetail
            :selected-id="selectedId"
            :selected-trap-id="selectedTrapId"
            :monsters="monsters ?? []"
            :party-members="partyMembers ?? []"
            @close="selectedId = null; selectedTrapId = null"
          />
        </div>
      </template>

      <!-- Events + traps + spawn sidebar -->
      <RunnerDmTools
        v-model:selected-trap-id="selectedTrapId"
        @update:selected-trap-id="(id) => { selectedTrapId = id; if (id) selectedId = null; }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, watch, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { IconDiceRoll, IconDungeon, IconEncounter, IconFlag, IconLive, IconMap } from '@/lib/icons';
import ManualHelpLink from '@/components/common/ManualHelpLink.vue';
import { useEncounter } from "@/composables/useEncounters";
import { useLocation } from "@/composables/useLocations";
import { supabase } from "@/lib/supabase";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useCompanions, useUpdateCompanion } from "@/composables/useCompanions";
import { useUpdateNpc } from "@/composables/useNpcs";
import { buildNpcSyncUpdate } from "@/lib/npcEncounterSync";
import { useEncounterLive } from "@/composables/useEncounterLive";
import { useCampaignStore } from "@/stores/campaign";
import { useAutoDiscoverMonsters } from "@/composables/useDiscoveredMonsters";
import { useAuthStore } from "@/stores/auth";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { initiativeModifier } from "@/rules/combatantSort";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { useTurnTimerConfig } from "@/composables/useTurnTimerConfig";
import { requestAudioTheme, releaseAudioTheme } from "@/lib/audio/audioTriggers";
import { useRunnerPartySync } from "@/composables/useRunnerPartySync";
import RunnerCombatantList from "./RunnerCombatantList.vue";
import RunnerEntityDetail from "./RunnerEntityDetail.vue";
import RunnerDmTools from "./RunnerDmTools.vue";
import RunnerBossMechanics from "./RunnerBossMechanics.vue";
import RunnerSpawnPanel from "./RunnerSpawnPanel.vue";
import TurnTimer from "./TurnTimer.vue";

const store = useEncounterRunStore();
const router = useRouter();
const route = useRoute();
const encounterId = computed(() => route.params.id as string);
const campaign = useCampaignStore();
const { isLive, goLive, schedulePush, endLive } = useEncounterLive(encounterId.value);
const goingLive = ref(false);
const auth = useAuthStore();

const { data: monsters } = useAllMonsters();
const { data: partyMembers } = useParty();
const { data: companions } = useCompanions();
const { data: encounter } = useEncounter(encounterId);
const battleMapLocationId = computed(() => encounter.value?.location_id ?? "");
const { data: battleMapLocation } = useLocation(battleMapLocationId);

const canOpenBattleMap = computed(() =>
  !!battleMapLocation.value?.is_battle_map &&
  !!battleMapLocation.value?.map_url &&
  !!battleMapLocation.value?.grid_calibration,
);
const battleMapDisabledReason = computed(() => {
  if (!encounter.value?.location_id) return "Link this encounter to a location to use the battle map";
  if (!battleMapLocation.value?.map_url) return "The linked location has no map";
  if (!battleMapLocation.value?.is_battle_map) return 'Toggle "Battle map" on the location to enable the VTT';
  if (!battleMapLocation.value?.grid_calibration) return "Calibrate the location's map first";
  return "";
});

function openBattleMapInNewWindow() {
  window.open(`/encounters/${encounterId.value}/run/map`, "_blank", "noopener,noreferrer");
}
const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
const { mutateAsync: updateCompanion } = useUpdateCompanion();
const { mutateAsync: updateNpc } = useUpdateNpc();
const { mutateAsync: autoDiscover } = useAutoDiscoverMonsters();

const selectedId = ref<string | null>(null);
const selectedTrapId = ref<string | null>(null);

const detailWidth = ref(320);

function startDetailResize(e: MouseEvent) {
  const startX = e.clientX;
  const startWidth = detailWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";

  function onMove(ev: MouseEvent) {
    detailWidth.value = Math.max(200, Math.min(700, startWidth + (startX - ev.clientX)));
  }
  function onUp() {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function startDetailResizeTouch(e: TouchEvent) {
  const startX = e.touches[0].clientX;
  const startWidth = detailWidth.value;
  document.body.style.userSelect = "none";

  function onMove(ev: TouchEvent) {
    detailWidth.value = Math.max(200, Math.min(700, startWidth + (startX - ev.touches[0].clientX)));
  }
  function onEnd() {
    document.body.style.userSelect = "";
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
  }
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
}

// ── Initiative rolling ───────────────────────────────────────────────────────
// The store owns the "who still needs a value" logic; the actual d20 goes
// through promptRoll so the DM's physical-dice preference is honoured — one
// manual-entry prompt per combatant, in initiative-list order. Rolls are silent:
// the initiative order is broadcast through the live encounter state anyway, and
// posting each monster's roll to campaign chat would leak the hidden ones.
// `store.rollingInitiative` is the shared busy flag — the top bar and every
// per-combatant roll button disable together, since the manual-entry prompt is a
// single global slot.
const { promptRoll } = usePromptedRoll();

store.setInitiativeRoller(async (combatant) => {
  const result = await promptRoll({
    counts: { 20: 1 },
    modifier: initiativeModifier(combatant),
    label: `Initiative — ${combatant.name}`,
    senderName: combatant.name,
    silent: true,
  });
  return result?.total ?? null;
});

// ── Optional combat rules (turn timer + random initiative) ───────────────────
const { data: campaignRules } = useOptionalRules();

// Re-roll initiative each round when the DM has enabled the rule. Kept in sync
// so toggling it mid-fight takes effect on the next round wrap.
watch(
  () => isRuleEffectivelyEnabled(campaignRules.value, "random_initiative"),
  (on) => store.setRandomizeInitiativeEachRound(on),
  { immediate: true },
);

// Turn timer — restarts whenever the active combatant or round changes.
const { turnTimerSeconds, turnResetKey } = useTurnTimerConfig(
  computed(() => store.round),
  computed(() => store.activeCombatant?.instance_id),
);

function handleRollInitiative() {
  void store.rollAllInitiatives();
}

// ── Themed audio ─────────────────────────────────────────────────────────────
//
// Fired on Start Combat rather than Go Live: Go Live is about the player
// portal, and most tables running this are in one room. The music should come
// up when the fight starts, whether or not anyone is watching remotely.
//
// This asks; it does not command. If nothing is tagged with the encounter's
// theme the soundboard leaves the room exactly as it found it.
const audioSourceId = computed(() => `encounter:${encounterId.value}`);

function requestEncounterAudio() {
  const current = encounter.value;
  if (!current) return;
  const theme = current.audio_theme;
  if (theme === null || theme.trim() === "") return;
  requestAudioTheme({
    sourceId: audioSourceId.value,
    theme,
    slot: "music",
    label: current.name,
    kind: "encounter",
  });
}

function releaseEncounterAudio() {
  releaseAudioTheme(audioSourceId.value);
}

function handleStartCombat() {
  if (store.rollingInitiative) return;
  void store.startCombat();
  requestEncounterAudio();
}

async function handleGoLive() {
  if (isLive.value) {
    await endLive();
    return;
  }
  goingLive.value = true;
  try {
    await goLive({ round: store.round, activeIndex: store.activeIndex, combatants: store.combatants });

    // Auto-discover only revealed monsters when going live — hidden/unseen
    // combatants haven't been seen by players yet.
    const monsterIds = new Set(
      store.combatants
        .filter((c) => c.type === "monster" && c.monster_id && c.reveal_state === "revealed")
        .map((c) => c.monster_id!),
    );
    if (monsterIds.size > 0) {
      const monstersToDiscover = (monsters.value ?? []).filter((m) => monsterIds.has(m.id));
      const partyMemberIds = (partyMembers.value ?? []).map((m) => m.id);
      await autoDiscover({ monsters: monstersToDiscover, partyMemberIds });
    }
  } finally {
    goingLive.value = false;
  }
}

watch(
  [() => store.round, () => store.activeIndex, () => store.combatants, () => store.eventsFired],
  () => {
    if (isLive.value) {
      schedulePush({ round: store.round, activeIndex: store.activeIndex, combatants: store.combatants, eventsFired: store.eventsFired });
    }
  },
  { deep: true },
);

// ── Bidirectional HP sync between runner and party_members ───────────────────
// Debounced HP writes out, Realtime ingest (HP / temp HP / player-rolled
// initiative) in, and the store's persist handler — see useRunnerPartySync.
const { cancelPendingHpFlush } = useRunnerPartySync(isLive);

// ── Live roster-NPC sync ─────────────────────────────────────────────────────
// Roster NPCs run as combatants of type "monster" carrying an `npc_id`. Their
// records are written back the moment it matters — NOT at conclusion: a token the
// DM cycles to "revealed" (seen) joins the party's seen list, and a token that
// drops to 0 HP is marked dead — but a hidden death is recorded without being
// disclosed (reveal always requires being seen). Mirrors how monster discovery
// fires on reveal. Dedup is by the builder itself: it returns null when nothing
// would change, and we patch the local snapshot so re-fires stay no-ops.
watch(
  () => store.combatants
    .filter((c) => c.type === "monster" && c.npc_id)
    .map((c) => ({ npcId: c.npc_id!, seen: c.reveal_state === "revealed", died: c.hp <= 0 })),
  (rows) => {
    const partyMemberIds = (partyMembers.value ?? []).map((m) => m.id);
    for (const row of rows) {
      if (!row.seen && !row.died) continue;
      const npc = store.availableNpcs.find((n) => n.id === row.npcId);
      if (!npc) continue;
      const update = buildNpcSyncUpdate(npc, partyMemberIds, { seen: row.seen, died: row.died });
      if (update) {
        Object.assign(npc, update); // keep the local snapshot fresh so re-fires stay no-ops
        void updateNpc({ id: row.npcId, update });
      }
    }
  },
);

// ── Companion bench sync (lobby only) ────────────────────────────────────────
// A companion's `combat_ready` flag can flip while the lobby (round 0) is open
// — the DM benches one from CompanionCard, or the owning player toggles theirs.
// The `companions` query is kept fresh by useCampaignLiveSync (mounted in the
// layout, "companions" is in its SYNC_TABLES list), so this watch reconciles
// the roster against it: benched → drop the combatant, un-benched → add it
// back. Runs `immediate` so a stale `combatants_live` row (bench toggled while
// no one had the runner open) is reconciled the moment it mounts. Once combat
// starts (round > 0) the roster is locked — companions already in the fight
// stay in it regardless of a bench toggle.
watch(
  companions,
  (comps) => {
    if (!comps || store.round !== 0) return;
    const enc = encounter.value;
    if (!enc) return;
    for (const compId of enc.companion_ids ?? []) {
      const comp = comps.find((c) => c.id === compId);
      if (!comp) continue;
      const instanceId = `c-${comp.id}`;
      const exists = store.combatants.some((c) => c.instance_id === instanceId);
      if (comp.combat_ready === false) {
        if (exists) store.removeCombatant(instanceId);
      } else if (!exists) {
        store.addCompanionCombatant(comp, enc.party_member_factions?.[comp.id] ?? "players");
      }
    }
  },
  { deep: true, immediate: true },
);

onUnmounted(() => {
  store.setInitiativeRoller(null);
  // Leaving the runner mid-fight still gives the slot back. Without this the
  // battle music would follow the DM around the app with nothing left on screen
  // to stop it.
  releaseEncounterAudio();
});

watch(
  () => store.pendingBroadcasts.length,
  async () => {
    const campaignId = campaign.activeCampaignId;
    if (!store.pendingBroadcasts.length || !campaignId) return;
    const messages = [...store.pendingBroadcasts];
    for (const msg of messages) store.clearPendingBroadcast(msg);
    try {
      await supabase.from("campaign_messages").insert(
        messages.map((msg) => ({
          campaign_id: campaignId,
          user_id: auth.user?.id ?? "",
          recipient_user_id: null,
          sender_name: "⚔ Encounter",
          message: msg,
          type: "system",
        })),
      );
    } catch (e) {
    }
  },
);

async function handleAbandon() {
  if (!await confirm("Abandon this run? Party HP and conditions will NOT be updated.")) return;
  await endLive();
  releaseEncounterAudio();
  store.reset();
  router.push(`/encounters/${encounterId.value}`);
}

async function handleEndCombat() {
  if (!await confirm("End combat? Party HP, conditions, and curses will be updated.")) return;
  // Cancel any pending HP debounce — end-combat does its own authoritative write below.
  cancelPendingHpFlush();
  await endLive();
  // Hands the music slot back to whatever was playing before the fight, or
  // stops it if the DM had nothing running.
  releaseEncounterAudio();

  // Sync player combatants back to party_members. (Roster-NPC death/reveal is
  // handled live as it happens — see the NPC-sync watcher above — not here.)
  const playerCombatants = store.combatants.filter((c) => c.type === "player" && c.party_member_id);
  // Companions persist HP + conditions the same way so they walk into the next
  // encounter at whatever state combat left them in (#569). Abandon skips this
  // block entirely, same as it does for party members.
  const companionCombatants = store.combatants.filter((c) => c.type === "player" && c.companion_id);
  await Promise.all([
    ...playerCombatants.map((c) =>
      updatePartyMember({
        id: c.party_member_id!,
        update: {
          current_hp: c.hp,
          conditions: c.conditions,
          curses: c.curses,
          death_save_successes: c.death_saves.successes,
          death_save_failures: c.death_saves.failures,
        },
      }),
    ),
    ...companionCombatants.map((c) =>
      updateCompanion({
        id: c.companion_id!,
        update: {
          current_hp: c.hp,
          conditions: c.conditions,
        },
      }),
    ),
  ]);

  store.reset();
  router.push(`/encounters/${encounterId.value}`);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.runner-root {
  @apply flex flex-col h-full min-h-0;
}

.runner-topbar {
  @apply flex items-center gap-4 px-4 py-3 border-b border-border bg-card shrink-0 flex-wrap;
}

.back-link {
  @apply font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors;
}

.round-controls {
  @apply flex items-center gap-1 ml-auto;
}

.prev-btn {
  @apply px-3 py-1.5 rounded-md border border-border text-foreground font-cinzel text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-40;
}

.next-btn {
  @apply px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 disabled:opacity-40;
}

.round-label {
  @apply font-cinzel text-sm font-bold text-foreground px-2;
}

.top-right {
  @apply flex items-center gap-2;
}

.encounter-name {
  @apply font-cinzel text-sm font-bold text-foreground hidden sm:block;
}

/*
 * On small screens (<sm) action buttons collapse to icon-only to stop the top
 * bar overflowing the viewport. The title="" attribute on each button keeps
 * hover/long-press context intact.
 */
.btn-label {
  @apply hidden sm:inline;
}

.roll-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity;
}

.abandon-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-muted-foreground font-cinzel text-xs font-semibold hover:bg-muted transition-colors;
}

.map-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-muted-foreground font-cinzel text-xs font-semibold hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground;
}

.map-btn-secondary {
  @apply inline-flex items-center justify-center px-2 py-1.5 rounded-md border border-border text-muted-foreground font-cinzel text-xs font-semibold hover:border-primary hover:text-primary transition-colors;
}

.end-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive font-cinzel text-xs font-semibold hover:bg-destructive/10 transition-colors;
}

.start-combat-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 text-white font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity;
}

.go-live-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-muted-foreground font-cinzel text-xs font-semibold hover:border-primary hover:text-primary transition-colors disabled:opacity-50;
}
.live-active {
  @apply border-green-500/50 text-green-500 bg-green-500/10 hover:border-green-500 hover:text-green-400;
}

.runner-body-wrap {
  @apply flex flex-1 min-h-0 overflow-hidden;
}

@media (max-width: 639px) {
  .runner-body-wrap {
    position: relative;
  }
}

.runner-body {
  @apply flex-1 overflow-y-auto min-w-0;
}

.resize-handle {
  position: relative;
  width: 0.3125rem;
  flex-shrink: 0;
  cursor: col-resize;
  background: theme(colors.border / 100%);
  transition: background 0.15s;
  z-index: 1;
}

/* Expand the touch/click surface to 44px without affecting layout */
.resize-handle::before {
  content: "";
  position: absolute;
  inset: 0;
  margin-inline: -1.25rem;
}

.resize-handle:hover {
  background: theme(colors.primary / 50%);
}

.panel-shell {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

@media (max-width: 639px) {
  .resize-handle {
    display: none;
  }
  .panel-shell {
    width: auto !important;
  }
}
</style>
