<template>
  <div class="md-shell" :class="{ tarot }" :style="{ '--fc': frameColor }">
    <div v-if="portrait" class="md-art-fade" :style="artFade" />
    <div v-if="portrait" class="md-art-overlay" />
    <div class="md-rail" />
    <div class="md-header">
      <span class="md-header-name">{{ data.name }}</span>
      <span class="md-back-label">↻ NPC</span>
    </div>
    <div class="md-body">
      <div class="md-abilities">
        <div v-for="ab in abilities" :key="ab.key" class="md-ab-cell">
          <span class="md-ab-label">{{ ab.label }}</span>
          <span class="md-ab-score">{{ ab.score }}</span>
          <span class="md-ab-mod" :class="ab.mod >= 0 ? 'pos' : 'neg'">{{ ab.mod >= 0 ? '+' : '' }}{{ ab.mod }}</span>
        </div>
      </div>
      <div class="md-stat-rows">
        <div v-for="r in statRows" :key="r.label" class="md-stat-row">
          <span class="md-stat-key">{{ r.label }}</span>
          <span class="md-stat-val">{{ r.value }}</span>
        </div>
      </div>
      <div class="md-entries">
        <div v-for="e in entries" :key="e.name" class="md-entry">
          <span class="md-entry-name">{{ e.name }}</span>{{ truncate(e.description, tarot ? 140 : 100) }}
        </div>
      </div>
      <div v-if="flavor" class="md-flavor">"{{ truncate(flavor, 80) }}"</div>
    </div>
    <div class="md-wm">DUNGEON GRIMOIRE</div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { Npc } from "@/types/npc.types";
import { ABILITY_KEYS, ABILITY_LABELS, truncateCard, capitalize } from "@/types/card.types";
import { extractTiptapText } from "@/lib/utils";
const NPC_LINE: Record<string, string> = { ally:"#5d8db3", enemy:"#a83a3a", neutral:"#7a8fa0", unknown:"#6e7a88" };
const props    = defineProps<{ data: Npc; tarot?: boolean }>();
const truncate = truncateCard;
const frameColor = computed(() => NPC_LINE[props.data.relationship] ?? "#5d8db3");
const portrait   = computed(() => props.data.portrait_url ?? null);
const artFade    = computed(() => ({ backgroundImage: "url('" + (portrait.value ?? "") + "')" }));
const abilities = computed(() => ABILITY_KEYS.map(key => {
  const score = (props.data.stat_block)?.[key] ?? 10;
  return { key, label: ABILITY_LABELS[key], score, mod: Math.floor((score - 10) / 2) };
}));
const statRows = computed(() => {
  const sb = props.data.stat_block; if (!sb) return [];
  const r = [];
  if (sb.skills && Object.keys(sb.skills).length) r.push({ label:"Skills", value:Object.entries(sb.skills).map(([k,v]) => capitalize(k)+" "+v).join(", ") });
  if (sb.senses)    r.push({ label:"Senses", value:sb.senses });
  if (sb.languages) r.push({ label:"Lang.",  value:sb.languages });
  return r;
});
const entries = computed(() => {
  const sb = props.data.stat_block; if (!sb) return [];
  return [...(sb.special_abilities ?? []).slice(0,2), ...(sb.actions ?? []).slice(0,2)].slice(0, props.tarot ? 5 : 4);
});
const flavor = computed(() => {
  const raw = props.data.personality ?? props.data.backstory ?? null;
  return raw ? (extractTiptapText(raw, 80) || null) : null;
});
</script>
<style scoped>
.md-shell {
  position:relative; width:200px; height:280px;
  border-radius:11px; overflow:hidden; background:#15110d;
  box-shadow:0 8px 22px rgba(0,0,0,.7);
  flex-shrink:0; display:flex; flex-direction:column;
  font-family:"Inter",system-ui,sans-serif; color:#ece2cc;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.md-shell.tarot { width:222px; height:381px; }
.md-art-fade {
  position:absolute; inset:0; background-size:cover; background-position:50% 30%;
  filter:grayscale(1) contrast(.9) brightness(.7) saturate(0); opacity:0.55;
}
.md-art-overlay {
  position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(15,12,8,.55) 0%,rgba(15,12,8,.25) 30%,rgba(15,12,8,.45) 60%,rgba(15,12,8,.85) 100%);
}
.md-rail { position:absolute; top:0; left:0; bottom:0; width:4px; z-index:3; background:var(--fc,#5d8db3); }
.md-header {
  position:relative; z-index:2; flex-shrink:0;
  border-bottom:1px solid color-mix(in srgb,var(--fc) 50%,rgba(255,255,255,.2));
  display:flex; align-items:center; justify-content:space-between;
  padding:5px 10px 5px 14px; gap:6px; background:rgba(15,12,8,.7);
}
.md-header-name {
  font-family:"Cormorant Garamond",serif; font-size:11px; font-weight:700;
  color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;
}
.md-back-label { font-size:6.5px; font-weight:800; letter-spacing:.1em; color:var(--fc,#8cbadc); text-transform:uppercase; flex-shrink:0; }
.md-body { position:relative; z-index:2; flex:1; overflow:hidden; padding:6px 10px 8px 14px; display:flex; flex-direction:column; gap:4px; }
.md-abilities {
  display:grid; grid-template-columns:repeat(6,1fr);
  border-top:1px solid color-mix(in srgb,var(--fc) 45%,rgba(255,255,255,.25));
  border-bottom:1px solid color-mix(in srgb,var(--fc) 45%,rgba(255,255,255,.25));
  padding:3px 0; flex-shrink:0;
}
.md-ab-cell { display:flex; flex-direction:column; align-items:center; border-left:1px solid rgba(255,255,255,.06); }
.md-ab-cell:first-child { border-left:none; }
.md-ab-label { font-size:5px; font-weight:800; color:var(--fc,#8cbadc); letter-spacing:.05em; }
.md-ab-score { font-family:"Cormorant Garamond",serif; font-size:11px; font-weight:700; color:#fff; line-height:1.05; }
.md-ab-mod { font-size:7px; font-weight:700; }
.md-ab-mod.pos { color:#8de08d; } .md-ab-mod.neg { color:#f09090; }
.md-stat-rows { display:flex; flex-direction:column; gap:1.5px; flex-shrink:0; }
.md-stat-row { display:flex; align-items:baseline; gap:4px; }
.md-stat-key { font-size:5.5px; font-weight:800; letter-spacing:.08em; color:var(--fc,#8cbadc); text-transform:uppercase; flex-shrink:0; width:38px; }
.md-stat-val { font-family:"Cormorant Garamond",serif; font-size:8.5px; color:rgba(236,226,204,.85); line-height:1.3; }
.md-entries { flex:1; overflow:hidden; display:flex; flex-direction:column; gap:3px; }
.md-entry { font-family:"Cormorant Garamond",serif; font-size:8.5px; line-height:1.35; color:rgba(236,226,204,.85); text-wrap:pretty; }
.md-entry-name { font-size:7px; font-weight:800; color:var(--fc,#8cbadc); letter-spacing:.06em; text-transform:uppercase; margin-right:3px; }
.md-flavor {
  font-family:"Cormorant Garamond",serif; font-style:italic; font-size:7.5px; color:rgba(236,226,204,.4);
  text-align:center; border-top:1px solid rgba(255,255,255,.08); padding-top:4px; flex-shrink:0;
}.md-wm { position:absolute; bottom:4px; left:0; right:0; z-index:10; text-align:center; font-family:"Cinzel",serif; font-size:5px; font-weight:800; letter-spacing:.18em; color:rgba(255,255,255,.18); pointer-events:none; }</style>