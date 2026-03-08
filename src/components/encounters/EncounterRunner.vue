<template>
  <div class="runner-root">
    <!-- Top bar -->
    <div class="runner-topbar">
      <RouterLink :to="`/encounters/${encounterId}`" class="back-link">
        ← Back to Builder
      </RouterLink>

      <div class="round-controls">
        <button @click="store.prevTurn()" :disabled="!store.started" class="prev-btn">‹</button>
        <span class="round-label">Round {{ store.round }}</span>
        <button @click="store.nextTurn()" :disabled="!store.started" class="next-btn">Next Turn ›</button>
      </div>

      <div class="top-right">
        <span class="encounter-name">{{ store.encounterName }}</span>
        <button v-if="!store.started" @click="store.rollAllInitiatives()" class="roll-btn">
          ⚄ Roll Initiative
        </button>
        <button @click="handleEndCombat" class="end-btn">End Combat</button>
      </div>
    </div>

    <!-- Initiative list -->
    <div class="runner-body">
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
        }"
        :style="{ '--faction-color': factionColor(combatant.faction_id) }"
      >
        <!-- Faction strip -->
        <div class="faction-strip" />

        <!-- Initiative -->
        <div class="init-cell">
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
          <span class="type-badge" :class="combatant.type">{{ combatant.type === 'player' ? 'PC' : 'NPC' }}</span>
          <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
        </div>

        <!-- HP -->
        <div class="hp-cell">
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
          <!-- HP bar -->
          <div class="hp-bar-bg">
            <div
              class="hp-bar-fill"
              :style="{ width: hpPct(combatant) + '%', backgroundColor: hpColor(combatant) }"
            />
          </div>
        </div>

        <!-- AC -->
        <div class="ac-cell">
          <span class="ac-value">{{ combatant.ac }}</span>
        </div>

        <!-- Conditions -->
        <div class="conditions-cell">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { CONDITIONS } from "@/types/party.types";
import type { RunCombatant } from "@/types/encounter.types";

const store = useEncounterRunStore();
const router = useRouter();
const route = useRoute();
const encounterId = computed(() => route.params.id as string);

const addingCondFor = ref<string | null>(null);

function factionColor(factionId: string): string {
  return store.factions.find((f) => f.id === factionId)?.color ?? "#3D3D3D";
}

function hpPct(c: RunCombatant): number {
  return c.max_hp > 0 ? Math.round((c.hp / c.max_hp) * 100) : 0;
}

function hpColor(c: RunCombatant): string {
  const pct = hpPct(c);
  if (pct > 60) return "#16A34A";
  if (pct > 30) return "#CA8A04";
  return "#DC2626";
}

function availableConditions(c: RunCombatant): string[] {
  return CONDITIONS.filter((cond) => !c.conditions.includes(cond));
}

function handleEndCombat() {
  if (confirm("End combat and return to encounter builder?")) {
    store.reset();
    router.push(`/encounters/${encounterId.value}`);
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

.runner-root {
  @apply flex flex-col h-full min-h-0;
}

.runner-topbar {
  @apply flex items-center gap-4 px-4 py-3 border-b border-border bg-card flex-shrink-0 flex-wrap;
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

.roll-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity;
}

.end-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive font-cinzel text-xs font-semibold hover:bg-destructive/10 transition-colors;
}

.runner-body {
  @apply flex-1 overflow-y-auto;
}

.combatant-header {
  display: grid;
  grid-template-columns: 1rem 3.5rem 1fr 9rem 3rem 1fr;
  gap: 0.5rem;
  @apply px-4 py-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground border-b border-border bg-muted/30 items-center;
}

.combatant-row {
  display: grid;
  grid-template-columns: 1rem 3.5rem 1fr 9rem 3rem 1fr;
  gap: 0.5rem;
  @apply px-2 py-2 border-b border-border/50 items-center relative transition-colors hover:bg-muted/20;
}

.combatant-row.is-active {
  @apply bg-primary/10 ring-1 ring-primary/20 ring-inset;
}

.combatant-row.is-dead {
  @apply opacity-40;
}

.faction-strip {
  @apply absolute left-0 top-0 bottom-0 w-1 rounded-r;
  background-color: var(--faction-color);
}

.init-cell {
  @apply flex items-center justify-center;
}

.init-input {
  @apply w-10 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.name-cell {
  @apply flex items-center gap-1.5 min-w-0 flex-wrap;
}

.combatant-name {
  @apply font-cinzel text-sm font-semibold text-foreground;
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

.hp-cell {
  @apply flex items-center gap-1 relative;
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
</style>
