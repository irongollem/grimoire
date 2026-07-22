<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Divine Smite</p>
    </div>
    <div class="divide-y divide-border">
      <div v-for="row in DIVINE_SMITE_TABLE" :key="row.slotLevel" class="flex items-center gap-3 px-4 py-2">
        <span class="text-label text-muted-foreground w-14 shrink-0">Slot {{ row.slotLevel }}</span>
        <span class="font-cinzel text-sm font-bold text-foreground flex-1">{{ row.damage }} radiant</span>
        <span class="text-caption text-muted-foreground italic shrink-0">{{ row.special }} vs undead/fiends</span>
      </div>
    </div>
    <div class="px-4 py-2 border-t border-border">
      <p class="text-caption text-muted-foreground italic">Expend a spell slot after a melee hit. Max 5d8 (+ 1d8 vs undead/fiends).</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const DIVINE_SMITE_TABLE = [
  { slotLevel: 1,   damage: "2d8", special: "3d8" },
  { slotLevel: 2,   damage: "3d8", special: "4d8" },
  { slotLevel: 3,   damage: "4d8", special: "5d8" },
  { slotLevel: "4+", damage: "5d8", special: "6d8" },
] as const;
</script>
