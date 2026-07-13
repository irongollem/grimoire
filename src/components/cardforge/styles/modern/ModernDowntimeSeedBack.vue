<template>
  <ModernShell :tarot face="back" :accent="accentForDowntimeSeed(data)">
    <div class="md-rail" />
    <div class="md-header">
      <span class="md-header-name">{{ data.title }}</span>
      <span class="md-back-label">↻ {{ activityTitle }}</span>
    </div>
    <div class="md-body">
      <!-- The vignette is what the DM reads aloud, so it gets the room. -->
      <div class="md-vignette md-fade">{{ data.vignette }}</div>

      <div v-if="effects.length" class="md-effects">
        <span class="md-effects-key">Consequences</span>
        <div v-for="(e, i) in effects" :key="i" class="md-effect">
          <span class="md-effect-kind">{{ e.kind }}</span>
          <span class="md-effect-val">{{ e.text }}</span>
        </div>
      </div>

      <div class="md-flavor">Yields {{ rewardNoun.toLowerCase() }}: {{ rewardName }}</div>
    </div>
  </ModernShell>
</template>

<script setup lang="ts">
import type { DowntimeSeed } from "@/types/downtime.types";
import ModernShell from "./ModernShell.vue";
import { accentForDowntimeSeed } from "../tokens.shared";
import { useDowntimeSeedCardData } from "@/composables/useDowntimeSeedCardData";

const { data } = defineProps<{ data: DowntimeSeed; tarot?: boolean }>();

const { activityTitle, rewardName, rewardNoun, effects } = useDowntimeSeedCardData(() => data);
</script>

<style scoped>
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
  padding: 6px 10px 8px 14px; display: flex; flex-direction: column; gap: 5px;
}
.md-vignette {
  flex: 1; overflow: hidden;
  font-family: "Cormorant Garamond", serif; font-size: 8px; line-height: 1.35;
  color: var(--md-text-sub); text-wrap: pretty;
}
.md-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
}
.md-effects {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 1.5px;
  border-top: 1px solid var(--acc-line); padding-top: 4px;
}
.md-effects-key {
  font-size: 5.5px; font-weight: 800; letter-spacing: 0.08em;
  color: var(--acc-text); text-transform: uppercase; margin-bottom: 1px;
}
.md-effect { display: flex; align-items: baseline; gap: 4px; }
.md-effect-kind {
  font-size: 5.5px; font-weight: 800; letter-spacing: 0.08em;
  color: var(--acc-text); text-transform: uppercase; flex-shrink: 0; width: 32px;
}
.md-effect-val {
  font-family: "Cormorant Garamond", serif; font-size: 8px;
  color: var(--md-text-sub); line-height: 1.2;
}
.md-flavor {
  font-family: "Cormorant Garamond", serif; font-style: italic; font-size: 6.5px;
  color: var(--md-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 4px; flex-shrink: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
</style>
