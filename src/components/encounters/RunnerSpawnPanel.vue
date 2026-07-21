<template>
  <div class="spawn-panel">
    <div class="spawn-header" @click="showForm = !showForm">
      <span class="spawn-title">⚔ SPAWN COMBATANT</span>
      <span class="spawn-toggle">{{ showForm ? '▲' : '▼' }}</span>
    </div>
    <template v-if="showForm">
      <div class="spawn-tabs">
        <button class="spawn-tab" :class="{ 'spawn-tab-active': tab === 'monster' }" @click.stop="tab = 'monster'">Monster</button>
        <button class="spawn-tab" :class="{ 'spawn-tab-active': tab === 'npc' }" @click.stop="tab = 'npc'">NPC</button>
      </div>
      <div class="spawn-form">
        <EntityCombobox
          v-model="entityId"
          :options="tab === 'monster' ? monsterOptions : npcOptions"
          :placeholder="tab === 'monster' ? 'Search monsters…' : 'Search NPCs…'"
          class="spawn-combobox"
        />
        <div class="spawn-controls">
          <div class="spawn-field spawn-faction-field">
            <label class="spawn-label">Faction</label>
            <EntityCombobox
              v-model="factionId"
              :options="factionOptions"
              placeholder="Faction…"
            />
          </div>
          <div class="spawn-field">
            <label class="spawn-label">Count</label>
            <input v-model.number="count" type="number" min="1" max="20" class="spawn-count-input" />
          </div>
          <button class="spawn-add-btn" :disabled="!entityId" @click="handleAdd">+ Add</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const store = useEncounterRunStore();

const showForm = ref(true);
const tab = ref<"monster" | "npc">("monster");
const entityId = ref("");
const factionId = ref("enemy");
const count = ref(1);

const factionOptions = computed(() =>
  store.factions.map((f) => ({ id: f.id, name: f.name })),
);

const monsterOptions = computed(() =>
  (store.availableMonsters ?? []).map((m) => ({ id: m.id, name: m.name })),
);

const npcOptions = computed(() =>
  (store.availableNpcs ?? [])
    .filter((n) => !!n.stat_block)
    .map((n) => ({ id: n.id, name: n.name })),
);

function handleAdd() {
  if (!entityId.value) return;
  if (tab.value === "monster") {
    store.addMonster(entityId.value, factionId.value, count.value);
  } else {
    store.addNpc(entityId.value, factionId.value, count.value);
  }
  entityId.value = "";
}
</script>

<style scoped>
@reference "@/assets/main.css";

.spawn-panel {
  border-top: 1px solid theme(colors.border / 60%);
  flex-shrink: 0;
}

.spawn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: theme(colors.muted / 20%);
  cursor: pointer;
  user-select: none;
  gap: 0.5rem;
}
.spawn-header:hover {
  background: theme(colors.muted / 40%);
}

.spawn-title {
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 700;
  color: theme(colors.muted-foreground / 100%);
  letter-spacing: 0.1em;
}

.spawn-toggle {
  font-size: 0.625rem;
  color: theme(colors.muted-foreground / 100%);
}

.spawn-tabs {
  display: flex;
  border-bottom: 1px solid theme(colors.border / 100%);
}
.spawn-tab {
  flex: 1;
  padding: 0.3rem 0.5rem;
  font-family: var(--font-cinzel, serif);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: theme(colors.muted-foreground / 100%);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.spawn-tab:hover {
  color: theme(colors.foreground / 100%);
  background: theme(colors.muted / 30%);
}
.spawn-tab-active {
  color: theme(colors.foreground / 100%);
  background: theme(colors.muted / 30%);
  border-bottom: 2px solid theme(colors.primary / 100%);
}

/* Horizontal layout in the wider main area */
.spawn-form {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  flex-wrap: wrap;
}

.spawn-combobox {
  flex: 1;
  min-width: 11.25rem;
}

.spawn-controls {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.spawn-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.spawn-label {
  font-family: var(--font-cinzel, serif);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: theme(colors.muted-foreground / 100%);
  white-space: nowrap;
}

.spawn-faction-field {
  min-width: 10rem;
}

.spawn-count-input {
  width: 3rem;
  background: theme(colors.muted / 30%);
  border: 1px solid theme(colors.border / 100%);
  border-radius: 0.25rem;
  padding: 0.2rem 0.375rem;
  font-family: var(--font-cinzel, serif);
  font-size: 0.6875rem;
  font-weight: 700;
  color: theme(colors.foreground / 100%);
  text-align: center;
  outline: none;
}

.spawn-add-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  border: 1px solid theme(colors.border / 100%);
  background: theme(colors.muted / 40%);
  color: theme(colors.foreground / 100%);
  font-family: var(--font-cinzel, serif);
  font-size: 0.6875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.spawn-add-btn:hover:not(:disabled) {
  border-color: theme(colors.primary / 60%);
  color: theme(colors.primary / 100%);
  background: theme(colors.muted / 60%);
}
.spawn-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
