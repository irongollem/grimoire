<template>
  <div class="flex flex-col h-full" :class="{ shake: isShaking }">
    <!-- Panel header -->
    <div class="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
      <div class="flex items-center gap-2">
        <span v-if="liveState" class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <Swords v-else class="h-3.5 w-3.5 text-muted-foreground/40" />
        <span class="font-cinzel text-xs font-bold text-foreground tracking-wider">ENCOUNTER</span>
      </div>
      <button
        class="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Close encounter panel"
        @click="$emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-3 space-y-3">

        <!-- No encounter in progress -->
        <div v-if="!liveState" class="text-center py-12 space-y-3">
          <Swords class="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p class="font-cinzel text-sm text-muted-foreground">No encounter in progress.</p>
          <p class="font-fell text-xs text-muted-foreground italic">Your DM will start a live encounter when combat begins.</p>
        </div>

        <template v-else>
          <!-- Your Turn! banner -->
          <div
            v-if="isMyTurn && !isInLobby"
            class="flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-3 animate-pulse"
          >
            <Swords class="h-4 w-4 text-primary shrink-0" />
            <span class="font-cinzel text-sm font-bold text-primary tracking-wider">YOUR TURN!</span>
            <Swords class="h-4 w-4 text-primary shrink-0" />
          </div>

          <!-- Lobby header -->
          <div
            v-if="isInLobby"
            class="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
          >
            <Swords class="h-4 w-4 text-amber-500/60 shrink-0" />
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

          <!-- Combatant list -->
          <div class="rounded-lg border border-border bg-card overflow-hidden">
            <template v-for="combatant in visibleCombatants" :key="combatant.instance_id">
              <!-- Unseen slot -->
              <div
                v-if="combatant.reveal_state === 'unseen' && combatant.type === 'monster'"
                class="player-row opacity-50"
                data-combatant-type="monster"
              >
                <div class="portrait-cell">
                  <div class="portrait-inner">
                    <div class="portrait-initials" style="background: rgba(100, 100, 100, 0.3); color: #888">?</div>
                  </div>
                </div>
                <div class="row-content">
                  <div class="shrink-0 w-8 text-center self-center">
                    <span class="font-cinzel text-sm font-bold text-muted-foreground">{{ combatant.initiative ?? "—" }}</span>
                  </div>
                  <div class="flex-1 min-w-0 self-center">
                    <div class="flex items-center gap-2 overflow-hidden">
                      <span class="combatant-name font-cinzel text-sm font-semibold text-muted-foreground italic truncate">???</span>
                      <span class="pc-npc-badge shrink-0 font-cinzel text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider bg-muted text-muted-foreground">NPC</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Normal row -->
              <div
                v-else
                class="player-row"
                :data-combatant-type="combatant.type"
                :class="[
                  isActive(combatant) ? 'bg-primary/8 ring-1 ring-inset ring-primary/20' : 'hover:bg-muted/20',
                  (combatant.npc_id || combatant.monster_id || combatant.party_member_id || combatant.companion_id) ? 'cursor-pointer' : '',
                ]"
                @click="onCombatantClick(combatant)"
              >
                <div class="portrait-cell">
                  <div class="portrait-inner" :class="isActive(combatant) ? 'portrait-active' : ''">
                    <FocalImage
                      v-if="portraitSrc(combatant)"
                      :src="portraitSrc(combatant)!"
                      :alt="portraitAlt(combatant)"
                      :focal-point="portraitHasBeastImage(combatant) ? null : (combatant.portrait_focal_point ?? null)"
                      format="square"
                    />
                    <div
                      v-else
                      class="portrait-initials"
                      :style="{
                        backgroundColor: combatant.type === 'player' ? 'rgba(99,102,241,0.2)' : 'rgba(120,53,15,0.2)',
                        color: combatant.type === 'player' ? '#818cf8' : '#b45309',
                      }"
                    >
                      {{ combatant.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() }}
                    </div>
                  </div>
                </div>

                <div class="row-content">
                  <div class="shrink-0 w-8 text-center self-center">
                    <span
                      class="font-cinzel text-sm font-bold"
                      :class="isActive(combatant) ? 'text-primary' : 'text-muted-foreground'"
                    >{{ combatant.initiative ?? "—" }}</span>
                  </div>

                  <div class="flex-1 min-w-0 self-center">
                    <div class="flex items-center gap-2 overflow-hidden">
                      <span class="combatant-name font-cinzel text-sm font-semibold text-foreground truncate min-w-0">{{ combatant.name }}</span>
                      <span
                        class="pc-npc-badge shrink-0 font-cinzel text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider"
                        :class="combatant.type === 'player' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
                      >{{ combatant.type === "player" ? "PC" : "NPC" }}</span>
                      <span
                        v-for="cond in combatant.conditions"
                        :key="cond"
                        class="shrink-0 font-cinzel text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 tracking-wider"
                      >{{ cond }}</span>
                    </div>
                    <div
                      v-if="healthVis === 'strategic' || (healthVis === 'immersive' && combatant.type === 'player')"
                      class="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden"
                    >
                      <div
                        class="h-full rounded-full transition-all duration-300"
                        :class="hpBarColor(combatant)"
                        :style="{ width: `${Math.max(0, Math.min(100, (displayHp(combatant) / displayMaxHp(combatant)) * 100))}%` }"
                      />
                    </div>
                  </div>

                  <div class="shrink-0 text-right self-center pr-3">
                    <template v-if="healthVis === 'strategic'">
                      <template v-if="combatant.type === 'player'">
                        <span class="font-cinzel text-sm font-bold" :class="hpColor(combatant)">{{ displayHp(combatant) }}</span>
                        <span class="font-fell text-xs text-muted-foreground">/{{ displayMaxHp(combatant) }}</span>
                      </template>
                      <template v-else>
                        <span class="font-fell text-xs text-muted-foreground italic">{{ hpLabel(combatant) }}</span>
                      </template>
                    </template>
                    <template v-else-if="healthVis === 'immersive' && combatant.type !== 'player'">
                      <span class="font-fell text-xs text-muted-foreground italic">{{ hpLabel(combatant) }}</span>
                    </template>
                  </div>
                </div>
              </div>
            </template>

          </div>
        </template>

      </div>
    </div>
  </div>

  <!-- Monster lightbox -->
  <Transition name="fade">
    <div
      v-if="selectedMonsterCombatant"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="closeMonster"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div class="relative shrink-0">
          <div v-if="selectedMonsterCombatant.portrait_url" class="w-full h-72 overflow-hidden">
            <FocalImage
              :src="selectedMonsterCombatant.portrait_url"
              :alt="selectedMonsterCombatant.name"
              :focal-point="selectedMonsterCombatant.portrait_focal_point ?? null"
              format="portrait"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="closeMonster"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <h2 class="font-cinzel text-lg font-bold text-foreground">{{ selectedMonsterCombatant.name }}</h2>
          <PlayerNotesWidget
            v-if="selectedMonsterCombatant.monster_id"
            entity-type="monster"
            :entity-id="selectedMonsterCombatant.monster_id"
            placeholder="Your observations about this creature…"
          />
        </div>
      </div>
    </div>
  </Transition>

  <!-- NPC lightbox -->
  <Transition name="fade">
    <div
      v-if="selectedNpc"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="closeNpc"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div class="relative shrink-0">
          <div v-if="selectedNpc.player_visible_fields.includes('portrait') && selectedNpcDisplay.portrait" class="w-full h-72 overflow-hidden">
            <FocalImage
              :src="selectedNpcDisplay.portrait!"
              :alt="selectedNpc.player_visible_fields.includes('name') ? selectedNpcDisplay.name : '???'"
              format="portrait"
              :focal-point="selectedNpcDisplay.focalPoint"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="closeNpc"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <div>
            <div class="flex items-start justify-between gap-3">
              <h2 class="font-cinzel text-lg font-bold text-foreground">
                {{ selectedNpc.player_visible_fields.includes('name') ? selectedNpcDisplay.name : '???' }}
              </h2>
              <div class="flex items-center gap-0.5 shrink-0 pt-1" @click.stop>
                <button
                  v-for="n in [1,2,3,4,5]"
                  :key="n"
                  type="button"
                  class="text-lg leading-none transition-colors"
                  :class="n <= (getRating(selectedNpc.id)) ? 'text-yellow-400' : 'text-muted-foreground/25 hover:text-yellow-400/60'"
                  :title="n === 1 ? 'Not relevant' : n === 5 ? 'Very relevant' : `Relevance ${n}`"
                  @click="setRating(selectedNpc.id, n)"
                >★</button>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-1">
              <span
                v-if="selectedNpc.player_visible_fields.includes('relationship')"
                class="px-2 py-0.5 rounded text-[11px] font-cinzel font-bold tracking-wider uppercase text-white"
                :style="{ backgroundColor: relColor(selectedNpc.relationship) + 'CC' }"
              >{{ selectedNpc.relationship }}</span>
              <span
                v-if="selectedNpc.player_visible_fields.includes('status')"
                class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] tracking-wider"
              >
                <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: statusColor(selectedNpc.status) }" />
                {{ selectedNpc.status }}
              </span>
            </div>
            <p v-if="selectedNpc.player_visible_fields.includes('race') && selectedNpc.race" class="mt-1 font-fell text-sm text-muted-foreground italic">{{ selectedNpc.race }}</p>
            <p v-if="selectedNpc.player_visible_fields.includes('occupation') && selectedNpc.occupation" class="font-fell text-sm text-muted-foreground">{{ selectedNpc.occupation }}</p>
          </div>
          <div v-if="myNpcPcNote" class="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
            <div class="px-3 py-2 border-b border-primary/20">
              <p class="font-cinzel text-[10px] font-semibold tracking-widest text-primary/70">YOUR CONNECTION</p>
            </div>
            <div class="px-3 py-2.5">
              <RichTextViewer :content="myNpcPcNote" />
            </div>
          </div>
          <PlayerNotesWidget entity-type="npc" :entity-id="selectedNpc.id" placeholder="Your observations about this character…" />
        </div>
      </div>
    </div>
  </Transition>

  <!-- Party member / companion lightbox -->
  <PartyMemberLightbox :member="selectedMember" @close="selectedMemberCombatant = null" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Swords, X } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { liveState } from "@/composables/useEncounterLive";
