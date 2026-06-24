<template>
  <InkedShell :tarot :accent="accentForItem(data)">
    <div v-if="portrait" class="ik-art-fade" :style="artFade" />
    <div v-if="portrait" class="ik-art-overlay" />
    <div class="ik-hatch" />
    <div class="ik-header">
      <span class="ik-header-name">{{ data.name }}</span>
      <span class="ik-back-label">↻ ITEM</span>
    </div>
    <div class="ik-body">
      <div class="ik-stat-rows">
        <div v-for="r in metaRows" :key="r.label" class="ik-stat-row">
          <span class="ik-stat-key">{{ r.label }}</span>
          <span class="ik-stat-val">{{ r.value }}</span>
        </div>
        <div v-if="damageTypes.length" class="ik-stat-row">
          <span class="ik-stat-key">Damage</span>
          <span class="ik-stat-val">
            <span class="ik-dmg-icons">
              <DamageIcon v-for="t in damageTypes" :key="t" :type="t" />
            </span>
          </span>
        </div>
      </div>
      <div class="ik-entries ik-fade">
        <div class="ik-entry">
          {{ extractTiptapText(data.description, Infinity) }}
        </div>
      </div>
      <div v-if="data.attunement_requirements" class="ik-flavor">
        {{ data.attunement_requirements }}
      </div>
    </div>
  </InkedShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Item } from "@/types/item.types";
import { extractTiptapText } from "@/lib/utils";
import InkedShell from "./InkedShell.vue";
import DamageIcon from "@/components/common/DamageIcon.vue";
import { accentForItem } from "../tokens.shared";
import { useItemCardData } from "@/composables/useItemCardData";

const { data } = defineProps<{ data: Item; tarot?: boolean }>();

const { portrait, metaRows, damageTypes } = useItemCardData(() => data);
const artFade = computed(() => ({
  backgroundImage: "url('" + (portrait.value ?? "") + "')",
}));
</script>

<style scoped>
.ik-art-fade {
  position: absolute; inset: 0; background-size: cover; background-position: 50% 30%;
  filter: grayscale(1) contrast(0.9) brightness(0.7) saturate(0); opacity: 0.55;
}
.ik-art-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(12, 10, 8, 0.55) 0%, rgba(12, 10, 8, 0.25) 30%, rgba(12, 10, 8, 0.45) 60%, rgba(12, 10, 8, 0.85) 100%);
}
.ik-hatch {
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.018) 0 3px, transparent 3px 7px);
}
.ik-header {
  position: relative; z-index: 1; flex-shrink: 0;
  background: var(--acc-line); border-bottom: 1px solid rgba(255,255,255,.12);
  display: flex; align-items: center; justify-content: space-between; padding: 4px 9px; gap: 6px;
}
.ik-header-name {
  font-family: "Cinzel", serif; font-size: 8px; font-weight: 700; letter-spacing: 0.04em;
  color: var(--ik-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.ik-back-label {
  font-family: "Cinzel", serif; font-size: 6px; font-weight: 700;
  color: var(--ik-text-sub);
  letter-spacing: 0.1em; flex-shrink: 0;
}
.ik-body {
  position: relative; z-index: 1; flex: 1; overflow: hidden;
  padding: 7px 10px 8px; display: flex; flex-direction: column; gap: 4px;
}
.ik-stat-rows { display: flex; flex-direction: column; gap: 1.5px; flex-shrink: 0; }
.ik-stat-row { display: flex; align-items: baseline; gap: 4px; }
.ik-stat-key {
  font-family: "Cinzel", serif; font-size: 5.5px; font-weight: 700; letter-spacing: 0.08em;
  color: var(--acc-text);
  text-transform: uppercase; flex-shrink: 0; width: 38px;
}
.ik-stat-val {
  font-family: "Cardo", serif; font-size: 7.5px;
  color: var(--ik-text-sub); line-height: 1.2;
}
.ik-dmg-icons {
  display: inline-flex; gap: 1.5px; font-size: 1.4em; vertical-align: -0.18em;
  color: var(--acc-text);
}
.ik-entries { flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 2.5px; }
/* Long descriptions fill the available space and fade out where they overflow,
   rather than being cut at an arbitrary character count. */
.ik-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
}
.ik-entry {
  font-family: "Cardo", serif; font-size: 7.5px; line-height: 1.3;
  color: var(--ik-text-sub); text-wrap: pretty;
}
.ik-flavor {
  font-family: "Cardo", serif; font-style: italic; font-size: 7px;
  color: var(--ik-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 4px; flex-shrink: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
</style>
