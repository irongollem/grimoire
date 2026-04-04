<template>
  <!-- Column headers -->
  <div class="combatant-header">
    <span></span>
    <span>INIT</span>
    <span>NAME</span>
    <span>HP</span>
    <span>AC</span>
    <span>CONDITIONS</span>
  </div>

  <!-- Combatant rows -->
  <div
    v-for="combatant in store.sortedCombatants"
    :key="combatant.instance_id"
    class="combatant-row"
    :class="{
      'is-active': store.started && combatant.instance_id === store.activeCombatant?.instance_id,
      'is-dead': combatant.type === 'monster' && combatant.hp === 0,
      'is-selected': combatant.instance_id === props.selectedId,
    }"
    :style="{ '--faction-color': factionColor(combatant.faction_id) }"
    @click="toggleDetail(combatant.instance_id)"
  >
    <!-- Avatar + reveal toggle (monsters only) -->
    <div class="avatar-cell" @click.stop="toggleDetail(combatant.instance_id)">
      <div
        class="avatar-inner"
        :class="store.started && combatant.instance_id === store.activeCombatant?.instance_id ? 'avatar-active' : ''"
      >
        <FocalImage
          v-if="combatant.portrait_url"
          :src="combatant.portrait_url"
          :alt="combatant.name"
          :focal-point="combatant.portrait_focal_point ?? null"
          format="square"
        />
        <div v-else class="avatar-initials" :style="{ backgroundColor: factionColor(combatant.faction_id) + '44', color: factionColor(combatant.faction_id) }">
          {{ combatantInitials(combatant) }}
        </div>
        <button
          v-if="combatant.type === 'monster'"
          type="button"
          class="reveal-btn"
          :class="revealBtnClass(combatant.reveal_state)"
          :title="revealBtnTitle(combatant.reveal_state)"
          @click.stop="store.cycleRevealState(combatant.instance_id)"
        >
          <EyeOff v-if="combatant.reveal_state === 'hidden'" class="h-2.5 w-2.5" />
          <Eye v-else-if="combatant.reveal_state === 'unseen'" class="h-2.5 w-2.5" />
          <Eye v-else class="h-2.5 w-2.5" />
        </button>
      </div>
    </div>

    <!-- Initiative -->
    <div class="init-cell" @click.stop>
      <input
        type="number"
        :value="combatant.initiative ?? ''"
        placeholder="—"
        class="init-input"
        @change="(e) => store.setInitiative(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
      />
    </div>

    <!-- Name + type badge -->
    <div class="name-cell">
      <span class="combatant-name">{{ combatant.name }}</span>
      <span class="type-badge" :class="combatant.type">{{ combatant.type === 'player' ? 'PC' : combatant.npc_id ? 'NPC' : 'Monster' }}</span>
      <span v-if="combatant.wildshape" class="wildshape-row-badge" title="Wildshaping">🐺 {{ combatant.wildshape.beast_name }}</span>
      <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
    </div>

    <!-- HP -->
    <div class="hp-cell" @click.stop>
      <button class="hp-btn" @click="store.adjustHp(combatant.instance_id, -1)">−</button>
      <input
        type="number"
        :value="combatant.hp"
        min="0"
        :max="combatant.max_hp"
        class="hp-input"
        @change="(e) => store.setHp(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
      />
      <span class="hp-max">/ {{ combatant.max_hp }}</span>
      <button class="hp-btn" @click="store.adjustHp(combatant.instance_id, 1)">+</button>
    </div>

    <!-- AC -->
    <div class="ac-cell">
      <span class="ac-value">{{ combatant.ac }}</span>
    </div>

    <!-- Conditions -->
    <div class="conditions-cell" @click.stop>
      <span
        v-for="cond in combatant.conditions"
        :key="cond"
        class="cond-badge"
        @click="store.toggleCondition(combatant.instance_id, cond)"
        title="Click to remove"
      >{{ cond }} ×</span>
      <div class="relative" v-if="addingCondFor !== combatant.instance_id">
        <button class="add-cond-btn" @click="addingCondFor = combatant.instance_id">+</button>
      </div>
      <div v-else class="cond-picker">
        <select
          size="5"
          class="cond-select"
          @change="(e) => { store.toggleCondition(combatant.instance_id, (e.target as HTMLSelectElement).value); addingCondFor = null }"
          @blur="addingCondFor = null"
        >
          <option v-for="c in availableConditions(combatant)" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
    </div>
  </div>

  <p v-if="!store.sortedCombatants.length" class="empty-runner">
    No combatants. Go back to the builder to add monsters and party members.
  </p>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Eye, EyeOff } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { CONDITIONS } from "@/types/party.types";
import type { RunCombatant, RevealState } from "@/types/encounter.types";

const props = defineProps<{
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string | null];
}>();

const store = useEncounterRunStore();
const addingCondFor = ref<string | null>(null);

function toggleDetail(instanceId: string) {
  if (props.selectedId === instanceId) {
    emit("select", null);
  } else {
    emit("select", instanceId);
  }
}

function factionColor(factionId: string): string {
  return store.factions.find((f) => f.id === factionId)?.color ?? "#3D3D3D";
}

function availableConditions(c: RunCombatant): string[] {
  return CONDITIONS.filter((cond) => !c.conditions.includes(cond));
}

