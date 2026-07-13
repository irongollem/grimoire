<template>
  <InkedShell :tarot :accent="accentForDowntimeSeed(data)">
    <div class="ik-hatch" />
    <div class="ik-header">
      <span class="ik-header-name">{{ data.title }}</span>
      <span class="ik-back-label">↻ {{ activityTitle }}</span>
    </div>
    <div class="ik-body">
      <!-- The vignette is the point of this card: the DM turns it over and reads
           it aloud. It gets the room, and the metadata gets the margins. -->
      <div class="ik-vignette ik-fade">{{ data.vignette }}</div>

      <div v-if="effects.length" class="ik-effects">
        <span class="ik-effects-key">Consequences</span>
        <div v-for="(e, i) in effects" :key="i" class="ik-effect">
          <span class="ik-effect-kind">{{ e.kind }}</span>
          <span class="ik-effect-val">{{ e.text }}</span>
        </div>
      </div>

      <div class="ik-flavor">Yields {{ rewardNoun.toLowerCase() }}: {{ rewardName }}</div>
    </div>
  </InkedShell>
</template>

<script setup lang="ts">
import type { DowntimeSeed } from "@/types/downtime.types";
import InkedShell from "./InkedShell.vue";
import { accentForDowntimeSeed } from "../tokens.shared";
import { useDowntimeSeedCardData } from "@/composables/useDowntimeSeedCardData";

const { data } = defineProps<{ data: DowntimeSeed; tarot?: boolean }>();

const { activityTitle, rewardName, rewardNoun, effects } = useDowntimeSeedCardData(() => data);
</script>

<style scoped>
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
  letter-spacing: 0.1em; flex-shrink: 0; text-transform: uppercase;
}
.ik-body {
  position: relative; z-index: 1; flex: 1; overflow: hidden;
  padding: 7px 10px 8px; display: flex; flex-direction: column; gap: 5px;
}
.ik-vignette {
  flex: 1; overflow: hidden;
  font-family: "Cardo", serif; font-size: 7px; line-height: 1.35;
  color: var(--ik-text-sub); text-wrap: pretty;
}
.ik-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
}
.ik-effects {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 1.5px;
  border-top: 1px solid var(--acc-line); padding-top: 4px;
}
.ik-effects-key {
  font-family: "Cinzel", serif; font-size: 5.5px; font-weight: 700; letter-spacing: 0.08em;
  color: var(--acc-text); text-transform: uppercase; margin-bottom: 1px;
}
.ik-effect { display: flex; align-items: baseline; gap: 4px; }
.ik-effect-kind {
  font-family: "Cinzel", serif; font-size: 5.5px; font-weight: 700;
  color: var(--acc-text); text-transform: uppercase; flex-shrink: 0; width: 32px;
}
.ik-effect-val {
  font-family: "Cardo", serif; font-size: 7px;
  color: var(--ik-text-sub); line-height: 1.2;
}
.ik-flavor {
  font-family: "Cardo", serif; font-style: italic; font-size: 6px;
  color: var(--ik-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 4px; flex-shrink: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
</style>