import type { RunCombatant, HealthVisibility } from "@/types/encounter.types";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import { usePlayerCombatPrefs } from "@/composables/usePlayerCombatPrefs";
import { useTurnChime } from "@/composables/useTurnChime";
import { useScreenShake } from "@/composables/useScreenShake";
import { useNpcs } from "@/composables/useNpcs";
import { useParty } from "@/composables/useParty";
import PartyMemberLightbox from "@/components/player/PartyMemberLightbox.vue";
import { usePlayerNpcRatings } from "@/composables/usePlayerNpcRatings";
import { useMyNpcPcNote } from "@/composables/useNpcPcNotes";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";

defineEmits<{ close: [] }>();

const campaign = useCampaignStore();
const auth = useAuthStore();
const { turnAudioEnabled } = usePlayerCombatPrefs();
const { playTurnChime } = useTurnChime();
const { isShaking, triggerShake } = useScreenShake();

const healthVis = computed<HealthVisibility>(
  () => (campaign.activeCampaign?.health_visibility as HealthVisibility) ?? "strategic",
);

const sortedCombatants = computed(() => {
  if (!liveState.value) return [];
  return [...liveState.value.combatants_live].sort((a, b) => {
    const ia = a.initiative ?? -999;
    const ib = b.initiative ?? -999;
    if (ib !== ia) return ib - ia;
    if (a.type !== b.type) return a.type === "player" ? -1 : 1;
    return b.dex_mod - a.dex_mod;
  });
});

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

