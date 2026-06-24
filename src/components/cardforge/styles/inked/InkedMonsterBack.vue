<template>
  <InkedShell :tarot :accent="accentForMonster(data)">
    <div v-if="portrait" class="ik-art-fade" :style="artFade" />
    <div v-if="portrait" class="ik-art-overlay" />
    <div class="ik-hatch" />
    <div class="ik-header">
      <span class="ik-header-name">{{ data.name }}</span>
      <span class="ik-back-label">↻ STATS</span>
    </div>
    <div class="ik-body">
      <div class="ik-abilities">
        <div v-for="ab in abilities" :key="ab.key" class="ik-ab-cell">
          <span class="ik-ab-label">{{ ab.label }}</span>
          <span class="ik-ab-score">{{ ab.score }}</span>
          <span class="ik-ab-mod" :class="ab.mod >= 0 ? 'pos' : 'neg'">
            {{ ab.mod >= 0 ? "+" : "" }}{{ ab.mod }}
          </span>
        </div>
      </div>
      <div class="ik-stat-rows">
        <div v-for="r in statRows" :key="r.label" class="ik-stat-row">
          <span class="ik-stat-key">{{ r.label }}</span>
          <span class="ik-stat-val">
            <template v-if="r.damage && r.damage.length">
              <span v-for="(g, gi) in r.damage" :key="gi" class="ik-dmg-group">
                <span class="ik-dmg-icons">
                  <DamageIcon v-for="t in g.types" :key="t" :type="t" />
                </span>
                <span v-if="g.qualifier" class="ik-dmg-qual">{{
                  g.qualifier
                }}</span>
              </span>
            </template>
            <template v-else-if="r.senses && r.senses.length">
              <template v-for="(se, si) in r.senses" :key="si">
                <span v-if="se.sense" class="ik-sense">
                  <SenseIcon :sense="se.sense" /><span v-if="se.value">{{
                    se.value
                  }}</span>
                </span>
                <span v-else class="ik-sense-text"
                  >{{ se.label }}{{ se.value ? " " + se.value : "" }}</span
                >
              </template>
            </template>
            <template v-else>{{ r.value }}</template>
          </span>
        </div>
      </div>
      <FitText class="ik-entries" :entries="entryList" />
      <div v-if="flavor" class="ik-flavor">"{{ flavor }}"</div>
    </div>
  </InkedShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Monster } from "@/types/monster.types";
import InkedShell from "./InkedShell.vue";
import FitText, { type FitEntry } from "../../FitText.vue";
import DamageIcon from "@/components/common/DamageIcon.vue";
import SenseIcon from "@/components/common/SenseIcon.vue";
import { accentForMonster } from "../tokens.shared";
import { useMonsterCardData } from "@/composables/useMonsterCardData";

const { data, tarot } = defineProps<{ data: Monster; tarot?: boolean }>();

const { portrait, abilities, statRows, entries, flavor } = useMonsterCardData(
  () => data,
  () => tarot,
);

const entryList = computed<FitEntry[]>(() =>
  entries.value.map((e) => ({
    name: e.name + ".",
    text: e.description,
    key: e.name,
  })),
);
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
.ik-abilities {
  display: grid; grid-template-columns: repeat(6, 1fr);
  border-top: 1px solid var(--acc-line);
  border-bottom: 1px solid var(--acc-line);
  padding: 3px 0; flex-shrink: 0;
}
.ik-ab-cell { display: flex; flex-direction: column; align-items: center; border-left: 1px solid var(--ik-divider); }
.ik-ab-cell:first-child { border-left: none; }
.ik-ab-label {
  font-family: "Cinzel", serif; font-size: 5px; font-weight: 700;
  color: var(--acc-text);
  letter-spacing: 0.05em;
}
.ik-ab-score { font-family: "Cinzel", serif; font-size: 9px; font-weight: 700; color: #fff; line-height: 1.05; }
.ik-ab-mod { font-family: "Cinzel", serif; font-size: 6px; font-weight: 700; }
.ik-ab-mod.pos { color: var(--ik-stat-pos); }
.ik-ab-mod.neg { color: var(--ik-stat-neg); }

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
.ik-dmg-group + .ik-dmg-group { margin-left: 4px; }
.ik-dmg-icons {
  display: inline-flex; gap: 1.5px; font-size: 1.4em; vertical-align: -0.18em;
  color: var(--acc-text);
}
.ik-dmg-qual { font-style: italic; opacity: 0.85; margin-left: 2px; }
.ik-sense { display: inline-flex; align-items: center; gap: 1.5px; margin-right: 5px; }
.ik-sense :deep(.mask-icon) { width: 1.35em; height: 1.35em; color: var(--acc-text); }
.ik-sense-text { margin-right: 5px; }
.ik-entries { gap: 2.5px; }
:deep(.ft-entry) {
  font-family: "Cardo", serif; font-size: 6.5px; line-height: 1.3;
  color: var(--ik-text-sub); text-wrap: pretty;
}
:deep(.ft-name) {
  font-family: "Cinzel", serif; font-size: 6.5px; font-weight: 700;
  color: var(--acc-text);
  margin-right: 3px;
}
.ik-flavor {
  font-family: "Cardo", serif; font-style: italic; font-size: 6px;
  color: var(--ik-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 4px; flex-shrink: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
</style>
