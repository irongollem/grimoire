<template>
  <div class="md-shell" :class="{ tarot }" :style="{ '--fc': frameColor }">
    <div class="md-art">
      <FocalImage v-if="portrait" :src="portrait" format="portrait" :focal-point="data.portrait_focal_point" print />
      <div v-else class="md-art-ph">
        <span class="md-art-glyph">{{ data.name.charAt(0).toUpperCase() }}</span>
        <span class="md-art-label">{{ data.occupation ?? 'NPC' }}</span>
      </div>
      <div class="md-art-overlay" />
    </div>
    <div class="md-tag">{{ typeTag }}</div>
    <!-- <div v-if="badge" class="md-badge">{{ badge }}</div> -->
    <div class="md-panel">
      <div class="md-header">
        <div class="md-name">{{ data.name }}</div>
        <div class="md-sub">{{ typeLine }}</div>
      </div>
      <div class="md-stats">
        <div v-for="s in stats" :key="s.label" class="md-stat">
          <span class="md-stat-lbl">{{ s.label }}</span>
          <span class="md-stat-val">{{ s.value }}</span>
        </div>
      </div>
    </div>
    <div class="md-wm">DUNGEON GRIMOIRE</div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { Npc } from "@/types/npc.types";
import FocalImage from "@/components/common/FocalImage.vue";
const NPC_LINE: Record<string, string> = { ally:"#5d8db3", enemy:"#a83a3a", neutral:"#7a8fa0", unknown:"#6e7a88" };
const props = defineProps<{ data: Npc; tarot?: boolean }>();
const frameColor = computed(() => NPC_LINE[props.data.relationship] ?? "#5d8db3");
const portrait   = computed(() => props.data.portrait_url ?? null);
// const badge      = computed(() => props.data.occupation ? props.data.occupation.toUpperCase().slice(0, 18) : null);
const typeTag    = computed(() => "NPC · " + props.data.relationship.toUpperCase());
const typeLine   = computed(() => [props.data.race, props.data.occupation].filter(Boolean).join(" · "));
const hp  = computed(() => props.data.stat_block?.hit_points?.split(" ")[0] ?? "—");
const ac  = computed(() => String(props.data.stat_block?.armor_class ?? "—"));
const cha = computed(() => String(props.data.stat_block?.cha ?? "—"));
const stats = computed(() => [{ label:"HP",value:hp.value },{ label:"AC",value:ac.value },{ label:"CHA",value:cha.value }]);
</script>
<style scoped>
.md-shell {
  position:relative; width:200px; height:280px;
  border-radius:14px; overflow:hidden; background:#161310;
  border:1px solid color-mix(in srgb,var(--fc) 35%,transparent);
  box-shadow:0 8px 22px rgba(0,0,0,.7);
  flex-shrink:0; font-family:"Inter",system-ui,sans-serif; color:#dcd3c0;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.md-shell.tarot { width:222px; height:381px; }
.md-art { position:absolute; top:0; left:0; right:0; height:65.7%; overflow:hidden; }
.md-shell.tarot .md-art { height:70.9%; }
.md-art :deep(> div){ width:100%; height:100%; }
.md-art :deep(img){ width:100%; object-fit:cover; }
.md-art-ph {
  width:100%; height:100%;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
  background:linear-gradient(160deg, color-mix(in srgb,var(--fc) 60%,#000), #0e0b08);
}
.md-art-glyph { font-size:40px; font-weight:800; color:rgba(255,255,255,.08); font-family:"Cinzel",serif; line-height:1; }
.md-art-label { font-size:6px; color:rgba(255,255,255,.2); text-transform:uppercase; letter-spacing:.15em; }
.md-art-overlay {
  position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 24%, rgba(0,0,0,0) 55%, rgba(0,0,0,.85) 100%);
}
.md-tag {
  position:absolute; top:10px; left:0; z-index:2;
  background:var(--fc); color:#15110d;
  font-size:7px; font-weight:800; letter-spacing:.12em;
  padding:3px 14px 3px 10px; text-transform:uppercase;
  clip-path:polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
}
.md-badge {
  position:absolute; top:10px; right:10px; z-index:2;
  background:rgba(0,0,0,.55); color:#fff;
  font-size:7px; font-weight:700;
  padding:2px 6px; border-radius:3px;
  border:1px solid color-mix(in srgb,var(--fc) 67%,rgba(255,255,255,.4));
  white-space:nowrap; max-width:90px; overflow:hidden; text-overflow:ellipsis;
}
.md-panel {
  position:absolute; left:0; right:0; bottom:0; top:65.7%;
  background:linear-gradient(180deg, #1a1612 0%, #0f0c09 100%);
  padding:0 12px 10px;
  display:flex; flex-direction:column; justify-content:flex-end;
}
.md-shell.tarot .md-panel { top:70.9%; }
.md-header { margin-top:-42px; position:relative; z-index:2; margin-bottom:6px; }
.md-name {
  font-family:"Cormorant Garamond",serif; font-size:18px; font-weight:600;
  color:#fff; line-height:1.05; text-shadow:0 0 8px rgba(0,0,0,.9);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.md-sub {
  font-size:7.5px; color:#cfc7b5; font-style:italic; margin-top:2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.md-stats {
  display:flex; gap:10px; align-items:baseline;
  border-top:1px solid color-mix(in srgb,var(--fc) 27%,rgba(255,255,255,.15));
  padding-top:5px;
}
.md-stat { display:flex; align-items:baseline; gap:4px; }
.md-stat-lbl { font-size:6px; color:color-mix(in srgb,var(--fc) 65%,#fff); font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
.md-stat-val { font-family:"Cormorant Garamond",serif; font-size:13px; font-weight:700; color:#fff; line-height:1; }
.md-wm { position:absolute; bottom:4px; left:0; right:0; z-index:10; text-align:center; font-family:"Cinzel",serif; font-size:5px; font-weight:800; letter-spacing:.18em; color:rgba(255,255,255,.18); pointer-events:none; }</style>
