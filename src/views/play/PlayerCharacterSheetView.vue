<template>
  <div class="space-y-4 pb-8">
    <!-- No character linked -->
    <div v-if="!linkedMemberId" class="flex flex-col items-center gap-4 py-16 text-center">
      <p class="font-fell text-base text-muted-foreground italic">No character linked to your account.</p>
      <RouterLink to="/play" class="font-cinzel text-xs text-primary hover:underline">← Back</RouterLink>
    </div>

    <div v-else-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else-if="!member" class="flex flex-col items-center gap-4 py-16 text-center">
      <p class="font-fell text-base text-muted-foreground italic">Character not found.</p>
      <RouterLink to="/play" class="font-cinzel text-xs text-primary hover:underline">← Back</RouterLink>
    </div>

    <template v-else>
      <!-- Toolbar -->
      <div class="flex items-center gap-3">
        <RouterLink
          to="/play"
          class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
        >← Back</RouterLink>

        <select
          v-model="pageSize"
          class="ml-auto bg-card border border-border rounded px-2.5 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
        </select>

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
          <CharacterSheetRenderer
            :member="member"
            :inventory="inventory"
            :page-size="pageSize"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useCharacterSheetPdf, type SheetPageSize } from "@/composables/useCharacterSheetPdf";
import CharacterSheetRenderer from "@/components/character-sheet/CharacterSheetRenderer.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const auth = useAuthStore();
const ui = useUiStore();

// Derive the member ID from auth — never trust URL params for this
// (issue #419: players can only export their own sheet).
// DM preview mode uses dmPreviewPartyMemberId so DMs can see the player view.
const linkedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);

const { data: partyMembers, isLoading } = useParty();
const { data: inventoryItems } = usePartyInventory();

const member = computed(() =>
  partyMembers.value?.find((m) => m.id === linkedMemberId.value) ?? null,
);

const inventory = computed(() =>
  (inventoryItems.value ?? []).filter((i) => i.carried_by === linkedMemberId.value),
);

const pageSize = ref<SheetPageSize>("A4");
const { isGenerating, exportPdf } = useCharacterSheetPdf();

async function doExport() {
  if (!member.value) return;
  await exportPdf(member.value, inventory.value, pageSize.value);
}
</script>

<style scoped>
/* Preview: zoom collapses the rendered element's layout size (unlike transform:scale).
   The sheet is 794px wide; at 0.75 zoom it displays at ~596px — fits a phone viewport. */
.cs-preview-wrapper {
  display: inline-block;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  overflow: hidden;
}

.cs-preview-scaler {
  zoom: 0.75;
  pointer-events: none;
}
</style>