function isActive(combatant: RunCombatant): boolean {
  if (isInLobby.value) return false;
  const fullIdx = sortedCombatants.value.findIndex((c) => c.instance_id === combatant.instance_id);
  return fullIdx === liveState.value?.active_combatant_index;
}

// Portrait helpers
const { data: partyList } = useParty();
const partyMap = computed(() => new Map(partyList.value?.map((m) => [m.id, m]) ?? []));

function portraitSrc(c: RunCombatant): string | null {
  if (c.type === "player") {
    const ws = partyMap.value.get(c.party_member_id ?? "")?.wildshape_state;
    return ws?.beast_image_url ?? c.portrait_url ?? null;
  }
  return c.wildshape?.beast_image_url ?? c.portrait_url ?? null;
}
function portraitAlt(c: RunCombatant): string {
  if (c.type === "player") {
    const ws = partyMap.value.get(c.party_member_id ?? "")?.wildshape_state;
    return ws?.beast_name ?? c.name;
  }
  return c.wildshape?.beast_name ?? c.name;
}
function portraitHasBeastImage(c: RunCombatant): boolean {
  if (c.type === "player") {
    return !!(partyMap.value.get(c.party_member_id ?? "")?.wildshape_state?.beast_image_url);
  }
  return !!c.wildshape?.beast_image_url;
}

