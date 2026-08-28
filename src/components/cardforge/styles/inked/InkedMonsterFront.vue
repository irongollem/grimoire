<template>
  <InkedShell :tarot :accent="accentForMonster(data)">
    <div class="ik-art">
      <FocalImage
        v-if="portrait"
        :src="portrait"
        format="portrait"
        :focal-point="data.portrait_focal_point"
        print
      />
      <div v-else class="ik-art-ph">
        <span class="ik-art-glyph">{{ monsterType.charAt(0).toUpperCase() }}</span>
        <span class="ik-art-label">{{ monsterType }}</span>
      </div>
      <div class="ik-scrim" />
    </div>
    <div class="ik-top">
      <div class="ik-type-tag">{{ typeTag }}</div>
      <div class="ik-type-line" />
      <div v-if="badge" class="ik-badge">{{ badge }}</div>
    </div>
    <div class="ik-bottom">
      <div class="ik-name">{{ data.name }}</div>
      <div class="ik-sub">{{ typeLine }}</div>
      <div class="ik-stats">
        <span v-for="s in stats" :key="s.label" class="ik-stat">
          <em>{{ s.label }}</em> {{ s.value }}
        </span>
      </div>
      <div class="ik-speeds">
        <em class="ik-spd-lbl">SPD</em>
        <template v-if="hasSpeed">
          <span v-for="(sp, i) in speeds" :key="i" class="ik-spd">
            <MovementIcon v-if="sp.mode !== 'walk'" :mode="sp.mode" />
            <span v-if="sp.value && sp.value !== '0'">{{ sp.value }}</span>
          </span>
        </template>
        <span v-else>—</span>
      </div>
    </div>
  </InkedShell>
</template>

<script setup lang="ts">
import type { Monster } from "@/types/monster.types";
import FocalImage from "@/components/common/FocalImage.vue";
import MovementIcon from "@/components/common/MovementIcon.vue";
import InkedShell from "./InkedShell.vue";
import { accentForMonster } from "../tokens.shared";
import { useMonsterCardData } from "@/composables/cardforge/useMonsterCardData";

const { data, tarot } = defineProps<{ data: Monster; tarot?: boolean }>();

const { portrait, monsterType, typeTag, typeLine, badge, stats, speeds, hasSpeed } =
  useMonsterCardData(
    () => data,
    () => tarot,
  );
</script>

<style scoped>
.ik-art { position: absolute; inset: 0; overflow: hidden; }
.ik-art :deep(> div) { width: 100%; height: 100%; }
.ik-art :deep(img) { width: 100%; object-fit: cover; }
.ik-art-ph {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--acc-line) 80%, #000), color-mix(in srgb, var(--acc-line) 30%, #000));
}
.ik-art-glyph { font-size: 40px; font-weight: 700; color: rgba(255, 255, 255, 0.1); line-height: 1; }
.ik-art-label { font-size: 6px; color: rgba(255, 255, 255, 0.25); text-transform: uppercase; letter-spacing: 0.15em; }
.ik-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.65) 0%, transparent 22%, transparent 50%, rgba(0, 0, 0, 0.92) 78%, rgba(0, 0, 0, 0.98) 100%);
}
.ik-top {
  position: absolute; top: 9px; left: 10px; right: 10px; z-index: 2;
  display: flex; align-items: center; gap: 5px;
}
.ik-type-tag {
  background: var(--acc-tag); color: var(--acc-text);
  font-family: "Cinzel", serif; font-size: 6px; font-weight: 700;
  letter-spacing: 0.12em; padding: 2px 7px; border-radius: 2px;
  text-transform: uppercase; flex-shrink: 0;
}
.ik-type-line { flex: 1; height: 1px; background: linear-gradient(90deg, var(--acc-line), transparent); }
.ik-badge {
  background: rgba(0, 0, 0, 0.7); border: 1px solid rgba(255, 255, 255, 0.25);
  color: #e8d89a; font-family: "Cinzel", serif; font-size: 6.5px; font-weight: 700;
  padding: 2px 5px; border-radius: 2px; flex-shrink: 0;
}
.ik-bottom { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 11px 12px; z-index: 2; }
.ik-name {
  font-family: "UnifrakturCook", "Cinzel", serif; font-size: 19px; font-weight: 700;
  line-height: 1.05; text-shadow: 0 0 8px rgba(0, 0, 0, 0.95);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  margin-bottom: 3px;
}
.ik-sub {
  font-family: "Cardo", serif; font-size: 7.5px; font-style: italic;
  color: rgba(233, 223, 199, 0.65); text-transform: capitalize; margin-bottom: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ik-stats {
  display: flex; gap: 10px; align-items: baseline;
  border-top: 1px solid var(--acc-line); padding-top: 5px;
}
.ik-stat {
  display: flex; align-items: baseline; gap: 3px;
  font-family: "Cinzel", serif; font-size: 9.5px; font-weight: 900; color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.ik-stat em {
  font-style: normal; font-size: 5.5px;
  color: var(--acc-text);
  letter-spacing: 0.08em; text-transform: uppercase;
}
.ik-speeds {
  display: flex; flex-wrap: wrap; align-items: center; column-gap: 7px; row-gap: 1px;
  margin-top: 3px; max-height: 2.7em; overflow: hidden;
  font-family: "Cinzel", serif; font-size: 9.5px; font-weight: 900; color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.ik-spd-lbl {
  font-style: normal; font-size: 5.5px; color: var(--acc-text);
  letter-spacing: 0.08em; text-transform: uppercase;
}
.ik-spd { display: inline-flex; align-items: center; gap: 1.5px; }
.ik-spd :deep(.mask-icon) { width: 1.15em; height: 1.15em; color: var(--acc-text); }
</style>
