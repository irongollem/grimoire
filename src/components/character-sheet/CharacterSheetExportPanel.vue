<!--
  CharacterSheetExportPanel.vue — shared toolbar + live preview + PDF export for a
  character sheet. Used by both the DM (publishing) and player export views, which
  differ only in how they resolve the member. Owns the export-screen UI state
  (mode / page size / theme), persisted per character in localStorage.

  Mode "clean"      → the CSS-themed CharacterSheetRenderer (one page).
  Mode "illustrated"→ the baked-plate IllustratedSheetDocument (front + back).
-->
<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <slot name="back" />

      <AppSelect v-model="mode" size="sm" aria-label="Export style">
        <option value="clean">Clean</option>
        <option value="illustrated">Illustrated</option>
      </AppSelect>

      <AppSelect v-model="pageSize" size="sm" aria-label="Page size">
        <option value="A4">A4</option>
        <option value="Letter">Letter</option>
      </AppSelect>

      <AppSelect v-if="mode === 'clean'" v-model="theme" size="sm" aria-label="Theme">
        <option v-for="t in SHEET_THEMES" :key="t.id" :value="t.id">{{ t.label }}</option>
      </AppSelect>

      <AppSelect v-else v-model="illustratedTheme" size="sm" aria-label="Illustrated theme">
        <option v-for="t in ILLUSTRATED_THEMES" :key="t.id" :value="t.id">{{ t.label }}</option>
      </AppSelect>

      <!-- Calibration overlay toggle — preview only; never affects the exported PDF. -->
      <AppButton
        v-if="mode === 'illustrated'"
        variant="subtle"
        size="sm"
        label="Boxes"
        :active="showBoxes"
        :aria-pressed="showBoxes"
        @click="showBoxes = !showBoxes"
      />

      <AppButton
        variant="primary"
        size="md"
        :label="isGenerating ? 'Generating PDF…' : 'Export PDF'"
        :disabled="isGenerating"
        @click="doExport"
      />
    </div>

    <!-- Preview (scaled-down rendition of the sheet).
         zoom collapses the rendered element's layout size (unlike transform:scale) —
         the sheet is 794px wide; at 0.75 zoom it displays at ~596px. -->
    <div class="inline-block max-w-full overflow-hidden rounded-lg border border-border shadow-lg">
      <div class="pointer-events-none zoom-[0.75]">
        <IllustratedSheetDocument
          v-if="mode === 'illustrated'"
          :member="member"
          :inventory="inventory"
          :theme="illustratedTheme"
          :page-size="pageSize"
          :species-name="speciesName"
          :background-name="backgroundName"
          :ac-bonus="acBonus"
          :items="items"
          :debug="showBoxes"
        />
        <CharacterSheetRenderer
          v-else
          :member="member"
          :inventory="inventory"
          :page-size="pageSize"
          :theme="theme"
          :species-name="speciesName"
          :background-name="backgroundName"
          :ac-bonus="acBonus"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import CharacterSheetRenderer from "@/components/character-sheet/CharacterSheetRenderer.vue";
import IllustratedSheetDocument from "@/components/character-sheet/illustrated/IllustratedSheetDocument.vue";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import { useShieldAcBonus } from "@/composables/useShieldAc";
import {
  useCharacterSheetPdf,
  SHEET_THEMES,
  ILLUSTRATED_THEMES,
  type SheetPageSize,
  type SheetMode,
  type SheetTheme,
  type IllustratedTheme,
} from "@/composables/useCharacterSheetPdf";

const { member, inventory, storageKey, speciesName = null, backgroundName = null, items = [] } = defineProps<{
  member: PartyMember;
  inventory: PartyInventoryItem[];
  /** Per-character key for persisting the export-screen preferences. */
  storageKey: string;
  speciesName?: string | null;
  backgroundName?: string | null;
  /** Vault items backing equipped weapons — real attack math on the illustrated front.
   *  The caller supplies its context's catalog (DM: useItems, player: usePlayerVisibleItems). */
  items?: Item[];
}>();

// AC delta over the stored `ac` — equipped shield plus the armor-derivation
// adjustment for the "armor" formula — added in both preview modes and the
// exported PDF so the sheet matches the live party tracker.
const { acFor } = useShieldAcBonus();
const acBonus = computed(() => (member ? acFor(member) - member.ac : 0));

function read<T extends string>(prefix: string, fallback: T): T {
  if (!storageKey) return fallback;
  return (localStorage.getItem(`${prefix}-${storageKey}`) as T | null) ?? fallback;
}

const pageSize = ref<SheetPageSize>("A4");
const showBoxes = ref(false); // calibration overlay — preview only, never exported
const mode = ref<SheetMode>(read<SheetMode>("cs-mode", "clean"));
const theme = ref<SheetTheme>(read<SheetTheme>("cs-theme", "default"));
const illustratedTheme = ref<IllustratedTheme>(read<IllustratedTheme>("cs-illus-theme", "classic"));

watch(mode, (v) => storageKey && localStorage.setItem(`cs-mode-${storageKey}`, v));
watch(theme, (v) => storageKey && localStorage.setItem(`cs-theme-${storageKey}`, v));
watch(illustratedTheme, (v) => storageKey && localStorage.setItem(`cs-illus-theme-${storageKey}`, v));

const { isGenerating, exportPdf } = useCharacterSheetPdf();

async function doExport() {
  await exportPdf(member, inventory, {
    pageSize: pageSize.value,
    mode: mode.value,
    theme: theme.value,
    illustratedTheme: illustratedTheme.value,
    speciesName,
    backgroundName,
    acBonus: acBonus.value,
    items,
  });
}
</script>
