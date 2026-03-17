<template>
  <g>
    <defs>
      <!-- Main face gradient: strong highlight top-left, deep shadow bottom-right -->
      <radialGradient :id="`cg-face-${uid}`" cx="35%" cy="28%" r="70%">
        <stop offset="0%"   :stop-color="metal.light" stop-opacity="1"   />
        <stop offset="40%"  :stop-color="metal.face"  stop-opacity="1"   />
        <stop offset="100%" :stop-color="metal.dark"  stop-opacity="1"   />
      </radialGradient>

      <!-- Bevel highlight: thin bright arc top-left edge of face -->
      <radialGradient :id="`cg-bevel-${uid}`" cx="30%" cy="25%" r="55%">
        <stop offset="0%"   stop-color="white" stop-opacity="0.35" />
        <stop offset="100%" stop-color="white" stop-opacity="0"    />
      </radialGradient>

      <!-- Rim text arc: starts at bottom, clockwise — 50% = top, reads L→R -->
      <path
        :id="`cg-rim-${uid}`"
        :d="`M ${cx},${cy + rimR} A ${rimR},${rimR} 0 0,1 ${cx},${cy - rimR} A ${rimR},${rimR} 0 0,1 ${cx},${cy + rimR}`"
      />
    </defs>

    <!-- Outer rim (raised edge) -->
    <circle :cx="cx" :cy="cy" :r="R" :fill="metal.rim" />

    <!-- Subtle outer shadow at very bottom-right of rim for 3-D feel -->
    <circle :cx="cx + s * 0.015" :cy="cy + s * 0.015" :r="R"
      fill="black" fill-opacity="0.18" />
    <circle :cx="cx" :cy="cy" :r="R" :fill="metal.rim" />

    <!-- Face -->
    <circle :cx="cx" :cy="cy" :r="faceR" :fill="`url(#cg-face-${uid})`" />

    <!-- Bevel sheen over face -->
    <circle :cx="cx" :cy="cy" :r="faceR" :fill="`url(#cg-bevel-${uid})`" />

    <!-- Outer decorative groove (engraved ring just inside the rim step) -->
    <circle :cx="cx" :cy="cy" :r="faceR * 0.955"
      fill="none" :stroke="metal.dark" :stroke-width="s * 0.010" stroke-opacity="0.55" />
    <circle :cx="cx" :cy="cy" :r="faceR * 0.945"
      fill="none" :stroke="metal.light" :stroke-width="s * 0.006" stroke-opacity="0.30" />

    <!-- Inner decorative groove -->
    <circle :cx="cx" :cy="cy" :r="innerGrooveR"
      fill="none" :stroke="metal.dark" :stroke-width="s * 0.008" stroke-opacity="0.40" />
    <circle :cx="cx" :cy="cy" :r="innerGrooveR - s * 0.005"
      fill="none" :stroke="metal.light" :stroke-width="s * 0.005" stroke-opacity="0.20" />

    <!-- Tick marks on inner groove (12 evenly spaced notches) -->
    <g v-for="tick in 12" :key="tick">
      <line
        :x1="cx + (innerGrooveR - s * 0.015) * Math.cos((tick - 1) * Math.PI / 6)"
        :y1="cy + (innerGrooveR - s * 0.015) * Math.sin((tick - 1) * Math.PI / 6)"
        :x2="cx + (innerGrooveR + s * 0.015) * Math.cos((tick - 1) * Math.PI / 6)"
        :y2="cy + (innerGrooveR + s * 0.015) * Math.sin((tick - 1) * Math.PI / 6)"
        :stroke="metal.rim"
        :stroke-width="s * 0.008"
        stroke-opacity="0.45"
      />
    </g>

    <!-- Rim inscription -->
    <text
      v-if="coin.rimText"
      font-family="Georgia, 'Times New Roman', serif"
      :font-size="rimFontSize"
      :fill="metal.rim"
      fill-opacity="0.70"
      text-anchor="middle"
      :letter-spacing="rimLetterSpacing"
    >
      <textPath :href="`#cg-rim-${uid}`" startOffset="50%">{{ coin.rimText }}</textPath>
    </text>

    <!-- Motif — fills the coin face when alone, shrinks when sharing with value -->
    <text
      v-if="motifSymbol"
      :x="cx"
      :y="motifY"
      font-family="Georgia, 'Times New Roman', serif"
      :font-size="motifFontSize"
      :fill="metal.rim"
      fill-opacity="0.80"
      text-anchor="middle"
      dominant-baseline="middle"
    >{{ motifSymbol }}</text>

    <!-- Thin rule between motif and value -->
    <line
      v-if="motifSymbol && hasContent"
      :x1="cx - s * 0.16" :y1="cy + s * 0.07"
      :x2="cx + s * 0.16" :y2="cy + s * 0.07"
      :stroke="metal.rim"
      :stroke-width="s * 0.007"
      stroke-opacity="0.35"
    />

    <!-- Value -->
    <text
      v-if="coin.value"
      :x="cx" :y="valueY"
      font-family="Georgia, 'Times New Roman', serif"
      :font-size="valueFontSize"
      font-weight="bold"
      :fill="metal.text"
      text-anchor="middle"
      dominant-baseline="middle"
    >{{ coin.value }}</text>

    <!-- Denomination -->
    <text
      v-if="coin.denomination"
      :x="cx" :y="denomY"
      font-family="Georgia, 'Times New Roman', serif"
      :font-size="denomFontSize"
      :fill="metal.text"
      fill-opacity="0.60"
      text-anchor="middle"
      dominant-baseline="middle"
      letter-spacing="1.5"
    >{{ coin.denomination }}</text>
  </g>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { COIN_METALS, COIN_MOTIFS } from "@/types/coin.types";
