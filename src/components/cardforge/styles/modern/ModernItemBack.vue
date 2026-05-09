<template>
  <ModernShell :tarot face="back" :accent="accentForItem(data)">
    <div v-if="portrait" class="md-art-fade" :style="artFade" />
    <div v-if="portrait" class="md-art-overlay" />
    <div class="md-rail" />
    <div class="md-header">
      <span class="md-header-name">{{ data.name }}</span>
      <span class="md-back-label">↻ ITEM</span>
    </div>
    <div class="md-body">
      <div class="md-stat-rows">
        <div v-for="r in metaRows" :key="r.label" class="md-stat-row">
          <span class="md-stat-key">{{ r.label }}</span>
          <span class="md-stat-val">{{ r.value }}</span>
        </div>
      </div>
      <div class="md-entries">
        <div class="md-entry">
          {{ extractTiptapText(data.description, tarot ? 320 : 230) }}
        </div>
      </div>
      <div v-if="data.attunement_requirements" class="md-flavor">
        {{ data.attunement_requirements }}
      </div>
    </div>
  </ModernShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Item } from "@/types/item.types";
import { extractTiptapText } from "@/lib/utils";
import ModernShell from "./ModernShell.vue";
import { accentForItem } from "../tokens.shared";
import { useItemCardData } from "@/composables/useItemCardData";

const { data } = defineProps<{ data: Item; tarot?: boolean }>();

const { portrait, metaRows } = useItemCardData(() => data);
const artFade = computed(() => ({
  backgroundImage: "url('" + (portrait.value ?? "") + "')",
}));
</script>

<style scoped>
.md-art-fade {
  position: absolute; inset: 0; background-size: cover; background-position: 50% 30%;
  filter: grayscale(1) contrast(0.9) brightness(0.7) saturate(0); opacity: 0.55;
}
.md-art-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(15, 12, 8, 0.55) 0%, rgba(15, 12, 8, 0.25) 30%, rgba(15, 12, 8, 0.45) 60%, rgba(15, 12, 8, 0.85) 100%);
}
.md-rail { position: absolute; top: 0; left: 0; bottom: 0; width: 4px; z-index: 3; background: var(--acc-line); }
.md-header {
  position: relative; z-index: 2; flex-shrink: 0;
  border-bottom: 1px solid var(--acc-line);
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 10px 5px 14px; gap: 6px;
  background: rgba(15, 12, 8, 0.7);
}
.md-header-name {
  font-family: "Cormorant Garamond", serif; font-size: 11px; font-weight: 700;
  color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.md-back-label {
  font-size: 6.5px; font-weight: 800; letter-spacing: 0.1em;
  color: var(--acc-text); text-transform: uppercase; flex-shrink: 0;
}
.md-body {
  position: relative; z-index: 2; flex: 1; overflow: hidden;
  padding: 6px 10px 8px 14px; display: flex; flex-direction: column; gap: 4px;
}
.md-stat-rows { display: flex; flex-direction: column; gap: 1.5px; flex-shrink: 0; }
.md-stat-row { display: flex; align-items: baseline; gap: 4px; }
.md-stat-key {
  font-size: 5.5px; font-weight: 800; letter-spacing: 0.08em;
  color: var(--acc-text); text-transform: uppercase; flex-shrink: 0; width: 38px;
}
.md-stat-val {
  font-family: "Cormorant Garamond", serif; font-size: 8.5px;
  color: var(--md-text-sub); line-height: 1.3;
}
.md-entries { flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 3px; }
.md-entry {
  font-family: "Cormorant Garamond", serif; font-size: 8.5px; line-height: 1.35;
  color: var(--md-text-sub); text-wrap: pretty;
}
.md-flavor {
  font-family: "Cormorant Garamond", serif; font-style: italic; font-size: 7.5px;
  color: var(--md-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 4px; flex-shrink: 0;
}
</style>
