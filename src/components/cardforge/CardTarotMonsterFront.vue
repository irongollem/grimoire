<template>
  <div class="card-shell" :style="{ '--fc': frameColor }">
    <div class="card-face">
      <!-- Title bar -->
      <div class="card-header">
        <span class="card-name" :title="data.name">{{ truncateCard(data.name, 24) }}</span>
        <span v-if="badge" class="cr-badge">{{ badge }}</span>
      </div>

      <!-- Art area -->
      <div class="art-area">
        <FocalImage v-if="data.image_url" :src="data.image_url" format="portrait" :focal-point="data.portrait_focal_point" />
        <div v-else class="art-placeholder">
          <span class="placeholder-glyph">{{ typeGlyph }}</span>
          <span class="placeholder-label">{{ data.monster_type }}</span>
        </div>
      </div>

      <!-- Type line -->
      <div class="type-line-row">
        <span class="type-line">{{ typeLine }}</span>
      </div>

      <!-- Combat stats -->
      <div class="stats-strip">
        <div class="stat-cell">
          <span class="stat-label">Hit Points</span>
          <span class="stat-value">{{ hp }}</span>
        </div>
        <div class="stat-divider" />
        <div class="stat-cell">
          <span class="stat-label">Armor Class</span>
          <span class="stat-value">{{ ac }}</span>
        </div>
        <div class="stat-divider" />
        <div class="stat-cell">
          <span class="stat-label">Speed</span>
          <span class="stat-value">{{ speed }}</span>
        </div>
      </div>

      <!-- Ability scores -->
      <div class="ability-grid">
        <div v-for="s in abilityStats" :key="s.key" class="ability-cell">
          <span class="ab-label">{{ s.label }}</span>
          <span class="ab-score">{{ s.value }}</span>
          <span class="ab-mod" :class="s.mod >= 0 ? 'pos' : 'neg'">
            {{ s.mod >= 0 ? "+" : "" }}{{ s.mod }}
          </span>
        </div>
      </div>

      <!-- First ability preview -->
      <div v-if="firstAbility" class="ability-preview">
        <span class="ab-name">{{ firstAbility.name }}.</span>
        <span class="ab-desc">{{ truncateCard(firstAbility.description, 130) }}</span>
      </div>

      <!-- Footer -->
      <div class="card-footer">
        <span v-for="tag in displayTags" :key="tag" class="ctag">{{ tag }}</span>
        <span class="footer-kind">{{ data.monster_type }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Monster } from "@/types/monster.types";
import FocalImage from "@/components/common/FocalImage.vue";
import {
  MONSTER_COLORS,
  MONSTER_GLYPHS_LONG,
  ABILITY_KEYS,
  ABILITY_LABELS,
  truncateCard,
} from "@/types/card.types";

const props = defineProps<{ data: Monster }>();

const frameColor = computed(() => MONSTER_COLORS[props.data.monster_type] ?? "#1C2A4A");
const badge = computed(() => {
  const cr = props.data.stat_block?.challenge_rating;
  return cr !== null ? `CR ${cr}` : null;
});
const typeGlyph = computed(() => MONSTER_GLYPHS_LONG[props.data.monster_type] ?? "??");
const typeLine = computed(
  () => `${props.data.size} ${props.data.monster_type} · ${props.data.alignment}`,
);
const hp = computed(() => props.data.stat_block?.hit_points.split(" ")[0] ?? "—");
const ac = computed(() => props.data.stat_block?.armor_class ?? "—");
const speed = computed(() => (props.data.stat_block?.speed ?? "—").replace(" ft.", "'"));
const abilityStats = computed(() => {
  const sb = props.data.stat_block as unknown as Record<string, number> | null;
  return ABILITY_KEYS.map((key) => {
    const value = sb?.[key] ?? 10;
    const mod = Math.floor((value - 10) / 2);
    return { key, label: ABILITY_LABELS[key], value, mod };
  });
});
const firstAbility = computed(() => {
  const sb = props.data.stat_block;
  return sb?.special_abilities?.[0] ?? sb?.actions?.[0] ?? null;
});
const displayTags = computed(() => (props.data.tags ?? []).slice(0, 3));
</script>

