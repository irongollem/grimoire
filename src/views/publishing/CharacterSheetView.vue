<template>
  <PageHeader title="Character Sheet" description="Export a printable PDF character sheet">

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else-if="!member" class="flex flex-col items-center gap-4 py-16 text-center">
      <p class="font-fell text-base text-muted-foreground italic">Character not found.</p>
      <RouterLink :to="backRoute" class="font-cinzel text-xs text-primary hover:underline">
        ← Back
      </RouterLink>
    </div>

    <template v-else>
      <CharacterSheetExportPanel
        :member="member"
        :inventory="inventory"
        :storage-key="memberId"
        :species-name="speciesName"
        :background-name="backgroundName"
      >
        <template #back>
          <RouterLink
            :to="backRoute"
            class="font-fell text-sm text-muted-foreground hover:text-foreground transition-colors order-last"
          >
            ← Back
          </RouterLink>
        </template>
      </CharacterSheetExportPanel>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, RouterLink } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import CharacterSheetExportPanel from "@/components/character-sheet/CharacterSheetExportPanel.vue";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useBackgroundNameMap } from "@/composables/useBackgrounds";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const auth = useAuthStore();

const memberId = computed(() => route.params.partyMemberId as string);

const { data: partyMembers, isLoading: partyLoading } = useParty();
const { data: inventoryItems, isLoading: inventoryLoading } = usePartyInventory();
const speciesMap = useSpeciesNameMap();
const backgroundMap = useBackgroundNameMap();

const isLoading = computed(() => partyLoading.value || inventoryLoading.value);

const member = computed(() =>
  partyMembers.value?.find((m) => m.id === memberId.value) ?? null,
);

const inventory = computed(() =>
  (inventoryItems.value ?? []).filter((i) => i.carried_by === memberId.value),
);

/** Resolved names — fall back to null if the lookup maps aren't loaded yet */
const speciesName = computed(() =>
  member.value?.species_id ? (speciesMap.value.get(member.value.species_id) ?? null) : null,
);
const backgroundName = computed(() =>
  member.value?.background_id ? (backgroundMap.value.get(member.value.background_id) ?? null) : null,
);

/** Players go back to /play, the DM goes back to /party */
const backRoute = computed(() => auth.isDM ? "/party" : "/play");
</script>
