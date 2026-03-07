<template>
  <div class="card-shell" :style="{ '--fc': frameColor }">
    <div class="card-face">
      <!-- Header -->
      <div class="card-header">
        <span class="card-name" :title="name">{{ truncate(name, 24) }}</span>
        <span class="back-label">Back</span>
      </div>

      <!-- Stats block -->
      <div class="stats-block">
        <div v-for="row in statsRows" :key="row.label" class="stat-row">
          <span class="stat-key">{{ row.label }}</span>
          <span class="stat-val">{{ row.value }}</span>
        </div>
        <div v-if="!statsRows.length" class="no-stats">No combat stats recorded</div>
      </div>

      <!-- Abilities -->
      <div class="section-header">Special Abilities</div>
      <div class="abilities-block">
        <div v-for="entry in specialAbilities" :key="entry.name" class="ability-entry">
          <span class="ability-name">{{ entry.name }}.</span>
          <span class="ability-desc">{{ truncate(entry.description, 180) }}</span>
        </div>
        <div v-if="!specialAbilities.length" class="no-stats">—</div>
      </div>

      <!-- Actions -->
      <div class="section-header">Actions</div>
      <div class="abilities-block">
        <div v-for="entry in actionEntries" :key="entry.name" class="ability-entry">
          <span class="ability-name">{{ entry.name }}.</span>
          <span class="ability-desc">{{ truncate(entry.description, 180) }}</span>
        </div>
        <div v-if="!actionEntries.length" class="no-stats">—</div>
      </div>

      <!-- NPC flavor / Monster notes -->
      <div v-if="flavorSection" class="flavor-footer">
        <p v-if="flavorSection.heading" class="flavor-heading">{{ flavorSection.heading }}</p>
        <p class="flavor-text">{{ truncate(flavorSection.text, 200) }}</p>
        <span v-if="flavorSection.location" class="location-line">{{ flavorSection.location }}</span>
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
  if ('saving_throws' in sb && sb.saving_throws) rows.push({ label: 'Saving Throws', value: sb.saving_throws })
  if (sb.skills && Object.keys(sb.skills).length) {
    rows.push({ label: 'Skills', value: Object.entries(sb.skills).map(([k, v]) => `${cap(k)} ${v}`).join(', ') })
  }
  if ('damage_vulnerabilities' in sb && sb.damage_vulnerabilities) rows.push({ label: 'Vulnerabilities', value: sb.damage_vulnerabilities })
  if (sb.damage_resistances) rows.push({ label: 'Resistances', value: sb.damage_resistances })
  if (sb.damage_immunities) rows.push({ label: 'Immunities', value: sb.damage_immunities })
  if (sb.condition_immunities) rows.push({ label: 'Cond. Immunities', value: sb.condition_immunities })
  if (sb.senses) rows.push({ label: 'Senses', value: sb.senses })
  if (sb.languages) rows.push({ label: 'Languages', value: sb.languages })
  return rows
})

interface Entry { name: string; description: string }

const specialAbilities = computed((): Entry[] => {
  return (props.subject.data.stat_block?.special_abilities ?? []).slice(0, 3)
})

const actionEntries = computed((): Entry[] => {
  return (props.subject.data.stat_block?.actions ?? []).slice(0, 3)
})

interface FlavorSection { heading?: string; text: string; location?: string | null }

const flavorSection = computed((): FlavorSection | null => {
  if (props.subject.kind === 'npc') {
    const n = props.subject.data
    const text = n.personality ?? n.backstory
    if (!text && !n.location) return null
    return {
      heading: n.personality ? 'Personality' : 'Backstory',
      text: text ?? '',
      location: n.location ?? n.affiliation,
    }
  }
  const m = props.subject.data
  if (!m.notes && !m.habitat) return null
  return {
    heading: 'Notes',
    text: m.notes ?? '',
    location: m.habitat,
  }
})

function truncate(str: string | null | undefined, len: number) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len - 1) + '…' : str
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
</script>

<style scoped>
.card-shell {
  width: 245px;
  height: 420px;
  border-radius: 12px;
  background: var(--fc, #1C2A4A);
  padding: 5px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.card-face {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: #F5F0E6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'IM Fell English', serif;
}

.card-header {
  background: var(--fc);
  color: #E8D89A;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  flex-shrink: 0;
  gap: 4px;
}
.card-name {
  font-family: 'Cinzel', serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.back-label {
  font-family: 'Cinzel', serif;
  font-size: 7px;
  font-weight: 600;
  color: rgba(232,216,154,0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

.stats-block {
  padding: 5px 8px 4px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0,0,0,0.1);
}
.stat-row {
  display: flex;
  gap: 4px;
  align-items: baseline;
  line-height: 1.4;
}
.stat-key {
  font-family: 'Cinzel', serif;
  font-size: 6.5px;
  font-weight: 700;
  color: #7a6a50;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  min-width: 40px;
}
.stat-val {
  font-size: 7px;
  color: #2a2018;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.no-stats {
  font-size: 7px;
  color: #9a8a70;
  font-style: italic;
}

.section-header {
  font-family: 'Cinzel', serif;
  font-size: 6.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #F5F0E6;
  background: color-mix(in srgb, var(--fc) 70%, #000);
  padding: 2.5px 8px;
  flex-shrink: 0;
}

.abilities-block {
  padding: 3px 8px 2px;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2.5px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}
.ability-entry {
  font-size: 7px;
  color: #2a2018;
  line-height: 1.4;
}
.ability-name {
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 7px;
  margin-right: 2px;
}

.flavor-footer {
  border-top: 1px solid rgba(0,0,0,0.08);
  padding: 4px 8px;
  flex: 1;
  background: color-mix(in srgb, var(--fc) 6%, #F5F0E6);
  overflow: hidden;
}
.flavor-heading {
  font-family: 'Cinzel', serif;
  font-size: 7px;
  font-weight: 700;
  color: #7a6a50;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 2px;
}
.flavor-text {
  font-size: 7px;
  font-style: italic;
  color: #4a3a28;
  line-height: 1.4;
  margin: 0 0 3px;
}
.location-line {
  font-family: 'Cinzel', serif;
  font-size: 6.5px;
  color: #9a8a70;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@media print {
  .card-shell {
    display: flex;
    flex-direction: column;
    width: 70mm;
    height: 120mm;
    border-radius: 3mm;
    padding: 1.8mm;
    box-shadow: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .card-face {
    flex: 1;
    height: auto;
    border-radius: 2mm;
  }
  .card-name { font-size: 3.2mm; }
  .back-label { font-size: 2.2mm; }
  .stat-key { font-size: 2mm; min-width: 12mm; }
  .stat-val { font-size: 2.2mm; }
  .section-header { font-size: 2mm; padding: 0.8mm 2.5mm; }
  .ability-name { font-size: 2.2mm; }
  .ability-desc { font-size: 2.2mm; }
  .flavor-heading { font-size: 2.2mm; }
  .flavor-text { font-size: 2.2mm; }
  .location-line { font-size: 2mm; }
}
</style>
