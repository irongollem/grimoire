<template>
  <div class="print-layout">
    <template v-for="(chunk, pi) in printChunks" :key="pi">
      <div
        class="print-sheet"
        :class="store.cardSize === 'tarot' ? 'tarot-sheet' : 'mtg-sheet'"
      >
        <template v-for="(subject, ci) in chunk" :key="`f-${ci}`">
          <template v-if="subject">
            <!-- Loot mode: items only, LootFront -->
            <LootFront
              v-if="store.mode === 'loot' && subject.kind === 'item'"
              :data="subject.data"
              :tarot="store.cardSize === 'tarot'"
              class="print-card"
            />
            <!-- Collection mode: per-style front -->
            <template v-else-if="store.mode === 'collection'">
              <CardTarotFront
                v-if="store.cardSize === 'tarot'"
                :subject="subject"
                :card-style="store.cardStyle"
                class="print-card"
              />
              <CardFront
                v-else
                :subject="subject"
                :card-style="store.cardStyle"
                class="print-card"
              />
            </template>
          </template>
          <div v-else class="print-card print-card-empty" />
        </template>
      </div>

      <div
        class="print-sheet"
        :class="store.cardSize === 'tarot' ? 'tarot-sheet' : 'mtg-sheet'"
      >
        <template
          v-for="(subject, ci) in backOrder(chunk)"
          :key="`b-${ci}`"
        >
          <template v-if="subject">
            <!-- Loot mode: shared deck back, repeated for every cell -->
            <LootBack
              v-if="store.mode === 'loot'"
              :tarot="store.cardSize === 'tarot'"
              class="print-card"
            />
            <!-- Collection mode: per-card back -->
            <template v-else>
              <CardTarotBack
                v-if="store.cardSize === 'tarot'"
                :subject="subject"
                :card-style="store.cardStyle"
                class="print-card"
              />
              <CardBack
                v-else
                :subject="subject"
                :card-style="store.cardStyle"
                class="print-card"
              />
            </template>
          </template>
          <div v-else class="print-card print-card-empty" />
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CardFront from "@/components/cardforge/CardFront.vue";
import CardBack from "@/components/cardforge/CardBack.vue";
import CardTarotFront from "@/components/cardforge/CardTarotFront.vue";
import CardTarotBack from "@/components/cardforge/CardTarotBack.vue";
import LootFront from "@/components/cardforge/styles/loot/LootFront.vue";
import LootBack from "@/components/cardforge/styles/loot/LootBack.vue";
import type { CardSubject } from "@/types/card.types";
import { useCardForgeStore } from "@/stores/cardForge";
import { useCardForgeData } from "@/composables/cardforge/useCardForgeData";

const store = useCardForgeStore();
const { selectedSubjects } = useCardForgeData();

const SIZE_META = {
  mtg: { cols: 3, perPage: 9 },
  tarot: { cols: 2, perPage: 4 },
} as const;

/** In loot mode, only items get printed (the source is forced to items
 *  but selectedSubjects merges every bucket, so filter here as well). */
const printSubjects = computed<CardSubject[]>(() =>
  store.mode === "loot"
    ? selectedSubjects.value.filter((s) => s.kind === "item")
    : selectedSubjects.value,
);

const printChunks = computed<(CardSubject | null)[][]>(() => {
  const { perPage } = SIZE_META[store.cardSize];
  const result: (CardSubject | null)[][] = [];
  for (let i = 0; i < printSubjects.value.length; i += perPage) {
    const chunk: (CardSubject | null)[] = printSubjects.value.slice(
      i,
      i + perPage,
    );
    while (chunk.length < perPage) chunk.push(null);
    result.push(chunk);
  }
  return result;
});

/** Reverse columns per row so duplex backs align with their fronts after a long-edge flip. */
function backOrder(chunk: (CardSubject | null)[]): (CardSubject | null)[] {
  const { cols } = SIZE_META[store.cardSize];
  return chunk.map((_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return chunk[row * cols + (cols - 1 - col)] ?? null;
  });
}
</script>

<!--
  Print pipeline owns ALL print-related CSS. Card design files never need
  @media print rules — `.print-card` flows down to the active shell via the
  single-rooted dispatchers and forces card-cell sizing here.
-->
<style>
@page {
  size: A4 portrait;
  margin: 0;
}

@media print {
  /* Hide app shell chrome so only the card sheets print */
  aside,
  header,
  .chat-no-print {
    display: none !important;
  }
  /* Flatten the Vue layout chain so no flex container constrains print flow */
  body,
  #app,
  body > div,
  body > div > div,
  body > div > div > div {
    display: block !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  main {
    overflow: visible !important;
    padding: 0 !important;
    height: auto !important;
  }
}
</style>

<style scoped>
.print-layout {
  display: none;
}

@media print {
  .print-layout {
    display: block;
  }
  /*
   * 296.9mm = 0.1mm shorter than A4 (297mm).
   * page-break-inside: avoid bumps each sheet to its own page; the 0.1mm
   * gap means the next sheet never fits on the current page without an
   * explicit break-after/before (avoids Safari's blank-page bug).
   * @page { margin: 0 } eliminates browser print margins so all CSS
   * measurements are from the physical page edge — front and back are
   * physically symmetric and duplex-aligned without manual margin tweaks.
   */
  .print-sheet {
    display: grid;
    width: 210mm;
    height: 296.9mm;
    max-height: 296.9mm;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* MTG: 3×3 grid on A4, 5mm gap between cards.
   * H: 2×5.5mm padding + 3×63mm cards + 2×5mm gaps = 210mm ✓
   * V: 2×11.45mm padding + 3×88mm cards + 2×5mm gaps = 296.9mm ✓ */
  .mtg-sheet {
    grid-template-columns: repeat(3, 63mm);
    grid-template-rows: repeat(3, 88mm);
    padding: 11.45mm 5.5mm;
    gap: 5mm;
  }
  /* Tarot: 2×2 grid on A4, 5mm gap between cards.
   * H: 2×32.5mm padding + 2×70mm cards + 1×5mm gap = 210mm ✓
   * V: 2×25.95mm padding + 2×120mm cards + 1×5mm gap = 296.9mm ✓ */
  .tarot-sheet {
    grid-template-columns: repeat(2, 70mm);
    grid-template-rows: repeat(2, 120mm);
    padding: 25.95mm 32.5mm;
    gap: 5mm;
  }
  /* Card sizing: 1mm bleed each side so colours fully cover cut lines.
   * Dispatchers are single-rooted, so this print-card class flows down
   * to the active shell — designs never need their own @media print sizing. */
  .mtg-sheet .print-card {
    width: 65mm !important;
    height: 90mm !important;
    margin: -1mm !important;
    border-radius: 3mm !important;
    overflow: hidden;
    box-shadow: none !important;
    transition: none !important;
    animation: none !important;
  }
  .tarot-sheet .print-card {
    width: 72mm !important;
    height: 122mm !important;
    margin: -1mm !important;
    border-radius: 3mm !important;
    overflow: hidden;
    box-shadow: none !important;
    transition: none !important;
    animation: none !important;
  }
  .print-card-empty {
    background: transparent;
  }
}
</style>
