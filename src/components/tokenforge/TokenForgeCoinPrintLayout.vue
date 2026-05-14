<template>
  <div class="mint-print-layout mint-coin-print">
    <!-- Front sheet -->
    <div class="mint-print-sheet" :class="`coin-grid-${coin.printSize}`">
      <div v-for="(_, i) in frontCells" :key="`cf-${i}`" class="mint-coin-cell">
        <svg viewBox="0 0 100 100" class="mint-coin-svg" xmlns="http://www.w3.org/2000/svg">
          <CoinFace :coin="coin" :size="100" :uid="`cf-${i}`" />
        </svg>
      </div>
    </div>
    <!-- Back sheet — columns reversed per row for duplex alignment -->
    <div class="mint-print-sheet" :class="`coin-grid-${coin.printSize}`">
      <div v-for="(_, i) in backCells" :key="`cb-${i}`" class="mint-coin-cell">
        <svg viewBox="0 0 100 100" class="mint-coin-svg" xmlns="http://www.w3.org/2000/svg">
          <CoinFace :coin="coin" :size="100" :uid="`cb-${i}`" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CoinFace from "@/components/mint/CoinFace.vue";
import type { CoinDesign } from "@/types/coin.types";

const { coin, frontCells, backCells } = defineProps<{
  coin: CoinDesign;
  frontCells: unknown[];
  backCells: unknown[];
}>();
</script>

<style scoped>
.mint-print-layout {
  display: none;
}

@media print {
  .mint-print-layout {
    display: block;
  }

  .mint-print-sheet {
    display: grid;
    width: 210mm;
    height: 296.9mm;
    max-height: 296.9mm;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }

  /* Small: 24mm × 7 cols × 10 rows — centred on A4 */
  .coin-grid-small {
    grid-template-columns: repeat(7, 24mm);
    grid-template-rows: repeat(10, 24mm);
    padding: 18.5mm 21mm;
    gap: 0;
  }

  /* Standard: 30mm × 6 cols × 8 rows */
  .coin-grid-standard {
    grid-template-columns: repeat(6, 30mm);
    grid-template-rows: repeat(8, 30mm);
    padding: 28.5mm 15mm;
    gap: 0;
  }

  /* Large: 38mm × 5 cols × 7 rows */
  .coin-grid-large {
    grid-template-columns: repeat(5, 38mm);
    grid-template-rows: repeat(7, 38mm);
    padding: 15.5mm 10mm;
    gap: 0;
  }

  .mint-coin-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .mint-coin-svg {
    width: 100%;
    height: 100%;
  }
}
</style>
