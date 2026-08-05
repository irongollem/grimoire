<template>
  <!-- Events panel: always mounted while a run is on screen (RunnerDmTools only
       renders inside an active EncounterRunner) — the generator buttons need to
       be reachable before any event exists, which is the common mid-fight case. -->
  <div class="events-panel">
    <div class="events-header">
      <span class="events-title">EVENTS</span>
      <div class="events-actions">
        <button
          type="button"
          class="gen-btn"
          title="Generate a mid-fight complication"
          @click="openGenerator('complication')"
        >
          <IconWarning class="h-3 w-3" />
          Complication
        </button>
        <button
          type="button"
          class="gen-btn"
          title="Generate reinforcements"
          @click="openGenerator('reinforcements')"
        >
          <IconMonster class="h-3 w-3" />
          Reinforce
        </button>
      </div>
    </div>
    <div v-if="store.events.length" class="events-list">
      <div
        v-for="event in store.events"
        :key="event.id"
        class="event-row"
        :class="store.eventsFired.includes(event.id) ? 'event-fired' : 'event-pending'"
      >
        <div class="event-info">
          <span class="event-name">{{ event.name }}</span>
          <span class="event-trigger">{{ triggerLabel(event.trigger) }}</span>
        </div>
        <div class="event-badges">
          <span v-if="store.eventsFired.includes(event.id)" class="badge-fired">Fired</span>
          <span v-else class="badge-pending">Pending</span>
        </div>
        <button
          v-if="!store.eventsFired.includes(event.id) || !event.fire_once"
          class="fire-btn"
          :title="event.trigger.type === 'manual' ? 'Fire this event' : 'Force fire'"
          @click="store.fireEvent(event.id)"
        >▶</button>
      </div>
    </div>
    <p v-else class="events-empty">No events yet.</p>

    <!-- Standing hazards from fired environment_effect actions (#604) — derived,
         see store.activeEnvironmentEffects. -->
    <div v-if="store.activeEnvironmentEffects.length" class="hazards-panel">
      <div class="hazards-header">
        <span class="hazards-title">⚠ IN PLAY</span>
      </div>
      <div class="hazards-list">
        <div
          v-for="(effect, i) in store.activeEnvironmentEffects"
          :key="i"
          class="hazard-row"
        >
          <span class="hazard-label">{{ effect.label }}</span>
          <span class="hazard-desc">{{ effect.description }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Traps column (only shown when encounter has traps) -->
  <div v-if="store.traps.length" class="side-column">
    <div class="traps-panel">
      <div class="traps-header">
        <span class="traps-title">⚠ TRAPS</span>
      </div>
      <div class="traps-list">
        <div
          v-for="trap in store.traps"
          :key="trap.id"
          class="trap-row"
          :class="{ 'trap-selected': selectedTrapId === trap.id }"
          :style="{ '--trap-color': trapTypeColor(trap.trap_type) }"
          @click="toggleTrapDetail(trap.id)"
        >
          <div class="trap-info">
            <span class="trap-name">{{ trap.name }}</span>
            <span class="trap-type" :style="{ color: trapTypeColor(trap.trap_type) }">{{ trap.trap_type }}</span>
            <span v-if="trap.trigger_type" class="trap-trigger">{{ trap.trigger_type }}</span>
          </div>
          <div class="trap-badges">
            <span v-if="trap.save_dc" class="trap-badge">DC {{ trap.save_dc }}</span>
            <span v-if="trap.damage_entries?.length" class="trap-badge">{{ trap.damage_entries.map(e => e.dice).join('+') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ComplicationGeneratorDialog v-model="generatorOpen" :mode="generatorMode" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { TRAP_TYPE_COLORS } from "@/types/trap.types";
import { IconMonster, IconWarning } from "@/lib/icons";
import ComplicationGeneratorDialog from "./ComplicationGeneratorDialog.vue";
import type { ComplicationMode } from "@/ai/useComplicationGeneration";

const selectedTrapId = defineModel<string | null>("selectedTrapId", { required: true });

const store = useEncounterRunStore();

const generatorOpen = ref(false);
const generatorMode = ref<ComplicationMode>("complication");

function openGenerator(mode: ComplicationMode) {
  generatorMode.value = mode;
  generatorOpen.value = true;
}

function triggerLabel(trigger: import("@/types/encounter.types").EventTrigger): string {
  if (trigger.type === "round_start") return `Round ${trigger.round} start`;
  if (trigger.type === "combatant_hp_pct") return `HP ≤ ${trigger.pct}%`;
  if (trigger.type === "combatant_dies") return "On death";
  return "Manual";
}

function trapTypeColor(trapType: string): string {
  return TRAP_TYPE_COLORS[trapType as keyof typeof TRAP_TYPE_COLORS] ?? "#3D3D3D";
}

function toggleTrapDetail(id: string) {
  selectedTrapId.value = selectedTrapId.value === id ? null : id;
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* ── Events panel ─────────────────────────────────────────────────────────── */

.events-panel {
  width: 12.5rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid theme(colors.border / 100%);
  overflow: hidden;
}
.events-header {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 100%);
  background: theme(colors.muted / 20%);
}
.events-title {
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 700;
  color: theme(colors.muted-foreground / 100%);
  letter-spacing: 0.1em;
}
.events-actions {
  display: flex;
  gap: 0.25rem;
}
.gen-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  font-family: var(--font-cinzel, serif);
  font-size: 0.5625rem;
  font-weight: 600;
  padding: 0.1875rem 0.25rem;
  border-radius: 0.1875rem;
  border: 1px solid theme(colors.border / 100%);
  background: transparent;
  color: theme(colors.muted-foreground / 100%);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.gen-btn:hover {
  border-color: theme(colors.primary / 50%);
  color: theme(colors.primary / 100%);
}
.events-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.events-empty {
  padding: 0.75rem;
  font-family: var(--font-fell, serif);
  font-size: 0.625rem;
  color: theme(colors.muted-foreground / 70%);
  font-style: italic;
}
.event-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 60%);
}
.event-row:last-child { border-bottom: none; }
.event-fired { opacity: 0.5; }
.event-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}
.event-name {
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 600;
  color: theme(colors.foreground / 100%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-trigger {
  font-family: var(--font-fell, serif);
  font-size: 0.625rem;
  color: theme(colors.muted-foreground / 100%);
}
.event-badges { display: flex; }
.badge-fired {
  font-family: var(--font-cinzel, serif);
  font-size: 0.5625rem;
  padding: 0.0625rem 0.25rem;
  border-radius: 0.1875rem;
  background: rgba(22, 163, 74, 0.15);
  color: #16a34a;
}
.badge-pending {
  font-family: var(--font-cinzel, serif);
  font-size: 0.5625rem;
  padding: 0.0625rem 0.25rem;
  border-radius: 0.1875rem;
  background: rgba(202, 138, 4, 0.15);
  color: #ca8a04;
}
.fire-btn {
  font-size: 0.625rem;
  padding: 0.125rem 0.3125rem;
  border-radius: 0.1875rem;
  border: 1px solid theme(colors.border / 100%);
  background: transparent;
  color: theme(colors.muted-foreground / 100%);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.fire-btn:hover {
  border-color: theme(colors.primary / 50%);
  color: theme(colors.primary / 100%);
}

/* ── Standing hazards ("IN PLAY") ─────────────────────────────────────────── */

.hazards-panel {
  flex-shrink: 0;
  max-height: 8rem;
  overflow-y: auto;
  border-top: 1px solid theme(colors.border / 100%);
}
.hazards-header {
  padding: 0.375rem 0.75rem;
  background: rgba(202, 138, 4, 0.08);
}
.hazards-title {
  font-family: var(--font-cinzel, serif);
  font-size: 0.5625rem;
  font-weight: 700;
  color: #ca8a04;
  letter-spacing: 0.1em;
}
.hazards-list {
  display: flex;
  flex-direction: column;
}
.hazard-row {
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 60%);
}
.hazard-row:last-child { border-bottom: none; }
.hazard-label {
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 600;
  color: theme(colors.foreground / 100%);
}
.hazard-desc {
  font-family: var(--font-fell, serif);
  font-size: 0.625rem;
  color: theme(colors.muted-foreground / 100%);
}

/* ── Traps panel ──────────────────────────────────────────────────────────── */

.traps-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}
.traps-header {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 100%);
  background: theme(colors.muted / 20%);
}
.traps-title {
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 700;
  color: theme(colors.muted-foreground / 100%);
  letter-spacing: 0.1em;
}
.traps-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.trap-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 60%);
  border-left: 3px solid var(--trap-color, #3D3D3D);
  cursor: pointer;
  transition: background 0.1s;
}
.trap-row:hover { background: theme(colors.muted / 20%); }
.trap-row.trap-selected { background: theme(colors.muted / 40%); }
.trap-row:last-child { border-bottom: none; }
.trap-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}
.trap-name {
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 600;
  color: theme(colors.foreground / 100%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trap-type {
  font-family: var(--font-fell, serif);
  font-size: 0.625rem;
  font-weight: 500;
}
.trap-trigger {
  font-family: var(--font-fell, serif);
  font-size: 0.5625rem;
  color: theme(colors.muted-foreground / 100%);
}
.trap-badges {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  font-family: var(--font-cinzel, serif);
  font-size: 0.5625rem;
}
.trap-badge {
  padding: 0.0625rem 0.25rem;
  border-radius: 0.1875rem;
  background: theme(colors.muted / 30%);
  color: theme(colors.muted-foreground / 100%);
  white-space: nowrap;
}

/* ── Shared right sidebar column (traps + spawn) ──────────────────────────── */

.side-column {
  width: 12.5rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid theme(colors.border / 100%);
  overflow: hidden;
}

</style>
