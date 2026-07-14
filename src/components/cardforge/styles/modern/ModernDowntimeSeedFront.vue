<template>
  <ModernShell :tarot face="front" :accent="accentForDowntimeSeed(data)">
    <!-- Drawn from a face-down stack, so EVERYTHING is on this face. The back is
         a shared deck back and carries no per-seed information at all. -->
    <div class="md-art">
      <FocalImage v-if="portrait" :src="portrait" format="portrait" print />
      <div v-else class="md-art-ph" :style="{ '--glyph-bg': accent }">
        <span class="md-art-glyph">{{ glyph }}</span>
      </div>
      <div class="md-art-scrim" />
      <div class="md-tag">{{ typeTag }}</div>
    </div>

    <div class="md-body">
      <div class="md-name">{{ data.title }}</div>
      <div class="md-vignette md-fade">{{ data.vignette }}</div>

      <div v-if="effects.length" class="md-effects">
        <span v-for="(e, i) in effects" :key="i" class="md-effect">
          <span class="md-effect-kind">{{ e.kind }}</span>
          {{ e.text }}
        </span>
      </div>

      <div class="md-yield">
        <span class="md-yield-key">Yields</span>
        {{ rewardNoun.toLowerCase() }} — {{ rewardName }}
      </div>
    </div>
  </ModernShell>
</template>

<script setup lang="ts">
import type { DowntimeSeed } from "@/types/downtime.types";
import FocalImage from "@/components/common/FocalImage.vue";
import ModernShell from "./ModernShell.vue";
import { accentForDowntimeSeed } from "../tokens.shared";
import { useDowntimeSeedCardData } from "@/composables/useDowntimeSeedCardData";

const { data } = defineProps<{ data: DowntimeSeed; tarot?: boolean }>();

const { portrait, accent, glyph, rewardName, rewardNoun, typeTag, effects } =
  useDowntimeSeedCardData(() => data);
</script>

<style scoped>
.md-art { position: relative; height: 42%; flex-shrink: 0; overflow: hidden; }
.md-art :deep(> div) { width: 100%; height: 100%; }
.md-art :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.md-art-ph {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, color-mix(in srgb, var(--glyph-bg) 70%, var(--md-bg)), var(--md-bg));
}
.md-art-glyph { font-size: 38px; line-height: 1; opacity: 0.9; }
.md-art-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.9) 100%);
}
.md-tag {
  position: absolute; top: 8px; left: 0; z-index: 2;
  background: var(--acc-tag); color: var(--acc-text);
  font-size: 6px; font-weight: 800; letter-spacing: 0.1em;
  padding: 2px 12px 2px 9px; text-transform: uppercase;
  clip-path: polygon(0 0, 100% 0, calc(100% - 7px) 100%, 0 100%);
  max-width: 90%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.md-body {
  flex: 1; min-height: 0; overflow: hidden;
  padding: 6px 10px 8px; display: flex; flex-direction: column; gap: 3px;
}
.md-name {
  font-family: "Cormorant Garamond", serif; font-size: 13px; font-weight: 600;
  color: var(--md-text); line-height: 1.08; flex-shrink: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.md-vignette {
  flex: 1; min-height: 0; overflow: hidden;
  font-family: "Cormorant Garamond", serif; font-size: 7.5px; line-height: 1.32;
  color: var(--md-text-sub); text-wrap: pretty;
}
.md-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 10px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 10px), transparent);
}
.md-effects {
  flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 2px 8px;
  border-top: 1px solid var(--acc-line); padding-top: 3px;
}
.md-effect {
  font-family: "Cormorant Garamond", serif; font-size: 7.5px; color: var(--md-text-sub);
  display: inline-flex; align-items: baseline; gap: 3px;
}
.md-effect-kind {
  font-size: 5px; font-weight: 800; color: var(--acc-text);
  letter-spacing: 0.08em; text-transform: uppercase;
}
.md-yield {
  flex-shrink: 0; font-family: "Cormorant Garamond", serif; font-size: 6.5px; font-style: italic;
  color: var(--md-text-muted);
  border-top: 1px solid rgba(255,255,255,0.08); padding-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.md-yield-key {
  font-style: normal; font-size: 5px; font-weight: 800; color: var(--acc-text);
  letter-spacing: 0.08em; text-transform: uppercase; margin-right: 2px;
}
</style>
