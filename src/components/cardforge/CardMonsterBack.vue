<template>
  <div class="card-shell" :style="{ '--fc': frameColor }">
    <div class="card-face">
      <!-- Header -->
      <div class="card-header">
        <span class="card-name" :title="data.name">{{ truncateCard(data.name, 20) }}</span>
        <span class="back-label">Stats</span>
      </div>

      <!-- Stats block -->
      <div class="stats-block">
        <template v-if="statsRows.length">
          <div v-for="row in statsRows" :key="row.label" class="stat-row">
            <span class="stat-key">{{ row.label }}</span>
            <span class="stat-val">{{ row.value }}</span>
          </div>
        </template>
        <div v-else class="no-stats">No combat stats</div>
      </div>

      <!-- Abilities divider -->
      <div class="section-header">Abilities &amp; Actions</div>

      <!-- Special abilities + actions -->
      <div class="abilities-block">
        <div v-for="entry in abilityEntries" :key="entry.name" class="ability-entry">
          <span class="ability-name">{{ entry.name }}.</span>
          <span class="ability-desc">{{ truncateCard(entry.description, 120) }}</span>
        </div>
        <div v-if="!abilityEntries.length" class="no-stats">—</div>
      </div>

      <!-- Flavor footer -->
      <div class="flavor-footer">
        <p v-if="data.notes" class="flavor-text">{{ truncateCard(data.notes, 100) }}</p>
        <span v-if="data.habitat" class="location-line">{{ data.habitat }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Monster } from "@/types/monster.types";
import { MONSTER_COLORS, truncateCard, capitalize } from "@/types/card.types";

const props = defineProps<{ data: Monster }>();

const frameColor = computed(() => MONSTER_COLORS[props.data.monster_type] ?? "#1C2A4A");

interface StatRow { label: string; value: string }

const statsRows = computed((): StatRow[] => {
  const sb = props.data.stat_block;
  if (!sb) return [];
  const rows: StatRow[] = [];
  if ("saving_throws" in sb && sb.saving_throws)
    rows.push({ label: "Saves", value: sb.saving_throws });
  if (sb.skills && Object.keys(sb.skills).length) {
    rows.push({
      label: "Skills",
      value: Object.entries(sb.skills)
        .map(([k, v]) => `${capitalize(k)} ${v}`)
        .join(", "),
    });
  }
  if ("damage_vulnerabilities" in sb && sb.damage_vulnerabilities)
    rows.push({ label: "Vuln.", value: sb.damage_vulnerabilities });
  if (sb.damage_resistances) rows.push({ label: "Resist.", value: sb.damage_resistances });
  if (sb.damage_immunities) rows.push({ label: "Immune", value: sb.damage_immunities });
  if (sb.condition_immunities) rows.push({ label: "Cond.", value: sb.condition_immunities });
  if (sb.senses) rows.push({ label: "Senses", value: sb.senses });
  if (sb.languages) rows.push({ label: "Lang.", value: sb.languages });
  return rows;
});

interface Entry { name: string; description: string }

const abilityEntries = computed((): Entry[] => {
  const sb = props.data.stat_block;
  if (!sb) return [];
  const special = (sb.special_abilities ?? []).slice(0, 2);
  const actions = (sb.actions ?? []).slice(0, 2);
  return [...special, ...actions].slice(0, 4);
});
</script>

<style scoped>
.card-shell {
  width: 200px;
  height: 280px;
  border-radius: 10px;
  background: var(--fc, #1c2a4a);
  padding: 4px;
  box-shadow:
    0 6px 24px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.card-face {
  width: 100%;
  height: 100%;
  border-radius: 7px;
  background: #f5f0e6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: "IM Fell English", serif;
}

.card-header {
  background: var(--fc, #1c2a4a);
  color: #e8d89a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  flex-shrink: 0;
  gap: 4px;
}
.card-name {
  font-family: "Cinzel", serif;
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.back-label {
  font-family: "Cinzel", serif;
  font-size: 5.5px;
  font-weight: 600;
  color: rgba(232, 216, 154, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

.stats-block {
  padding: 4px 6px 3px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.stat-row {
  display: flex;
  gap: 3px;
  align-items: baseline;
  line-height: 1.3;
}
.stat-key {
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 700;
  color: #7a6a50;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  min-width: 28px;
}
.stat-val {
  font-size: 5.5px;
  color: #2a2018;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.no-stats {
  font-size: 5.5px;
  color: #9a8a70;
  font-style: italic;
}

.section-header {
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #f5f0e6;
  background: color-mix(in srgb, var(--fc) 70%, #000);
  padding: 2px 6px;
  flex-shrink: 0;
}

.abilities-block {
  padding: 3px 6px;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ability-entry {
  font-size: 5.5px;
  color: #2a2018;
  line-height: 1.4;
}
.ability-name {
  font-family: "Cinzel", serif;
  font-weight: 700;
  font-size: 5.5px;
  margin-right: 1px;
}
.ability-desc {
  color: #3a3028;
}

.flavor-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 3px 6px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--fc) 8%, #f5f0e6);
}
.flavor-text {
  font-size: 5px;
  font-style: italic;
  color: #6a5a40;
  line-height: 1.4;
  margin: 0 0 1px;
}
.location-line {
  font-family: "Cinzel", serif;
  font-size: 5px;
  color: #9a8a70;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

@media print {
  .card-shell {
    display: flex;
    flex-direction: column;
    width: 63mm;
    height: 88mm;
    border-radius: 3mm;
    padding: 1.5mm;
    box-shadow: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .card-face {
    flex: 1;
    height: auto;
    border-radius: 2mm;
  }
  .card-name {
    font-size: 2.5mm;
  }
  .back-label {
    font-size: 1.8mm;
  }
  .stat-key {
    font-size: 1.6mm;
    min-width: 8mm;
  }
  .stat-val {
    font-size: 1.8mm;
  }
  .section-header {
    font-size: 1.6mm;
    padding: 0.8mm 2mm;
  }
  .ability-name {
    font-size: 1.8mm;
  }
  .ability-desc {
    font-size: 1.7mm;
  }
  .flavor-text {
    font-size: 1.6mm;
  }
  .location-line {
    font-size: 1.6mm;
  }
}
</style>
