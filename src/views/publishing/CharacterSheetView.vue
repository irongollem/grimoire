<template>
  <PageHeader title="Character Sheet" description="Export a printable PDF character sheet">
    <template #title-suffix>
      <ManualHelpLink page="character-sheet-export" />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else-if="!partyMembers?.length" class="flex flex-col items-center gap-4 py-16 text-center">
      <p class="font-fell text-base text-muted-foreground italic">No characters in the party yet.</p>
      <RouterLink to="/party" class="font-cinzel text-xs text-primary hover:underline">
        ← Go to the Party
      </RouterLink>
    </div>

    <template v-else>
      <!-- Character picker — the DM exporter isn't tied to a single member. -->
      <div class="mb-6 max-w-56">
        <EntityCombobox
          v-model="selectedId"
          :options="partyMembers"
          placeholder="Choose a character…"
        />
      </div>

      <!-- Keyed on the member so the panel reloads its per-character prefs on switch. -->
      <CharacterSheetExportPanel
        v-if="member"
        :key="memberId"
        :member="member"
        :inventory="inventory"
        :storage-key="memberId"
        :species-name="speciesName"
        :background-name="backgroundName"
      >
        <template #back>
          <RouterLink
            :to="backRoute"
            class="text-body text-muted-foreground hover:text-foreground transition-colors order-last"
          >
            ← Back
          </RouterLink>
        </template>
      </CharacterSheetExportPanel>
      <p v-else class="font-fell text-base text-muted-foreground italic py-16 text-center">
        Choose a character to preview their sheet.
      </p>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, RouterLink } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import CharacterSheetExportPanel from "@/components/character-sheet/CharacterSheetExportPanel.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useBackgroundNameMap } from "@/composables/useBackgrounds";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const auth = useAuthStore();

const { data: partyMembers, isLoading: partyLoading } = useParty();
const { data: inventoryItems, isLoading: inventoryLoading } = usePartyInventory();
const speciesMap = useSpeciesNameMap();
const backgroundMap = useBackgroundNameMap();

const isLoading = computed(() => partyLoading.value || inventoryLoading.value);

/** Selected character — seeds from the route param (when reached via
 *  /character-sheet/:id) and otherwise defaults to the first party member.
 *  The combobox writes here directly; no URL navigation needed. */
const selectedId = ref<string>((route.params.partyMemberId as string) ?? "");
watch(
  partyMembers,
  (members) => {
    if (!selectedId.value && members?.length) selectedId.value = members[0].id;
  },
  { immediate: true },
);

const memberId = computed(() => selectedId.value);

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