// HP display helpers
function displayHp(c: RunCombatant): number {
  if (c.type === "player") {
    const m = partyMap.value.get(c.party_member_id ?? "");
    if (m) return m.wildshape_state?.beast_hp ?? m.current_hp;
  }
  return c.wildshape?.beast_hp ?? c.hp;
}
function displayMaxHp(c: RunCombatant): number {
  if (c.type === "player") {
    const m = partyMap.value.get(c.party_member_id ?? "");
    if (m) return m.wildshape_state?.beast_max_hp ?? m.max_hp;
  }
  return c.wildshape?.beast_max_hp ?? c.max_hp;
}

function hpColor(c: RunCombatant) {
  const pct = displayHp(c) / displayMaxHp(c);
  if (pct <= 0) return "text-muted-foreground";
  if (pct <= 0.25) return "text-red-500";
  if (pct <= 0.5) return "text-amber-500";
  return "text-green-500";
}
function hpBarColor(c: RunCombatant) {
  const pct = displayHp(c) / displayMaxHp(c);
  if (pct <= 0) return "bg-muted-foreground/30";
  if (pct <= 0.25) return "bg-red-500";
  if (pct <= 0.5) return "bg-amber-500";
  return "bg-green-500";
}
function hpLabel(c: RunCombatant): string {
  const pct = displayHp(c) / displayMaxHp(c);
  if (pct <= 0) return "Dead";
  if (pct <= 0.25) return "Bloodied";
  if (pct <= 0.5) return "Wounded";
  if (pct <= 0.75) return "Hurt";
  return "Healthy";
}

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
const { getRating, setRating } = usePlayerNpcRatings();
const selectedNpc = ref<Npc | null>(null);
const selectedNpcId = computed(() => selectedNpc.value?.id ?? "");
const selectedNpcDisplay = computed(() => ({
  name:       selectedNpc.value ? getNpcDisplayName(selectedNpc.value)       : "???",
  portrait:   selectedNpc.value ? getNpcDisplayPortrait(selectedNpc.value)   : null,
  focalPoint: selectedNpc.value ? getNpcDisplayFocalPoint(selectedNpc.value) : null,
}));
const { data: myNpcPcNote } = useMyNpcPcNote(selectedNpcId);

