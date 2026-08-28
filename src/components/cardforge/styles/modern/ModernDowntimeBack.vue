<template>
  <ModernShell :tarot face="back" :accent="accentForDowntime(data)">
    <div class="md-rail" />
    <div class="md-header">
      <span class="md-header-name">{{ data.title }}</span>
      <span class="md-back-label">↻ Interlude</span>
    </div>
    <div class="md-body">
      <div class="md-stat-rows">
        <div v-for="r in metaRows" :key="r.label" class="md-stat-row">
          <span class="md-stat-key">{{ r.label }}</span>
          <span class="md-stat-val">{{ r.value }}</span>
        </div>
      </div>
      <div class="md-entries md-fade">
        <div class="md-entry">{{ data.hook }}</div>
      </div>
      <div class="md-flavor">Spend a downtime draw to lay this card.</div>
    </div>
  </ModernShell>
</template>

<script setup lang="ts">
import type { DowntimeActivity } from "@/types/downtime.types";
import ModernShell from "./ModernShell.vue";
import { accentForDowntime } from "../tokens.shared";
import { useDowntimeCardData } from "@/composables/cardforge/useDowntimeCardData";

const { data } = defineProps<{ data: DowntimeActivity; tarot?: boolean }>();

const { metaRows } = useDowntimeCardData(() => data);
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
.md-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 12px), transparent);
}
.md-entry {
  font-family: "Cormorant Garamond", serif; font-size: 7.5px; line-height: 1.35;
  color: var(--md-text-sub); text-wrap: pretty;
}
.md-flavor {
  font-family: "Cormorant Garamond", serif; font-style: italic; font-size: 6.5px;
  color: var(--md-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 4px; flex-shrink: 0;
}
</style>