function combatantInitials(c: RunCombatant): string {
  return c.name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

function revealBtnClass(state: RevealState | undefined) {
  if (state === "revealed") return "reveal-revealed";
  if (state === "unseen")   return "reveal-unseen";
  return "reveal-hidden";
}

function revealBtnTitle(state: RevealState | undefined) {
  if (state === "revealed") return "Revealed — click to hide";
  if (state === "unseen")   return "Unseen — click to reveal";
  return "Hidden — click to show slot";
}
</script>

<style scoped>
@reference "@/assets/main.css";

.combatant-header {
  display: grid;
  grid-template-columns: 2.5rem 3.5rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pr-3 py-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground border-b border-border bg-muted/30 items-center;
}

/* INIT = col 2, HP = col 4, AC = col 5 */
.combatant-header span:nth-child(2),
.combatant-header span:nth-child(4),
.combatant-header span:nth-child(5) {
  @apply text-center;
}

.combatant-row {
  display: grid;
  grid-template-columns: 2.5rem 3.5rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pr-3 py-0 border-b border-border/50 items-stretch relative transition-colors hover:bg-muted/20 cursor-pointer;
}

.combatant-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background-color: var(--faction-color);
}

.combatant-row.is-active {
  @apply bg-primary/10 ring-1 ring-primary/20 ring-inset;
}

.combatant-row.is-dead {
  @apply opacity-40;
}

.combatant-row.is-selected {
  @apply bg-muted/40;
}

.avatar-cell {
  align-self: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  display: flex;
}

.avatar-inner {
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-active {
  box-shadow: inset 0 0 0 2px #C9A84C;
}

.avatar-initials {
  @apply w-full h-full flex items-center justify-center font-cinzel text-[11px] font-bold;
}

/* Reveal state overlay button on avatar */
.reveal-btn {
  @apply absolute bottom-0 right-0 flex items-center justify-center w-4 h-4 rounded-tl text-[10px] transition-colors;
}
.reveal-hidden  { @apply bg-muted/80 text-muted-foreground hover:bg-amber-500/80 hover:text-white; }
.reveal-unseen  { @apply bg-amber-500/80 text-white hover:bg-green-500/80; }
.reveal-revealed { @apply bg-green-500/80 text-white hover:bg-muted/80 hover:text-muted-foreground; }

/* re-center all non-avatar cells */
.init-cell,
.name-cell,
.hp-cell,
.ac-cell,
.conditions-cell {
  @apply self-center;
}

.init-cell {
  @apply flex items-center justify-center;
}

.init-input {
  @apply w-10 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.name-cell {
  @apply flex items-center gap-1.5 min-w-0 flex-wrap cursor-pointer select-none;
}

.combatant-name {
  @apply font-cinzel text-sm font-semibold text-foreground hover:text-primary transition-colors;
}

.type-badge {
  @apply font-cinzel text-[9px] font-bold px-1.5 py-0.5 rounded uppercase;
}

.type-badge.player {
  @apply bg-primary/20 text-primary;
}

.type-badge.monster {
  @apply bg-muted text-muted-foreground;
}

.dead-badge {
  @apply text-destructive text-xs;
}

.wildshape-row-badge {
  @apply font-fell text-[10px] text-amber-400 italic ml-1;
}

.hp-cell {
  @apply flex items-center justify-center gap-1 relative;
}

.hp-btn {
  @apply w-6 h-6 rounded bg-muted border border-border font-cinzel font-bold text-sm flex items-center justify-center hover:bg-card transition-colors;
}

.hp-input {
  @apply w-12 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.hp-max {
  @apply font-cinzel text-xs text-muted-foreground;
}

.hp-bar-bg {
  @apply absolute bottom-0 left-0 right-0 h-0.5 bg-muted/60 rounded overflow-hidden;
  display: none;
}

.ac-cell {
  @apply flex items-center justify-center;
}

.ac-value {
  @apply font-cinzel text-sm font-bold text-foreground text-center;
}

.conditions-cell {
  @apply flex items-center flex-wrap gap-1;
}

.cond-badge {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors;
}

.add-cond-btn {
  @apply w-5 h-5 rounded-full border border-dashed border-border text-muted-foreground font-cinzel text-xs flex items-center justify-center hover:border-primary hover:text-primary transition-colors;
}

.cond-picker {
  @apply relative;
}

.cond-select {
  @apply absolute z-10 bg-card border border-border rounded shadow-lg font-fell text-xs text-foreground focus:outline-none;
  min-width: 120px;
  top: 0;
  left: 0;
}

.empty-runner {
  @apply text-center font-fell text-sm text-muted-foreground italic py-16;
}

/* ── Mobile: drop CONDITIONS column, compact HP ───────────────────────────── */
@media (max-width: 639px) {
  .combatant-header,
  .combatant-row {
    grid-template-columns: 2rem 2.5rem 1fr 7rem 2rem;
  }

  /* Hide the CONDITIONS header (6th span) and conditions cells */
  .combatant-header span:nth-child(6),
  .conditions-cell {
    display: none;
  }

  /* Hide "/ max_hp" text to keep HP cell tight */
  .hp-max {
    display: none;
  }

  /* Compact HP buttons */
  .hp-btn {
    @apply w-5 h-5 text-xs;
  }

  /* Compact init input */
  .init-input {
    @apply w-8 text-xs;
  }

  /* Compact avatar */
  .avatar-cell,
  .avatar-inner {
    width: 2rem;
    height: 2rem;
  }
}
</style>