function openNpc(npc: Npc) { selectedNpc.value = npc; }
function closeNpc()        { selectedNpc.value = null; }

// Monster lightbox
const selectedMonsterCombatant = ref<RunCombatant | null>(null);
function openMonster(c: RunCombatant) { selectedMonsterCombatant.value = c; }
function closeMonster()               { selectedMonsterCombatant.value = null; }

function onCombatantClick(combatant: RunCombatant) {
  if (combatant.npc_id) {
    const npc = allNpcs.value?.find((n) => n.id === combatant.npc_id);
    if (npc) openNpc(npc);
    return;
  }
  if (combatant.type === "monster" && !combatant.npc_id && combatant.monster_id) {
    openMonster(combatant);
    return;
  }
  if (combatant.party_member_id || combatant.companion_id) {
    selectedMemberCombatant.value = combatant;
    return;
  }
}

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: "#2563eb", neutral: "#6b7280", enemy: "#dc2626", unknown: "#9333ea",
};
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e", dead: "#ef4444", missing: "#f59e0b", unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus)      { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>

<style scoped>
@reference "@/assets/main.css";

.player-row {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
  border-bottom: 1px solid theme(colors.border / 100%);
  transition: background-color 0.15s;
  min-height: 3rem;
}
.player-row:last-child {
  border-bottom: none;
}

.row-content {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: stretch;
  gap: 0.75rem;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.portrait-cell {
  flex-shrink: 0;
  width: 2.5rem;
  align-self: stretch;
  overflow: hidden;
  display: flex;
}

.portrait-inner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.portrait-active {
  box-shadow: inset 0 0 0 2px #c9a84c;
}

.portrait-initials {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-cinzel, serif);
  font-size: 11px;
  font-weight: 700;
}

.hp-panel {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid theme(colors.border / 60%);
  background: theme(colors.muted / 20%);
}

.hp-panel-input {
  width: 4rem;
  background: theme(colors.background);
  border: 1px solid theme(colors.border);
  border-radius: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-family: var(--font-cinzel, serif);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  color: theme(colors.foreground);
  outline: none;
}
.hp-panel-input:focus {
  border-color: theme(colors.ring);
}
.hp-panel-input::-webkit-inner-spin-button,
.hp-panel-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.hp-panel-btn {
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1px solid;
  transition: background-color 0.15s, color 0.15s;
}
.hp-dmg  { border-color: theme(colors.rose.500 / 40%);  color: theme(colors.rose.500);  }
.hp-dmg:hover  { background: theme(colors.rose.500 / 15%); }
.hp-heal { border-color: theme(colors.green.500 / 40%); color: theme(colors.green.500); }
.hp-heal:hover { background: theme(colors.green.500 / 15%); }
.hp-temp { border-color: theme(colors.sky.400 / 40%);   color: theme(colors.sky.400);   }
.hp-temp:hover { background: theme(colors.sky.400 / 15%); }

.hp-temp-display {
  margin-left: auto;
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  color: theme(colors.sky.400);
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to    { opacity: 0; }

/* ── Compact mode: panel narrower than 200px ─────────────────────────────── */
.round-header-compact { display: none; }

@container (max-width: 200px) {
  .round-header-full    { display: none; }
  .round-header-compact { display: flex; }

  .portrait-cell {
    display: none;
  }

  .player-row {
    min-height: 2rem;
  }

  .row-content {
    padding-top: 0.375rem;
    padding-bottom: 0.375rem;
    gap: 0.375rem;
  }

  .pc-npc-badge {
    display: none;
  }

  /* Color names by type instead of showing the badge */
  .player-row[data-combatant-type="player"] .combatant-name {
    color: #818cf8; /* indigo / primary */
  }
  .player-row[data-combatant-type="monster"] .combatant-name,
  .player-row[data-combatant-type="npc"] .combatant-name {
    color: #b45309; /* amber */
  }
}
</style>
