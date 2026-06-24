<template>
  <ModernShell :tarot face="back" :accent="accentForMonster(data)">
    <div v-if="portrait" class="md-art-fade" :style="artFade" />
    <div v-if="portrait" class="md-art-overlay" />
    <div class="md-rail" />
    <div class="md-header">
      <span class="md-header-name">{{ data.name }}</span>
      <span class="md-back-label">↻ STATS</span>
    </div>
    <div class="md-body">
      <div class="md-abilities">
        <div v-for="ab in abilities" :key="ab.key" class="md-ab-cell">
          <span class="md-ab-label">{{ ab.label }}</span>
          <span class="md-ab-score">{{ ab.score }}</span>
          <span class="md-ab-mod" :class="ab.mod >= 0 ? 'pos' : 'neg'">
            {{ ab.mod >= 0 ? "+" : "" }}{{ ab.mod }}
          </span>
        </div>
      </div>
      <div class="md-stat-rows">
        <div v-for="r in statRows" :key="r.label" class="md-stat-row">
          <span class="md-stat-key">{{ r.label }}</span>
          <span class="md-stat-val">
            <template v-if="r.damage && r.damage.length">
              <span v-for="(g, gi) in r.damage" :key="gi" class="md-dmg-group">
                <span class="md-dmg-icons">
                  <DamageIcon v-for="t in g.types" :key="t" :type="t" />
                </span>
                <span v-if="g.qualifier" class="md-dmg-qual">{{
                  g.qualifier
                }}</span>
              </span>
            </template>
            <template v-else-if="r.senses && r.senses.length">
              <template v-for="(se, si) in r.senses" :key="si">
                <span v-if="se.sense" class="md-sense">
                  <SenseIcon :sense="se.sense" /><span v-if="se.value">{{
                    se.value
                  }}</span>
                </span>
                <span v-else class="md-sense-text"
                  >{{ se.label }}{{ se.value ? " " + se.value : "" }}</span
                >
              </template>
            </template>
            <template v-else>{{ r.value }}</template>
          </span>
        </div>
      </div>
      <FitText class="md-entries" :entries="entryList" />
      <div v-if="flavor" class="md-flavor">"{{ flavor }}"</div>
    </div>
  </ModernShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Monster } from "@/types/monster.types";
import ModernShell from "./ModernShell.vue";
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
  entries.value.map((e) => ({ name: e.name, text: e.description, key: e.name })),
);
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
.md-abilities {
  display: grid; grid-template-columns: repeat(6, 1fr);
  border-top: 1px solid var(--acc-line);
  border-bottom: 1px solid var(--acc-line);
  padding: 3px 0; flex-shrink: 0;
}
.md-ab-cell { display: flex; flex-direction: column; align-items: center; border-left: 1px solid rgba(255,255,255,.06); }
.md-ab-cell:first-child { border-left: none; }
.md-ab-label { font-size: 5px; font-weight: 800; color: var(--acc-text); letter-spacing: 0.05em; }
.md-ab-score { font-family: "Cormorant Garamond", serif; font-size: 11px; font-weight: 700; color: #fff; line-height: 1.05; }
.md-ab-mod { font-size: 7px; font-weight: 700; }
.md-ab-mod.pos { color: var(--md-stat-pos); }
.md-ab-mod.neg { color: var(--md-stat-neg); }

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
.md-dmg-group + .md-dmg-group { margin-left: 4px; }
.md-dmg-icons {
  display: inline-flex; gap: 1.5px; font-size: 1.3em; vertical-align: -0.18em;
  color: var(--acc-text);
}
.md-dmg-qual { font-style: italic; opacity: 0.85; margin-left: 2px; }
.md-sense { display: inline-flex; align-items: center; gap: 1.5px; margin-right: 5px; }
.md-sense :deep(.mask-icon) { width: 1.25em; height: 1.25em; color: var(--acc-text); }
.md-sense-text { margin-right: 5px; }
.md-entries { gap: 3px; }
:deep(.ft-entry) {
  font-family: "Cormorant Garamond", serif; font-size: 7.5px; line-height: 1.35;
  color: var(--md-text-sub); text-wrap: pretty;
}
:deep(.ft-name) {
  font-size: 7px; font-weight: 800; color: var(--acc-text);
  letter-spacing: 0.06em; text-transform: uppercase; margin-right: 3px;
}
.md-flavor {
  font-family: "Cormorant Garamond", serif; font-style: italic; font-size: 6.5px;
  color: var(--md-text-muted); text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 4px; flex-shrink: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
</style>
