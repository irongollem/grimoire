<template>
  <div class="card-shell" :style="{ '--fc': frameColor }">
    <div class="card-face">
      <!-- Header -->
      <div class="card-header">
        <span class="card-name" :title="data.name">{{ truncateCard(data.name, 24) }}</span>
        <span class="back-label">Item</span>
      </div>

      <!-- Description -->
      <div class="desc-block">
        <p class="desc-text">{{ truncateCard(data.description, 280) }}</p>
      </div>

      <!-- Properties (weapons) -->
      <template v-if="data.properties.length">
        <div class="section-header">Properties</div>
        <div class="props-block">
          <span v-for="p in data.properties" :key="p" class="prop-tag">{{ p }}</span>
        </div>
      </template>

      <!-- Attunement -->
      <template v-if="data.requires_attunement">
        <div class="section-header">Attunement</div>
        <div class="attune-block">
          <span class="attune-text">{{ data.attunement_requirements ?? "Requires attunement" }}</span>
        </div>
      </template>

      <!-- Charges -->
      <template v-if="data.charges != null">
        <div class="section-header">Charges</div>
        <div class="charge-block">
          <span class="charge-text">{{ data.charges }} charges. {{ data.recharge ?? "" }}</span>
        </div>
      </template>

      <!-- Footer -->
      <div class="flavor-footer">
        <span v-for="tag in data.tags.slice(0, 3)" :key="tag" class="tag-badge">{{ tag }}</span>
        <span v-if="data.source" class="source-line">{{ data.source }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Item } from "@/types/item.types";
import { RARITY_COLORS } from "@/types/item.types";
import { truncateCard } from "@/types/card.types";

const props = defineProps<{ data: Item }>();

const frameColor = computed(() => RARITY_COLORS[props.data.rarity] ?? "#3D3D3D");
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
.props-block { padding: 2px 8px 3px; display: flex; flex-wrap: wrap; gap: 2px; }
.prop-tag {
  font-family: "Cinzel", serif;
  font-size: 6px;
  background: color-mix(in srgb, var(--fc) 15%, transparent);
  color: color-mix(in srgb, var(--fc) 80%, #000);
  border: 1px solid color-mix(in srgb, var(--fc) 30%, transparent);
  border-radius: 2px;
  padding: 1px 3px;
  text-transform: uppercase;
}
.attune-block, .charge-block { padding: 2px 8px 3px; }
.attune-text, .charge-text { font-size: 7px; color: #3a3028; font-style: italic; }
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
.source-line {
  margin-left: auto;
  font-family: "Cinzel", serif;
  font-size: 6px;
  color: #9a8a70;
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
  .back-label { font-size: 2.2mm; }
  .section-header { font-size: 2mm; padding: 0.8mm 2.5mm; }
  .desc-text { font-size: 2.2mm; }
  .prop-tag { font-size: 1.9mm; }
  .attune-text, .charge-text { font-size: 2.2mm; }
  .tag-badge { font-size: 1.9mm; }
  .source-line { font-size: 1.9mm; }
}
</style>
