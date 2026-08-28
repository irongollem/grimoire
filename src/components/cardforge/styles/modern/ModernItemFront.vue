<template>
  <ModernShell :tarot face="front" :accent="accentForItem(data)">
    <div class="md-art">
      <FocalImage
        v-if="portrait"
        :src="portrait"
        format="portrait"
        :focal-point="data.image_focal_point"
        print
      />
      <div v-else class="md-art-ph">
        <span class="md-art-glyph">
          {{ (data.item_type ?? "I").charAt(0).toUpperCase() }}
        </span>
        <span class="md-art-label">{{ data.item_type ?? "Item" }}</span>
      </div>
    </div>
    <div class="md-scrim" />
    <div class="md-tag">{{ typeTag }}</div>
    <div v-if="data.cost" class="md-badge">{{ data.cost }}</div>
    <div class="md-bottom">
      <div class="md-name">{{ data.name }}</div>
      <div class="md-sub">{{ typeLine }}</div>
      <div class="md-stats">
        <div v-for="s in modernStats" :key="s.label" class="md-stat">
          <span class="md-stat-lbl">{{ s.label }}</span>
          <span class="md-stat-val">{{ s.value }}</span>
        </div>
      </div>
    </div>
  </ModernShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Item } from "@/types/item.types";
import FocalImage from "@/components/common/FocalImage.vue";
import ModernShell from "./ModernShell.vue";
import { accentForItem } from "../tokens.shared";
import { useItemCardData } from "@/composables/cardforge/useItemCardData";

const { data } = defineProps<{ data: Item; tarot?: boolean }>();

const { portrait, typeTag, typeLine, weight, attuneLabel } = useItemCardData(
  () => data,
);

// Modern shows VAL when present; Inked doesn't.
const modernStats = computed(() => [
  { label: "WT", value: weight.value },
  { label: "ATT", value: attuneLabel.value },
  ...(data.cost ? [{ label: "VAL", value: data.cost }] : []),
]);
</script>

<style scoped>
.md-art { position: absolute; inset: 0; overflow: hidden; }
.md-art :deep(> div) { width: 100%; height: 100%; }
.md-art :deep(img) { width: 100%; object-fit: cover; }
.md-art-ph {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--acc-line) 60%, var(--md-bg)), var(--md-bg));
}
.md-art-glyph { font-size: 40px; font-weight: 800; color: rgba(255, 255, 255, 0.08); font-family: "Cinzel", serif; line-height: 1; }
.md-art-label { font-size: 6px; color: rgba(255, 255, 255, 0.2); text-transform: uppercase; letter-spacing: 0.15em; }
.md-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, transparent 22%, transparent 50%, rgba(0, 0, 0, 0.92) 78%, rgba(0, 0, 0, 0.98) 100%);
}
.md-tag {
  position: absolute; top: 10px; left: 0; z-index: 2;
  background: var(--acc-tag); color: var(--acc-text);
  font-size: 7px; font-weight: 800; letter-spacing: 0.12em;
  padding: 3px 14px 3px 10px; text-transform: uppercase;
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
}
.md-badge {
  position: absolute; top: 10px; right: 10px; z-index: 2;
  background: var(--md-badge-bg); color: var(--md-text);
  font-size: 7px; font-weight: 700;
  padding: 2px 6px; border-radius: 3px;
  border: 1px solid var(--acc-line);
  white-space: nowrap;
}
.md-bottom {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 8px 12px 12px; z-index: 2;
}
.md-name {
  font-family: "Cormorant Garamond", serif; font-size: 18px; font-weight: 600;
  color: var(--md-text); line-height: 1.05;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.95);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  margin-bottom: 3px;
}
.md-sub {
  font-size: 7.5px; color: var(--md-text-sub); font-style: italic;
  margin-bottom: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.md-stats {
  display: flex; gap: 10px; align-items: baseline;
  border-top: 1px solid var(--acc-line);
  padding-top: 5px;
}
.md-stat { display: flex; align-items: baseline; gap: 4px; }
.md-stat-lbl { font-size: 6px; color: var(--acc-text); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.md-stat-val { font-family: "Cormorant Garamond", serif; font-size: 13px; font-weight: 700; color: var(--md-text); line-height: 1; }
</style>
