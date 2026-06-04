<!--
  IllustratedSheetDocument.vue — the full two-page illustrated character sheet:
  front (stats/combat) then back (roleplay/story). Each side is one IllustratedSheet
  whose root carries `.cs-page`, so the existing html2canvas → jsPDF loop in
  useCharacterSheetPdf captures both pages with no changes. Also used directly as
  the live export preview.
-->
<template>
  <div class="illustrated-doc">
    <IllustratedSheet
      :member="member"
      :inventory="inventory"
      side="front"
      :theme="theme"
      :page-size="pageSize"
      :species-name="speciesName"
      :background-name="backgroundName"
      :ac-bonus="acBonus"
      :debug="debug"
    />
    <IllustratedSheet
      :member="member"
      :inventory="inventory"
      side="back"
      :theme="theme"
      :page-size="pageSize"
      :species-name="speciesName"
      :background-name="backgroundName"
      :ac-bonus="acBonus"
      :debug="debug"
    />
  </div>
</template>

<script setup lang="ts">
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import IllustratedSheet from "./IllustratedSheet.vue";
import type { IllustratedTheme, SheetPageSize } from "./sheetTypes";

defineProps<{
  member: PartyMember;
  inventory: PartyInventoryItem[];
  theme: IllustratedTheme;
  pageSize: SheetPageSize;
  speciesName?: string | null;
  backgroundName?: string | null;
  /** Shield AC bonus added to the member's base AC. */
  acBonus?: number;
  /** Calibration aid: outline each overlay box (preview only). */
  debug?: boolean;
}>();
</script>

<style>
.illustrated-doc { display: flex; flex-direction: column; gap: 24px; }
</style>
