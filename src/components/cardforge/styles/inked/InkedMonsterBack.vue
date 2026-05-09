<template>
  <div class="ik-shell" :class="{ tarot }" :style="{ '--fc': frameColor }">
    <div v-if="data.image_url" class="ik-art-fade" :style="artFade" />
    <div v-if="data.image_url" class="ik-art-overlay" />
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
          <span class="ik-ab-mod" :class="ab.mod >= 0 ? 'pos' : 'neg'">{{ ab.mod >= 0 ? '+' : '' }}{{ ab.mod }}</span>
        </div>
      </div>
      <div class="ik-stat-rows">
        <div v-for="r in statRows" :key="r.label" class="ik-stat-row">
          <span class="ik-stat-key">{{ r.label }}</span>
          <span class="ik-stat-val">{{ r.value }}</span>
        </div>
      </div>
      <div class="ik-entries">
        <div v-for="e in entries" :key="e.name" class="ik-entry">
          <span class="ik-entry-name">{{ e.name }}.</span>{{ " " + truncate(e.description, tarot ? 140 : 100) }}
        </div>
      </div>
      <div v-if="flavor" class="ik-flavor">"{{ truncate(flavor, 80) }}"</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { Monster } from "@/types/monster.types";
import { ABILITY_KEYS, ABILITY_LABELS, truncateCard, capitalize } from "@/types/card.types";
import { extractTiptapText } from "@/lib/utils";
const MONSTER_LINE: Record<string, string> = {
  aberration:"#8d65bf", beast:"#6a9c52", celestial:"#5d8db3", construct:"#8a7a6a",
  dragon:"#c2500c", elemental:"#c8983a", fey:"#3aac9a", fiend:"#a83a3a",
  giant:"#a07040", humanoid:"#5d8db3", monstrosity:"#8a9c40", ooze:"#3a9c70",
  plant:"#6a9c52", undead:"#7a5aaa",
};
const props  = defineProps<{ data: Monster; tarot?: boolean }>();
const truncate   = truncateCard;
const frameColor = computed(() => MONSTER_LINE[props.data.monster_type] ?? "#a83a3a");
const artFade    = computed(() => ({ backgroundImage: "url('" + (props.data.image_url ?? "") + "')" }));
const abilities = computed(() => ABILITY_KEYS.map(key => {
  const score = (props.data.stat_block)?.[key] ?? 10;
  return { key, label: ABILITY_LABELS[key], score, mod: Math.floor((score - 10) / 2) };
}));
const statRows = computed(() => {
  const sb = props.data.stat_block; if (!sb) return [];
  const r = [];
  if (sb.saving_throws) r.push({ label:"Saves", value:sb.saving_throws });
  if (sb.skills && Object.keys(sb.skills).length) r.push({ label:"Skills", value:Object.entries(sb.skills).map(([k,v]) => capitalize(k)+" "+v).join(", ") });
  if (sb.damage_immunities)   r.push({ label:"Immune",  value:sb.damage_immunities });
  if (sb.damage_resistances)  r.push({ label:"Resist.", value:sb.damage_resistances });
  if (sb.senses)   r.push({ label:"Senses", value:sb.senses });
  if (sb.languages) r.push({ label:"Lang.",  value:sb.languages });
  return r;
});
const entries = computed(() => {
  const sb = props.data.stat_block; if (!sb) return [];
  return [...(sb.special_abilities ?? []).slice(0,2), ...(sb.actions ?? []).slice(0,3)].slice(0, props.tarot ? 5 : 4);
});
const flavor = computed(() => {
  const raw = props.data.notes ?? props.data.habitat ?? null;
  return raw ? (extractTiptapText(raw, 80) || null) : null;
});
</script>
<style scoped>
.ik-shell {
  position:relative; width:200px; height:280px;
  border-radius:10px; overflow:hidden; background:#0c0a08;
  box-shadow:0 8px 22px rgba(0,0,0,.7),0 0 0 1px rgba(0,0,0,.5);
  flex-shrink:0; display:flex; flex-direction:column;
  font-family:"Cardo",serif; color:#ece2cc;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.ik-shell.tarot { height:343px; }
.ik-art-fade {
  position:absolute; inset:0; background-size:cover; background-position:50% 30%;
  filter:grayscale(1) contrast(.9) brightness(.7) saturate(0); opacity:0.55;
}
.ik-art-overlay {
  position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(12,10,8,.55) 0%,rgba(12,10,8,.25) 30%,rgba(12,10,8,.45) 60%,rgba(12,10,8,.85) 100%);
}
.ik-hatch {
  position:absolute; inset:0; pointer-events:none;
  background:repeating-linear-gradient(45deg,rgba(255,255,255,.018) 0 3px,transparent 3px 7px);
}
.ik-header {
  position:relative; z-index:1; flex-shrink:0;
  background:var(--fc); border-bottom:1px solid rgba(255,255,255,.12);
  display:flex; align-items:center; justify-content:space-between; padding:4px 9px; gap:6px;
}
.ik-header-name {
  font-family:"Cinzel",serif; font-size:8px; font-weight:700; letter-spacing:.04em;
  color:#f0e0c0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;
}
.ik-back-label { font-family:"Cinzel",serif; font-size:6px; font-weight:700; color:rgba(240,224,192,.55); letter-spacing:.1em; flex-shrink:0; }
.ik-body { position:relative; z-index:1; flex:1; overflow:hidden; padding:7px 10px 8px; display:flex; flex-direction:column; gap:4px; }
.ik-abilities {
  display:grid; grid-template-columns:repeat(6,1fr);
  border-top:1px solid color-mix(in srgb,var(--fc) 55%,rgba(255,255,255,.3));
  border-bottom:1px solid color-mix(in srgb,var(--fc) 55%,rgba(255,255,255,.3));
  padding:3px 0; flex-shrink:0;
}
.ik-ab-cell { display:flex; flex-direction:column; align-items:center; border-left:1px solid rgba(255,255,255,.07); }
.ik-ab-cell:first-child { border-left:none; }
.ik-ab-label { font-family:"Cinzel",serif; font-size:5px; font-weight:700; color:color-mix(in srgb,var(--fc) 25%,rgba(255,255,255,.6)); letter-spacing:.05em; }
.ik-ab-score { font-family:"Cinzel",serif; font-size:9px; font-weight:700; color:#fff; line-height:1.05; }
.ik-ab-mod { font-family:"Cinzel",serif; font-size:6px; font-weight:700; }
.ik-ab-mod.pos { color:#8de08d; } .ik-ab-mod.neg { color:#f09090; }
.ik-stat-rows { display:flex; flex-direction:column; gap:1.5px; flex-shrink:0; }
.ik-stat-row { display:flex; align-items:baseline; gap:4px; }
.ik-stat-key {
  font-family:"Cinzel",serif; font-size:5.5px; font-weight:700; letter-spacing:.08em;
  color:color-mix(in srgb,var(--fc) 20%,rgba(255,255,255,.6)); text-transform:uppercase;
  flex-shrink:0; width:38px;
}
.ik-stat-val { font-family:"Cardo",serif; font-size:7.5px; color:rgba(236,226,204,.8); line-height:1.2; }
.ik-entries { flex:1; overflow:hidden; display:flex; flex-direction:column; gap:2.5px; }
.ik-entry { font-family:"Cardo",serif; font-size:7.5px; line-height:1.3; color:rgba(236,226,204,.8); text-wrap:pretty; }
.ik-entry-name { font-family:"Cinzel",serif; font-size:6.5px; font-weight:700; color:color-mix(in srgb,var(--fc) 20%,rgba(255,255,255,.75)); margin-right:3px; }
.ik-flavor {
  font-family:"Cardo",serif; font-style:italic; font-size:7px; color:rgba(236,226,204,.4);
  text-align:center; border-top:1px solid rgba(255,255,255,.1); padding-top:4px; flex-shrink:0;
}</style>