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
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { IconDiceRoll, IconDungeon, IconEncounter, IconFlag, IconLive, IconMap } from '@/lib/icons';
import ManualHelpLink from '@/components/common/ManualHelpLink.vue';
import { useEncounter } from "@/composables/useEncounters";
import { useLocation } from "@/composables/useLocations";
import { supabase } from "@/lib/supabase";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useUpdateNpc } from "@/composables/useNpcs";
import { computeNpcConclusionUpdates } from "@/lib/npcEncounterSync";
import { useEncounterLive } from "@/composables/useEncounterLive";
import { useCampaignStore } from "@/stores/campaign";
import { useAutoDiscoverMonsters } from "@/composables/useDiscoveredMonsters";
import { useAuthStore } from "@/stores/auth";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { initiativeModifier } from "@/lib/combatantSort";
import { useOptionalRules, isRuleEffectivelyEnabled, resolveRuleConfig } from "@/composables/useOptionalRules";
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

// Turn-timer duration (seconds) or null when the rule is off.
const turnTimerSeconds = computed(() =>
  isRuleEffectivelyEnabled(campaignRules.value, "turn_timer")
    ? resolveRuleConfig(campaignRules.value, "turn_timer").seconds
    : null,
);
// Restarts the countdown whenever the active combatant or round changes.
const turnResetKey = computed(() => `${store.round}:${store.activeCombatant?.instance_id ?? ""}`);

function handleRollInitiative() {
  void store.rollAllInitiatives();
}

function handleStartCombat() {
  if (store.rollingInitiative) return;
  void store.startCombat();
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
// lastWrittenHp tracks the HP values we've sent to the DB so the Realtime echo
// of our own write is dropped explicitly rather than relying on Vue's same-value
// reactive no-op (which is an implementation detail, not a guarantee).

const partyHpQueue = new Map<string, number>(); // partyMemberId → pending hp
const lastWrittenHp = new Map<string, number>(); // partyMemberId → hp we last wrote
let partyHpTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => store.combatants
    .filter((c) => c.type === "player" && c.party_member_id)
    .map((c) => ({ iid: c.instance_id, hp: c.hp, pmId: c.party_member_id! })),
  (newVals, oldVals) => {
    if (!isLive.value || !oldVals) return;
    for (const nv of newVals) {
      const ov = oldVals.find((o) => o.iid === nv.iid);
      if (ov && ov.hp !== nv.hp) partyHpQueue.set(nv.pmId, nv.hp);
    }
    if (!partyHpQueue.size) return;
    if (partyHpTimer) clearTimeout(partyHpTimer);
    partyHpTimer = setTimeout(async () => {
      const entries = [...partyHpQueue.entries()];
      partyHpQueue.clear();
      entries.forEach(([id, hp]) => lastWrittenHp.set(id, hp));
      await Promise.all(entries.map(([id, current_hp]) =>
        updatePartyMember({ id, update: { current_hp } }),
      ));
    }, 400);
  },
);

let partyMembersChannel: ReturnType<typeof supabase.channel> | null = null;

// Route the store's player-combatant persistence through the party-member
// mutation so the party query cache is invalidated on every write (HP, temp
// HP, conditions, wildshape, …). The store stays UI-only.
store.setPersistHandler((id, update) => {
  void updatePartyMember({ id, update });
});

onMounted(() => {
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  partyMembersChannel = supabase
    .channel("runner_party_members_hp")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "party_members",
        filter: `campaign_id=eq.${campaignId}` },
      (payload) => {
        const row = payload.new as { id: string; current_hp: number; temp_hp: number; current_initiative: number | null };
        const combatant = store.combatants.find((c) => c.party_member_id === row.id);

        // Temp HP the player granted themselves (or spent) on their own sheet.
        // No echo guard needed: our own writes set the combatant first, so the
        // values already match by the time the event comes back.
        if (combatant && (combatant.temp_hp ?? 0) !== (row.temp_hp ?? 0)) {
          store.ingestTempHp(combatant.instance_id, row.temp_hp ?? 0);
        }

        // Ingest player-rolled initiative (#504). The runner never writes
        // current_initiative, so there's no echo to guard against. Only apply a
        // fresh non-null value that differs — this keeps the player's own roll
        // and lets "Roll Initiative" skip anyone who already rolled.
        if (
          combatant &&
          row.current_initiative !== null &&
          combatant.initiative !== row.current_initiative
        ) {
          store.setInitiative(combatant.instance_id, row.current_initiative);
        }

        if (lastWrittenHp.get(row.id) === row.current_hp) {
          lastWrittenHp.delete(row.id);
          return;
        }
        if (combatant && combatant.hp !== row.current_hp) {
          store.setHp(combatant.instance_id, row.current_hp);
        }
      },
    )
    .subscribe();
});

onUnmounted(() => {
  store.setPersistHandler(null);
  store.setInitiativeRoller(null);
  if (partyHpTimer) clearTimeout(partyHpTimer);
  if (partyMembersChannel) {
    supabase.removeChannel(partyMembersChannel);
    partyMembersChannel = null;
  }
});

watch(
  () => store.pendingBroadcasts.length,
  async () => {
    if (!store.pendingBroadcasts.length || !campaign.activeCampaignId) return;
    const messages = [...store.pendingBroadcasts];
    for (const msg of messages) {
      store.clearPendingBroadcast(msg);
      try {
        await supabase.from("campaign_messages").insert({
          campaign_id: campaign.activeCampaignId,
          user_id: auth.user?.id ?? "",
          recipient_user_id: null,
          sender_name: "⚔ Encounter",
          message: msg,
          type: "system",
        });
      } catch (e) {
      }
    }
  },
);

async function handleAbandon() {
  if (!await confirm("Abandon this run? Party HP and conditions will NOT be updated.")) return;
  await endLive();
  store.reset();
  router.push(`/encounters/${encounterId.value}`);
}

async function handleEndCombat() {
  if (!await confirm("End combat? Party HP/conditions are saved, fallen NPCs are marked dead, and every NPC the party faced is revealed to them.")) return;
  // Cancel any pending HP debounce — end-combat does its own authoritative write below.
  if (partyHpTimer) { clearTimeout(partyHpTimer); partyHpTimer = null; }
  partyHpQueue.clear();
  await endLive();

  // Sync player combatants back to party_members
  const playerCombatants = store.combatants.filter((c) => c.type === "player" && c.party_member_id);
  await Promise.all(
    playerCombatants.map((c) =>
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
  );

  // Sync roster NPCs back to their records: mark the fallen dead and reveal
  // every NPC the party faced (living or dead) so they surface in the player
  // portal. Monster combatants have no persistent record and are left untouched.
  const partyMemberIds = (partyMembers.value ?? []).map((m) => m.id);
  const npcUpdates = computeNpcConclusionUpdates(store.combatants, store.availableNpcs, partyMemberIds);
  await Promise.all(npcUpdates.map((u) => updateNpc({ id: u.id, update: u.update })));

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
