<!--
  CharacterSheetExportPanel.vue — shared toolbar + live preview + PDF export for a
  character sheet. Used by both the DM (publishing) and player export views, which
  differ only in how they resolve the member. Owns the export-screen UI state
  (mode / page size / theme), persisted per character in localStorage.

  Mode "clean"      → the CSS-themed CharacterSheetRenderer (one page).
  Mode "illustrated"→ the baked-plate IllustratedSheetDocument (front + back).
-->
<template>
  <!-- A print dialog: the sheet sits centred on the page like paper on a desk,
       the settings live in a side card (stacked above the sheet on narrow
       screens). -->
  <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
    <!-- Preview (scaled-down rendition of the sheet).
         zoom collapses the rendered element's layout size (unlike transform:scale) —
         the sheet is 794px wide; at 0.75 zoom it displays at ~596px. -->
    <div class="order-last flex min-w-0 justify-center lg:order-first">
      <div class="sheet-preview inline-block max-w-full overflow-hidden rounded-lg border border-border shadow-lg">
        <div v-if="classInput" class="pointer-events-none zoom-[0.75] xl:zoom-[0.9]">
          <IllustratedSheetDocument
            v-if="mode === 'illustrated'"
            :member="member"
            :inventory="inventory"
            :class-input="classInput"
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
            :class-input="classInput"
            :page-size="pageSize"
            :theme="theme"
            :species-name="speciesName"
            :background-name="backgroundName"
            :ac-bonus="acBonus"
          />
        </div>
      </div>
    </div>

    <!-- Settings -->
    <aside class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-0">
      <slot name="subject" />

      <label class="flex flex-col gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Style</span>
        <AppSelect v-model="mode" size="sm" aria-label="Export style">
          <option value="clean">Clean</option>
          <option value="illustrated">Illustrated</option>
        </AppSelect>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Page size</span>
        <AppSelect v-model="pageSize" size="sm" aria-label="Page size">
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
        </AppSelect>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Theme</span>
        <AppSelect v-if="mode === 'clean'" v-model="theme" size="sm" aria-label="Theme">
          <option v-for="t in SHEET_THEMES" :key="t.id" :value="t.id">{{ t.label }}</option>
        </AppSelect>
        <AppSelect v-else v-model="illustratedTheme" size="sm" aria-label="Illustrated theme">
          <option v-for="t in ILLUSTRATED_THEMES" :key="t.id" :value="t.id">{{ t.label }}</option>
        </AppSelect>
      </label>

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
        class="w-full"
        :label="isGenerating ? 'Generating PDF…' : 'Export PDF'"
        :disabled="isGenerating || !classInput"
        @click="doExport"
      />

      <div class="flex justify-center">
        <slot name="back" />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import CharacterSheetRenderer from "@/components/character-sheet/CharacterSheetRenderer.vue";
import IllustratedSheetDocument from "@/components/character-sheet/illustrated/IllustratedSheetDocument.vue";
import type { PartyMember } from "@/types/party.types";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useAllCustomClasses, useAllSystemClasses } from "@/composables/rules/useCustomClasses";
import type { SheetClassInput } from "@/rules/sheetClassData";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import { useShieldAcBonus } from "@/composables/party/useShieldAc";
import {
  useCharacterSheetPdf,
  SHEET_THEMES,
  ILLUSTRATED_THEMES,
  type SheetPageSize,
  type SheetMode,
  type SheetTheme,
  type IllustratedTheme,
} from "@/composables/party/useCharacterSheetPdf";

const { member, inventory, storageKey, speciesName = null, backgroundName = null, items = [] } = defineProps<{
  member: PartyMember;
  inventory: PartyInventoryItem[];
  /** Per-character key for persisting the export-screen preferences. */
  storageKey: string;
  speciesName?: string | null;
  backgroundName?: string | null;
  /** Vault items backing equipped weapons — real attack math on the illustrated front.
   *  The caller supplies its context's catalog (DM: the vault items it holds, player: usePlayerItemProjection + useStoredItemRefs). */
  items?: Item[];
}>();

// AC delta over the stored `ac` — equipped shield plus the armor-derivation
// adjustment for the "armor" formula — added in both preview modes and the
// exported PDF so the sheet matches the live party tracker.
const { acFor } = useShieldAcBonus();
const acBonus = computed(() => (member ? acFor(member) - member.ac : 0));

// The sheet's hit dice and casting ability come from the class rows and the
// definitions they are pinned to. The sheet waits for all three to load rather
// than print a guess; a classless character is a loaded, empty row list.
const memberId = computed(() => member.id);
const { data: classRows } = useCharacterClasses(memberId);
const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();
const classInput = computed<SheetClassInput | null>(() =>
  classRows.value && systemClasses.value && customClasses.value
    ? { rows: classRows.value, definitions: { system: systemClasses.value, custom: customClasses.value } }
    : null,
);

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
  if (!classInput.value) return;
  await exportPdf(member, inventory, classInput.value, {
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
