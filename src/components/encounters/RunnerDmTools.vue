<template>
  <!-- Events panel (shown if any events exist) -->
  <div v-if="store.events.length" class="events-panel">
    <div class="events-header">
      <span class="events-title">EVENTS</span>
    </div>
    <div class="events-list">
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
          :class="{ 'trap-selected': props.selectedTrapId === trap.id }"
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
</template>

<script setup lang="ts">
import { useEncounterRunStore } from "@/stores/encounterRun";
import { TRAP_TYPE_COLORS } from "@/types/trap.types";

const props = defineProps<{
  selectedTrapId: string | null;
}>();

const emit = defineEmits<{
  "update:selectedTrapId": [id: string | null];
}>();

const store = useEncounterRunStore();

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
  if (props.selectedTrapId === id) {
    emit("update:selectedTrapId", null);
  } else {
    emit("update:selectedTrapId", id);
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* ── Events panel ─────────────────────────────────────────────────────────── */

.events-panel {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid theme(colors.border / 100%);
  overflow: hidden;
}
.events-header {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 100%);
  background: theme(colors.muted / 20%);
}
.events-title {
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  color: theme(colors.muted-foreground / 100%);
  letter-spacing: 0.1em;
}
.events-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
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
  gap: 1px;
}
.event-name {
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 600;
  color: theme(colors.foreground / 100%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-trigger {
  font-family: var(--font-fell, serif);
  font-size: 10px;
  color: theme(colors.muted-foreground / 100%);
}
.event-badges { display: flex; }
.badge-fired {
  font-family: var(--font-cinzel, serif);
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(22, 163, 74, 0.15);
  color: #16a34a;
}
.badge-pending {
  font-family: var(--font-cinzel, serif);
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(202, 138, 4, 0.15);
  color: #ca8a04;
}
.fire-btn {
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
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
  font-size: 10px;
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
  gap: 1px;
}
.trap-name {
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 600;
  color: theme(colors.foreground / 100%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trap-type {
  font-family: var(--font-fell, serif);
  font-size: 10px;
  font-weight: 500;
}
.trap-trigger {
  font-family: var(--font-fell, serif);
  font-size: 9px;
  color: theme(colors.muted-foreground / 100%);
}
.trap-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  font-family: var(--font-cinzel, serif);
  font-size: 9px;
}
.trap-badge {
  padding: 1px 4px;
  border-radius: 3px;
  background: theme(colors.muted / 30%);
  color: theme(colors.muted-foreground / 100%);
  white-space: nowrap;
}

/* ── Shared right sidebar column (traps + spawn) ──────────────────────────── */

.side-column {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid theme(colors.border / 100%);
  overflow: hidden;
}

</style>
