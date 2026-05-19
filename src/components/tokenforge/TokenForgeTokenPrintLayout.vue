<template>
  <div class="mint-print-layout mint-token-print">
    <!-- Front sheet -->
    <div class="mint-print-sheet" :class="`token-grid-${printSize}`">
      <div v-for="(cell, i) in frontSheet" :key="`tf-${i}`" class="mint-token-cell">
        <img v-if="cell.front" :src="cell.front" class="mint-token-img" />
      </div>
    </div>
    <!-- Back sheet — columns reversed -->
    <div class="mint-print-sheet" :class="`token-grid-${printSize}`">
      <div v-for="(cell, i) in backSheet" :key="`tb-${i}`" class="mint-token-cell">
        <img v-if="cell.back" :src="cell.back" class="mint-token-img" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { printSize, frontSheet, backSheet } = defineProps<{
  printSize: string;
  frontSheet: { front: string; back: string }[];
  backSheet: { front: string; back: string }[];
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

  .token-grid-s25 {
    grid-template-columns: repeat(7, 25mm);
    grid-template-rows: repeat(10, 25mm);
    padding: 23.5mm 17.5mm;
    gap: 0;
  }

  .token-grid-s32 {
    grid-template-columns: repeat(6, 32mm);
    grid-template-rows: repeat(8, 32mm);
    padding: 20.5mm 9mm;
    gap: 0;
  }

  .token-grid-s50 {
    grid-template-columns: repeat(4, 50mm);
    grid-template-rows: repeat(5, 50mm);
    padding: 23.5mm 5mm;
    gap: 0;
  }

  .mint-token-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .mint-token-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 50%;
  }
}
</style>
