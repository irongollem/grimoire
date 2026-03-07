<template>
  <div class="card-shell" :style="{ '--fc': frameColor }">
    <div class="card-face">
      <!-- Header -->
      <div class="card-header">
        <span class="card-name" :title="name">{{ truncate(name, 20) }}</span>
        <span class="back-label">Stats</span>
      </div>

      <!-- Stats block (saves, skills, immunities etc.) -->
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
        <div
          v-for="entry in abilityEntries"
          :key="entry.name"
          class="ability-entry"
        >
          <span class="ability-name">{{ entry.name }}.</span>
          <span class="ability-desc">{{ truncate(entry.description, 120) }}</span>
        </div>
        <div v-if="!abilityEntries.length" class="no-stats">—</div>
      </div>

      <!-- Flavor footer -->
      <div class="flavor-footer">
        <p v-if="flavorText" class="flavor-text">{{ truncate(flavorText, 100) }}</p>
        <span v-if="locationLine" class="location-line">{{ locationLine }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CardSubject } from './CardFront.vue'

const props = defineProps<{ subject: CardSubject }>()

const MONSTER_COLORS: Record<string, string> = {
  aberration: '#3D1A5C', beast: '#1A3D1A', celestial: '#1A2A5C',
  construct: '#3D3328', dragon: '#6B1C1C', elemental: '#5C3A1A',
  fey: '#1A3D3A', fiend: '#4A1414', giant: '#3D2B1A',
  humanoid: '#1C2A4A', monstrosity: '#3A3D1A', ooze: '#1A3D2C',
  plant: '#1A3D1A', undead: '#252535',
}
const NPC_COLORS: Record<string, string> = {
  ally: '#1C2A4A', enemy: '#4A1414', neutral: '#333344', unknown: '#252535',
}

const frameColor = computed(() => {
  if (props.subject.kind === 'monster') return MONSTER_COLORS[props.subject.data.monster_type] ?? '#1C2A4A'
  return NPC_COLORS[props.subject.data.relationship] ?? '#333344'
})

const name = computed(() => props.subject.data.name)

interface StatRow { label: string; value: string }

const statsRows = computed((): StatRow[] => {
  const sb = props.subject.data.stat_block
  if (!sb) return []
  const rows: StatRow[] = []
  if ('saving_throws' in sb && sb.saving_throws) rows.push({ label: 'Saves', value: sb.saving_throws })
  if (sb.skills && Object.keys(sb.skills).length) {
    rows.push({ label: 'Skills', value: Object.entries(sb.skills).map(([k, v]) => `${capitalize(k)} ${v}`).join(', ') })
  }
  if ('damage_vulnerabilities' in sb && sb.damage_vulnerabilities) rows.push({ label: 'Vuln.', value: sb.damage_vulnerabilities })
  if (sb.damage_resistances) rows.push({ label: 'Resist.', value: sb.damage_resistances })
  if (sb.damage_immunities) rows.push({ label: 'Immune', value: sb.damage_immunities })
  if (sb.condition_immunities) rows.push({ label: 'Cond.', value: sb.condition_immunities })
  if (sb.senses) rows.push({ label: 'Senses', value: sb.senses })
  if (sb.languages) rows.push({ label: 'Lang.', value: sb.languages })
  return rows
})

interface Entry { name: string; description: string }

const abilityEntries = computed((): Entry[] => {
  const sb = props.subject.data.stat_block
  if (!sb) return []
  const special = (sb.special_abilities ?? []).slice(0, 2)
  const actions = (sb.actions ?? []).slice(0, 2)
  const all = [...special, ...actions]
  return all.slice(0, 4)
})

const flavorText = computed(() => {
  if (props.subject.kind === 'npc') {
    return props.subject.data.personality ?? props.subject.data.backstory
  }
  return props.subject.data.notes
})

const locationLine = computed(() => {
  if (props.subject.kind === 'npc') {
    return props.subject.data.location
  }
  return props.subject.data.habitat
})

function truncate(str: string | null | undefined, len: number) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len - 1) + '…' : str
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
</script>

<style scoped>
.card-shell {
  width: 200px;
  height: 280px;
  border-radius: 10px;
  background: var(--fc, #1C2A4A);
  padding: 4px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.card-face {
  width: 100%;
  height: 100%;
  border-radius: 7px;
  background: #F5F0E6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'IM Fell English', serif;
}

/* Header */
.card-header {
  background: var(--fc, #1C2A4A);
  color: #E8D89A;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  flex-shrink: 0;
  gap: 4px;
}
.card-name {
  font-family: 'Cinzel', serif;
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.back-label {
  font-family: 'Cinzel', serif;
  font-size: 5.5px;
  font-weight: 600;
  color: rgba(232, 216, 154, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

/* Stats block */
.stats-block {
  padding: 4px 6px 3px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0,0,0,0.1);
}
.stat-row {
  display: flex;
  gap: 3px;
  align-items: baseline;
  line-height: 1.3;
}
.stat-key {
  font-family: 'Cinzel', serif;
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

/* Section header */
.section-header {
  font-family: 'Cinzel', serif;
  font-size: 5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #F5F0E6;
  background: color-mix(in srgb, var(--fc) 70%, #000);
  padding: 2px 6px;
  flex-shrink: 0;
}

/* Abilities */
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
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 5.5px;
  margin-right: 1px;
}
.ability-desc {
  color: #3a3028;
}

/* Flavor footer */
.flavor-footer {
  border-top: 1px solid rgba(0,0,0,0.1);
  padding: 3px 6px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--fc) 8%, #F5F0E6);
}
.flavor-text {
  font-size: 5px;
  font-style: italic;
  color: #6a5a40;
  line-height: 1.4;
  margin: 0 0 1px;
}
.location-line {
  font-family: 'Cinzel', serif;
  font-size: 5px;
  color: #9a8a70;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── Print overrides ─────────────────────────────────── */
@media print {
  .card-shell {
    width: 63mm;
    height: 88mm;
    border-radius: 3mm;
    padding: 1.5mm;
    box-shadow: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .card-face { border-radius: 2mm; }
  .card-name { font-size: 2.5mm; }
  .back-label { font-size: 1.8mm; }
  .stat-key { font-size: 1.6mm; min-width: 8mm; }
  .stat-val { font-size: 1.8mm; }
  .section-header { font-size: 1.6mm; padding: 0.8mm 2mm; }
  .ability-name { font-size: 1.8mm; }
  .ability-desc { font-size: 1.7mm; }
  .flavor-text { font-size: 1.6mm; }
  .location-line { font-size: 1.6mm; }
}
</style>
