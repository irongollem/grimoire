<template>
  <div class="card-shell" :style="{ '--fc': frameColor }">
    <div class="card-face">
      <!-- Title bar -->
      <div class="card-header">
        <span class="card-name" :title="data.name">{{ truncateCard(data.name, 20) }}</span>
        <span class="cr-badge">{{ badge }}</span>
      </div>

      <!-- Art area -->
      <div class="art-area">
        <FocalImage v-if="data.image_url" :src="data.image_url" format="landscape" :focal-point="data.image_focal_point" />
        <div v-else class="art-placeholder">
          <span class="placeholder-glyph">{{ data.school.charAt(0).toUpperCase() }}</span>
          <span class="placeholder-label">{{ data.school }}</span>
        </div>
      </div>

      <!-- Type line -->
      <div class="type-line-row">
        <span class="type-line">{{ typeLine }}</span>
      </div>

      <!-- Stats -->
      <div class="stats-strip">
        <div class="stat-cell">
          <span class="stat-label">Cast</span>
          <span class="stat-value">{{ castingStat }}</span>
        </div>
        <div class="stat-divider" />
        <div class="stat-cell">
          <span class="stat-label">Range</span>
          <span class="stat-value">{{ rangeStat }}</span>
        </div>
        <div class="stat-divider" />
        <div class="stat-cell">
          <span class="stat-label">Dur</span>
          <span class="stat-value">{{ durationStat }}</span>
        </div>
      </div>

      <!-- Info cells -->
      <div class="ability-grid">
        <div v-for="s in infoStats" :key="s.label" class="ability-cell">
          <span class="ab-label">{{ s.label }}</span>
          <span class="ab-score" style="font-size: 5.5px; line-height: 1.2">{{ s.value }}</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="card-footer">
        <span v-for="cls in displayTags" :key="cls" class="ctag">{{ cls }}</span>
        <span class="footer-kind">Spell</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Spell } from "@/types/spell.types";
import FocalImage from "@/components/common/FocalImage.vue";
import { SCHOOL_COLORS, spellLevelLabel } from "@/types/spell.types";
import { truncateCard } from "@/types/card.types";

const props = defineProps<{ data: Spell }>();

const frameColor = computed(() => SCHOOL_COLORS[props.data.school] ?? "#1C2A4A");
const badge = computed(() => (props.data.level === 0 ? "C" : `L${props.data.level}`));
const typeLine = computed(() => `${spellLevelLabel(props.data.level)} • ${props.data.school}`);
const castingStat = computed(() =>
  props.data.casting_time
    .replace("Action", "Act")
    .replace("Bonus Action", "BA")
    .slice(0, 6),
);
const rangeStat = computed(() => props.data.range.replace(" ft.", "'").slice(0, 6));
const durationStat = computed(() =>
  props.data.duration
    .replace("Concentration, up to ", "C/")
    .replace(" minute", "m")
    .replace(" hour", "h")
    .slice(0, 8),
);
const infoStats = computed(() => [
  { label: "LVL", value: props.data.level === 0 ? "C" : String(props.data.level) },
  { label: "SCH", value: props.data.school.slice(0, 5) },
  { label: "CAST", value: props.data.casting_time.slice(0, 5) },
  { label: "RNG", value: props.data.range.replace(" ft.", "'").slice(0, 5) },
  { label: "DUR", value: props.data.duration.slice(0, 5) },
  { label: "COMP", value: props.data.components.join("") },
]);
const displayTags = computed(() => props.data.classes.slice(0, 2));
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
.cr-badge {
  font-family: "Cinzel", serif;
  font-size: 6px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  padding: 1px 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.art-area {
  flex: 0 0 90px;
  overflow: hidden;
  position: relative;
}
.art-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--fc) 80%, #000) 0%,
    color-mix(in srgb, var(--fc) 40%, #000) 100%
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.placeholder-glyph {
  font-family: "Cinzel", serif;
  font-size: 32px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.15);
  line-height: 1;
  text-transform: uppercase;
}
.placeholder-label {
  font-size: 6px;
  font-family: "Cinzel", serif;
  color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

.type-line-row {
  background: color-mix(in srgb, var(--fc) 15%, #f5f0e6);
  border-top: 1px solid color-mix(in srgb, var(--fc) 30%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--fc) 30%, transparent);
  padding: 2px 6px;
  flex-shrink: 0;
}
.type-line {
  font-size: 6px;
  font-style: italic;
  color: #3a3028;
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.stats-strip {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}
.stat-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3px 2px;
  gap: 1px;
}
.stat-label {
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 700;
  text-transform: uppercase;
  color: #7a6a50;
  letter-spacing: 0.05em;
}
.stat-value {
  font-family: "Cinzel", serif;
  font-size: 8px;
  font-weight: 700;
  color: #1a1410;
}
.stat-divider {
  width: 1px;
  background: rgba(0, 0, 0, 0.12);
  margin: 3px 0;
}

.ability-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  padding: 3px 4px;
  gap: 1px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.ability-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.ab-label {
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 700;
  color: #7a6a50;
  letter-spacing: 0;
}

.card-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px 5px;
  flex: 1;
  align-content: center;
}
.ctag {
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 600;
  background: color-mix(in srgb, var(--fc) 15%, transparent);
  color: color-mix(in srgb, var(--fc) 80%, #000);
  border: 1px solid color-mix(in srgb, var(--fc) 30%, transparent);
  border-radius: 2px;
  padding: 1px 3px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.footer-kind {
  margin-left: auto;
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 600;
  color: #9a8a70;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-style: italic;
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
  .cr-badge {
    font-size: 2mm;
  }
  .art-area {
    flex: 0 0 28mm;
  }
  .placeholder-glyph {
    font-size: 10mm;
  }
  .placeholder-label {
    font-size: 2mm;
  }
  .type-line {
    font-size: 1.8mm;
  }
  .stat-label {
    font-size: 1.6mm;
  }
  .stat-value {
    font-size: 2.5mm;
  }
  .ab-label {
    font-size: 1.6mm;
  }
  .ctag {
    font-size: 1.6mm;
  }
  .footer-kind {
    font-size: 1.6mm;
  }
}
</style>
