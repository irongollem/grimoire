<template>
  <div class="card-shell" :style="{ '--fc': frameColor }">
    <div class="card-face">
      <!-- Header -->
      <div class="card-header">
        <span class="card-name">{{ truncateCard(data.name, 24) }}</span>
        <span class="back-label">Spell</span>
      </div>

      <!-- Description -->
      <div class="desc-block">
        <p class="desc-text">{{ truncateCard(data.description, 300) }}</p>
      </div>

      <!-- At Higher Levels -->
      <template v-if="data.higher_levels">
        <div class="section-header">At Higher Levels</div>
        <div class="higher-block">
          <p class="higher-text">{{ truncateCard(data.higher_levels, 180) }}</p>
        </div>
      </template>

      <!-- Material component -->
      <template v-if="data.material">
        <div class="section-header">Material</div>
        <div class="higher-block">
          <p class="higher-text">{{ truncateCard(data.material, 100) }}</p>
        </div>
      </template>

      <!-- Footer: classes -->
      <div class="flavor-footer">
        <span v-for="cls in data.classes.slice(0, 4)" :key="cls" class="tag-badge">{{ cls }}</span>
        <span v-if="data.ritual" class="ritual-badge">Ritual</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Spell } from "@/types/spell.types";
import { SCHOOL_COLORS } from "@/types/spell.types";
import { truncateCard } from "@/types/card.types";

const props = defineProps<{ data: Spell }>();

const frameColor = computed(() => SCHOOL_COLORS[props.data.school] ?? "#1C2A4A");
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
.back-label {
  font-family: "Cinzel", serif;
  font-size: 7px;
  font-weight: 600;
  color: rgba(232, 216, 154, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

.section-header {
  font-family: "Cinzel", serif;
  font-size: 6.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #f5f0e6;
  background: color-mix(in srgb, var(--fc) 70%, #000);
  padding: 2.5px 8px;
  flex-shrink: 0;
}

.desc-block { padding: 5px 8px; flex: 1; overflow: hidden; }
.desc-text { font-size: 7px; color: #2a2018; line-height: 1.5; margin: 0; }
.higher-block { padding: 2px 8px 3px; }
.higher-text { font-size: 7px; color: #3a3028; font-style: italic; margin: 0; }
.flavor-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 4px 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  background: color-mix(in srgb, var(--fc) 8%, #f5f0e6);
}
.tag-badge {
  font-family: "Cinzel", serif;
  font-size: 6px;
  background: color-mix(in srgb, var(--fc) 15%, transparent);
  color: color-mix(in srgb, var(--fc) 80%, #000);
  border: 1px solid color-mix(in srgb, var(--fc) 30%, transparent);
  border-radius: 2px;
  padding: 1px 3px;
  text-transform: uppercase;
}
.ritual-badge {
  font-family: "Cinzel", serif;
  font-size: 6px;
  background: rgba(180, 130, 30, 0.2);
  color: #8a6010;
  border: 1px solid rgba(180, 130, 30, 0.4);
  border-radius: 2px;
  padding: 1px 3px;
  text-transform: uppercase;
  margin-left: auto;
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
  .section-header { font-size: 2mm; padding: 0.8mm 2.5mm; }
  .desc-text { font-size: 2.2mm; }
  .higher-text { font-size: 2.2mm; }
  .tag-badge { font-size: 1.9mm; }
  .ritual-badge { font-size: 1.9mm; }
}
</style>
