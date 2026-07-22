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
      <!-- Keyed on the member so the panel reloads its per-character prefs when DM
           preview mode switches to a different party member (PlayerLayout.vue's
           preview-member picker changes this without a route navigation). -->
      <CharacterSheetExportPanel
        :key="member.id"
        :member="member"
        :inventory="inventory"
        :storage-key="member.id"
        :species-name="speciesName"
        :background-name="backgroundName"
      >
        <template #back>
          <RouterLink
            to="/play"
            class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
          >← Back</RouterLink>
        </template>
      </CharacterSheetExportPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useBackgroundNameMap } from "@/composables/useBackgrounds";
import CharacterSheetExportPanel from "@/components/character-sheet/CharacterSheetExportPanel.vue";
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
const speciesMap = useSpeciesNameMap();
const backgroundMap = useBackgroundNameMap();

const member = computed(() =>
  partyMembers.value?.find((m) => m.id === linkedMemberId.value) ?? null,
);

const inventory = computed(() =>
  (inventoryItems.value ?? []).filter((i) => i.carried_by === linkedMemberId.value),
);

const speciesName = computed(() =>
  member.value?.species_id ? (speciesMap.value.get(member.value.species_id) ?? null) : null,
);
const backgroundName = computed(() =>
  member.value?.background_id ? (backgroundMap.value.get(member.value.background_id) ?? null) : null,
);
</script>
