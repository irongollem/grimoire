<template>
  <ModernShell :tarot face="front" :frame-color="frameColor">
    <div class="md-art">
      <FocalImage
        v-if="portrait"
        :src="portrait"
        format="portrait"
        :focal-point="data.portrait_focal_point"
        print
      />
      <div v-else class="md-art-ph">
        <span class="md-art-glyph">{{ data.name.charAt(0).toUpperCase() }}</span>
        <span class="md-art-label">{{ data.occupation ?? "NPC" }}</span>
      </div>
      <div class="md-art-overlay" />
    </div>
    <div class="md-tag">{{ typeTag }}</div>
    <div class="md-panel">
      <div class="md-header">
        <div class="md-name">{{ data.name }}</div>
        <div class="md-sub">{{ typeLine }}</div>
      </div>
      <div class="md-stats">
        <div v-for="s in stats" :key="s.label" class="md-stat">
          <span class="md-stat-lbl">{{ s.label }}</span>
          <span class="md-stat-val">{{ s.value }}</span>
        </div>
      </div>
    </div>
  </ModernShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Npc } from "@/types/npc.types";
import FocalImage from "@/components/common/FocalImage.vue";
import ModernShell from "./ModernShell.vue";
import { modernTokens as T } from "./modern.tokens";
import { useNpcCardData } from "@/composables/useNpcCardData";

const { data, tarot } = defineProps<{ data: Npc; tarot?: boolean }>();

const { portrait, typeTag, typeLine, stats, relationship } = useNpcCardData(
  () => data,
  () => tarot,
);

const frameColor = computed(
  () => T.npcFrame[relationship.value] ?? T.npcFrameDefault,
);
</script>

<style scoped>
.md-art { position: absolute; top: 0; left: 0; right: 0; height: 65.7%; overflow: hidden; }
.md-shell.tarot .md-art { height: 70.9%; }
.md-art :deep(> div) { width: 100%; height: 100%; }
.md-art :deep(img) { width: 100%; object-fit: cover; }
.md-art-ph {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--fc) 60%, #000), #0e0b08);
}
.md-art-glyph { font-size: 40px; font-weight: 800; color: rgba(255, 255, 255, 0.08); font-family: "Cinzel", serif; line-height: 1; }
.md-art-label { font-size: 6px; color: rgba(255, 255, 255, 0.2); text-transform: uppercase; letter-spacing: 0.15em; }
.md-art-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 24%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.85) 100%);
}
.md-tag {
  position: absolute; top: 10px; left: 0; z-index: 2;
  background: var(--fc); color: var(--md-back);
  font-size: 7px; font-weight: 800; letter-spacing: 0.12em;
  padding: 3px 14px 3px 10px; text-transform: uppercase;
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
}
.md-panel {
  position: absolute; left: 0; right: 0; bottom: 0; top: 65.7%;
  background: linear-gradient(180deg, var(--md-panel-top) 0%, var(--md-panel-bottom) 100%);
  padding: 0 12px 10px;
  display: flex; flex-direction: column; justify-content: flex-end;
}
.md-shell.tarot .md-panel { top: 70.9%; }
.md-header { margin-top: -42px; position: relative; z-index: 2; margin-bottom: 6px; }
.md-name {
  font-family: "Cormorant Garamond", serif; font-size: 18px; font-weight: 600;
  color: #fff; line-height: 1.05; text-shadow: 0 0 8px rgba(0, 0, 0, 0.9);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.md-sub {
  font-size: 7.5px; color: var(--md-text-muted); font-style: italic; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.md-stats {
  display: flex; gap: 10px; align-items: baseline;
  border-top: 1px solid color-mix(in srgb, var(--fc) 27%, rgba(255, 255, 255, 0.15));
  padding-top: 5px;
}
.md-stat { display: flex; align-items: baseline; gap: 4px; }
.md-stat-lbl {
  font-size: 6px; color: color-mix(in srgb, var(--fc) 65%, #fff);
  font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
.md-stat-val {
  font-family: "Cormorant Garamond", serif; font-size: 13px; font-weight: 700;
  color: #fff; line-height: 1;
}
</style>