import type { CoinDesign } from "@/types/coin.types";

const props = defineProps<{
  coin: CoinDesign;
  size: number;
  uid?: string;
}>();

const uid = computed(() => props.uid ?? "0");
const s   = computed(() => props.size);
const cx  = computed(() => s.value / 2);
const cy  = computed(() => s.value / 2);
const R   = computed(() => s.value * 0.48);
const faceR       = computed(() => R.value * 0.87);
const innerGrooveR = computed(() => faceR.value * 0.74);
const rimR        = computed(() => faceR.value * 0.91);

const metal       = computed(() => COIN_METALS.find((m) => m.id === props.coin.metal) ?? COIN_METALS[3]);
const motifSymbol = computed(() => COIN_MOTIFS.find((m) => m.id === props.coin.motif)?.symbol ?? "");
const hasContent  = computed(() => !!(props.coin.value || props.coin.denomination));

// Motif size: large when alone, smaller when sharing face with value/denom
const motifFontSize = computed(() =>
  hasContent.value ? s.value * 0.20 : s.value * 0.38,
);

// Motif vertical position.
// Most unicode symbols sit high in their em-box, so dominant-baseline="middle"
// undershoots the visual centre → +0.05s nudge.
// Exception: ♔ crown is a chess piece designed to sit on a baseline; its
// visual centre is already at cy with no nudge.
const motifY = computed(() => {
  if (!hasContent.value) {
    const nudge = props.coin.motif === "crown" ? 0 : s.value * 0.05;
    return cy.value + nudge;
  }
  return cy.value - s.value * 0.10;
});

// Value font size: smaller when motif is present
const valueFontSize = computed(() =>
  motifSymbol.value ? s.value * 0.16 : s.value * 0.26,
);

const valueY = computed(() => {
  if (motifSymbol.value) return cy.value + s.value * 0.17;
  if (props.coin.denomination) return cy.value - s.value * 0.05;
  return cy.value;
});

const denomFontSize = computed(() => s.value * 0.09);
const denomY = computed(() => {
  if (motifSymbol.value && props.coin.value) return cy.value + s.value * 0.30;
  if (props.coin.value)                      return cy.value + s.value * 0.20;
  if (motifSymbol.value)                     return cy.value + s.value * 0.18;
  return cy.value + s.value * 0.10;
});

const rimFontSize      = computed(() => s.value * 0.088);
const rimLetterSpacing = computed(() => s.value * 0.012);
</script>
