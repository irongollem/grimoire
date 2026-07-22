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

      <select
        v-model="mode"
        class="bg-card border border-border rounded px-2.5 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Export style"
      >
        <option value="clean">Clean</option>
        <option value="illustrated">Illustrated</option>
      </select>

      <select
        v-model="pageSize"
        class="bg-card border border-border rounded px-2.5 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Page size"
      >
        <option value="A4">A4</option>
        <option value="Letter">Letter</option>
      </select>

      <select
        v-if="mode === 'clean'"
        v-model="theme"
        class="bg-card border border-border rounded px-2.5 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Theme"
      >
        <option v-for="t in SHEET_THEMES" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>

      <select
        v-else
        v-model="illustratedTheme"
        class="bg-card border border-border rounded px-2.5 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Illustrated theme"
      >
        <option v-for="t in ILLUSTRATED_THEMES" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>

      <!-- Calibration overlay toggle — preview only; never affects the exported PDF. -->
      <button
        v-if="mode === 'illustrated'"
        type="button"
        :aria-pressed="showBoxes"
        class="rounded border px-2.5 py-1.5 font-cinzel text-xs tracking-wide transition-colors"
        :class="showBoxes
          ? 'border-primary bg-primary/15 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="showBoxes = !showBoxes"
      >
        Boxes
      </button>

      <button
        type="button"
        :disabled="isGenerating"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="doExport"
      >
        {{ isGenerating ? "Generating PDF…" : "Export PDF" }}
      </button>
    </div>

    <!-- Preview (scaled-down rendition of the sheet) -->
    <div class="cs-preview-wrapper">
      <div class="cs-preview-scaler">
        <IllustratedSheetDocument
          v-if="mode === 'illustrated'"
          :member="member"
          :inventory="inventory"
          :theme="illustratedTheme"
          :page-size="pageSize"
          :species-name="speciesName"
          :background-name="backgroundName"
          :ac-bonus="acBonus"
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
import CharacterSheetRenderer from "@/components/character-sheet/CharacterSheetRenderer.vue";
import IllustratedSheetDocument from "@/components/character-sheet/illustrated/IllustratedSheetDocument.vue";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
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

const { member, inventory, storageKey, speciesName = null, backgroundName = null } = defineProps<{
  member: PartyMember;
  inventory: PartyInventoryItem[];
  /** Per-character key for persisting the export-screen preferences. */
  storageKey: string;
  speciesName?: string | null;
  backgroundName?: string | null;
}>();

// Shield AC bonus from equipped shields — added to base AC in both preview modes
// and the exported PDF so the sheet matches the live party tracker.
const { bonusFor: shieldAcBonusFor } = useShieldAcBonus();
const acBonus = computed(() => shieldAcBonusFor(member?.id));

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
  });
}
</script>

<style scoped>
/* Preview: zoom collapses the rendered element's layout size (unlike transform:scale).
   The sheet is 794px wide; at 0.75 zoom it displays at ~596px. */
.cs-preview-wrapper {
  display: inline-block;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  max-width: 100%;
}
.cs-preview-scaler {
  zoom: 0.75;
  pointer-events: none;
}
</style>