<style scoped>
.card-shell {
  width: 245px;
  height: 420px;
  border-radius: 12px;
  background: var(--fc, #1c2a4a);
  padding: 5px;
  box-shadow:
    0 6px 24px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.card-face {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: #f5f0e6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: "IM Fell English", serif;
}

.card-header {
  background: var(--fc);
  color: #e8d89a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  flex-shrink: 0;
  gap: 4px;
}
.card-name {
  font-family: "Cinzel", serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.cr-badge {
  font-family: "Cinzel", serif;
  font-size: 8px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  padding: 1px 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.art-area {
  flex: 0 0 140px;
  overflow: hidden;
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
  gap: 6px;
}
.placeholder-glyph {
  font-family: "Cinzel", serif;
  font-size: 44px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.15);
  line-height: 1;
}
.placeholder-label {
  font-family: "Cinzel", serif;
  font-size: 8px;
  color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

.type-line-row {
  background: color-mix(in srgb, var(--fc) 12%, #f5f0e6);
  border-top: 1px solid color-mix(in srgb, var(--fc) 25%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--fc) 25%, transparent);
  padding: 3px 8px;
  flex-shrink: 0;
}
.type-line {
  font-size: 8px;
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
  padding: 4px 2px;
  gap: 1px;
}
.stat-label {
  font-family: "Cinzel", serif;
  font-size: 6px;
  font-weight: 700;
  text-transform: uppercase;
  color: #7a6a50;
  letter-spacing: 0.04em;
}
.stat-value {
  font-family: "Cinzel", serif;
  font-size: 11px;
  font-weight: 700;
  color: #1a1410;
}
.stat-divider {
  width: 1px;
  background: rgba(0, 0, 0, 0.12);
  margin: 4px 0;
}

.ability-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  padding: 4px 6px;
  gap: 1px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.ability-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ab-label {
  font-family: "Cinzel", serif;
  font-size: 6.5px;
  font-weight: 700;
  color: #7a6a50;
}
.ab-score {
  font-family: "Cinzel", serif;
  font-size: 10px;
  font-weight: 700;
  color: #1a1410;
}
.ab-mod {
  font-family: "Cinzel", serif;
  font-size: 7.5px;
  font-weight: 700;
}
.ab-mod.pos { color: #1a5c1a; }
.ab-mod.neg { color: #8b1a1a; }

.ability-preview {
  padding: 4px 8px;
  flex: 1;
  overflow: hidden;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.ab-name {
  font-family: "Cinzel", serif;
  font-size: 7.5px;
  font-weight: 700;
  color: #2a2018;
  margin-right: 2px;
}
.ab-desc {
  font-size: 7.5px;
  color: #3a3028;
  line-height: 1.4;
}

.card-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px 6px;
  flex-shrink: 0;
}
.ctag {
  font-family: "Cinzel", serif;
  font-size: 6.5px;
  font-weight: 600;
  background: color-mix(in srgb, var(--fc) 15%, transparent);
  color: color-mix(in srgb, var(--fc) 80%, #000);
  border: 1px solid color-mix(in srgb, var(--fc) 30%, transparent);
  border-radius: 2px;
  padding: 1px 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.footer-kind {
  margin-left: auto;
  font-family: "Cinzel", serif;
  font-size: 6.5px;
  font-weight: 600;
  color: #9a8a70;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-style: italic;
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
  .cr-badge { font-size: 2.5mm; }
  .art-area { flex: 0 0 44mm; }
  .placeholder-glyph { font-size: 14mm; }
  .placeholder-label { font-size: 2.4mm; }
  .type-line { font-size: 2.3mm; }
  .stat-label { font-size: 1.9mm; }
  .stat-value { font-size: 3.5mm; }
  .ab-label { font-size: 2mm; }
  .ab-score { font-size: 3.2mm; }
  .ab-mod { font-size: 2.4mm; }
  .ab-name { font-size: 2.4mm; }
  .ab-desc { font-size: 2.3mm; }
  .ctag { font-size: 2mm; }
  .footer-kind { font-size: 2mm; }
}
</style>
