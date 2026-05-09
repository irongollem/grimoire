<template>
  <div class="md-shell" :class="{ tarot }" :style="{ '--fc': frameColor }">
    <div v-if="data.image_url" class="md-art-fade" :style="artFade" />
    <div v-if="data.image_url" class="md-art-overlay" />
    <div class="md-rail" />
    <div class="md-header">
      <span class="md-header-name">{{ data.name }}</span>
      <span class="md-back-label">↻ SPELL</span>
    </div>
    <div class="md-body">
      <div class="md-stat-rows">
        <div v-for="r in metaRows" :key="r.label" class="md-stat-row">
          <span class="md-stat-key">{{ r.label }}</span>
          <span class="md-stat-val">{{ r.value }}</span>
        </div>
      </div>
      <div class="md-entries">
        <div class="md-entry">
          <span class="md-entry-name">Effect</span>{{ extractTiptapText(data.description, tarot ? 280 : 200) }}
        </div>
      </div>
      <div v-if="data.higher_levels" class="md-flavor">"{{ truncate(data.higher_levels, 80) }}"</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { Spell } from "@/types/spell.types";
import { SCHOOL_COLORS, spellLevelLabel } from "@/types/spell.types";
import { truncateCard } from "@/types/card.types";
import { extractTiptapText } from "@/lib/utils";
const props    = defineProps<{ data: Spell; tarot?: boolean }>();
const truncate = truncateCard;
const frameColor = computed(() => SCHOOL_COLORS[props.data.school] ?? "#a83a3a");
const artFade    = computed(() => ({ backgroundImage: "url('" + (props.data.image_url ?? "") + "')" }));
const metaRows = computed(() => [
  { label:"Casting",  value:props.data.casting_time },
  { label:"Range",    value:props.data.range },
  { label:"Duration", value:props.data.duration },
  { label:"Comps",    value:props.data.components.join(", ") + (props.data.material ? " — " + truncateCard(props.data.material, 40) : "") },
  { label:"Classes",  value:props.data.classes.join(", ") },
  { label:"Level",    value:spellLevelLabel(props.data.level) },
]);
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
.md-shell.tarot { height:343px; }
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
}</style>