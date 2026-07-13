<template>
  <InkedShell :tarot :accent="accentForDowntime(data)">
    <div class="ik-hatch" />
    <div class="ik-header">
      <span class="ik-header-name">{{ data.title }}</span>
      <span class="ik-back-label">↻ INTERLUDE</span>
    </div>
    <div class="ik-body">
      <div class="ik-stat-rows">
        <div v-for="r in metaRows" :key="r.label" class="ik-stat-row">
          <span class="ik-stat-key">{{ r.label }}</span>
          <span class="ik-stat-val">{{ r.value }}</span>
        </div>
      </div>
      <div class="ik-entries ik-fade">
        <div class="ik-entry">{{ data.hook }}</div>
      </div>
      <div class="ik-flavor">Spend a downtime draw to lay this card.</div>
    </div>
  </InkedShell>
</template>

<script setup lang="ts">
import type { DowntimeActivity } from "@/types/downtime.types";
import InkedShell from "./InkedShell.vue";
import { accentForDowntime } from "../tokens.shared";
import { useDowntimeCardData } from "@/composables/useDowntimeCardData";

const { data } = defineProps<{ data: DowntimeActivity; tarot?: boolean }>();

const { metaRows } = useDowntimeCardData(() => data);
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
.ik-entries { flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 2.5px; }
.ik-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
}
.ik-entry {
  font-family: "Cardo", serif; font-size: 6.5px; line-height: 1.3;
  color: var(--ik-text-sub); text-wrap: pretty;
}
.ik-flavor {
  font-family: "Cardo", serif; font-style: italic; font-size: 6px;
  color: var(--ik-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 4px; flex-shrink: 0;
}
</style>
