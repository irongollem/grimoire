<template>
  <PageHeader title="Character Sheet" description="Export a printable PDF character sheet">

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else-if="!member" class="flex flex-col items-center gap-4 py-16 text-center">
      <p class="font-fell text-base text-muted-foreground italic">Character not found.</p>
      <RouterLink to="/party" class="font-cinzel text-xs text-primary hover:underline">← Party list</RouterLink>
    </div>

    <template v-else>
      <!-- Toolbar -->
      <div class="flex items-center gap-3 mb-6">
        <select
          v-model="pageSize"
          class="bg-card border border-border rounded px-2.5 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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

        <RouterLink
          :to="`/party`"
          class="font-fell text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to party
        </RouterLink>
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
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import CharacterSheetRenderer from "@/components/character-sheet/CharacterSheetRenderer.vue";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useCharacterSheetPdf, type SheetPageSize } from "@/composables/useCharacterSheetPdf";

const route = useRoute();
const memberId = computed(() => route.params.partyMemberId as string);

const { data: partyMembers, isLoading: partyLoading } = useParty();
const { data: inventoryItems, isLoading: inventoryLoading } = usePartyInventory();

const isLoading = computed(() => partyLoading.value || inventoryLoading.value);

const member = computed(() =>
  partyMembers.value?.find((m) => m.id === memberId.value) ?? null,
);

const inventory = computed(() =>
  (inventoryItems.value ?? []).filter((i) => i.carried_by === memberId.value),
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
   The sheet is 794px wide; at 0.85 zoom it displays at ~675px. */
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
