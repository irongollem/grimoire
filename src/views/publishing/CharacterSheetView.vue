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
      <!-- Character picker — the DM exporter isn't tied to a single member.
           Once a character is chosen it moves into the settings card. -->
      <div v-if="!member" class="mx-auto mb-6 max-w-56">
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
        :items="items"
      >
        <template #subject>
          <label class="flex flex-col gap-1.5">
            <span class="text-label-lg font-semibold text-muted-foreground">Character</span>
            <EntityCombobox
              v-model="selectedId"
              :options="partyMembers"
              placeholder="Choose a character…"
            />
          </label>
        </template>
        <template #back>
          <RouterLink
            :to="backRoute"
            class="text-body text-muted-foreground hover:text-foreground transition-colors"
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
import { useParty } from "@/composables/party/useParty";
import { provideCharacterRuleset } from "@/composables/rules/useRuleset";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useItems } from "@/composables/items/useItems";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { inventoryItemRef } from "@/lib/itemRef";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { useBackgroundNameMap } from "@/composables/rules/useBackgrounds";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const auth = useAuthStore();

const { data: partyMembers, isLoading: partyLoading } = useParty();

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

// The picker can switch character without a route change, so the scope follows
// `member`. The background map below lists that character's edition (useRuleset.ts).
provideCharacterRuleset(() => member.value);
const { data: inventoryItems, isLoading: inventoryLoading } = usePartyInventory();
const { resolvable } = useItems();
const { data: speciesById } = useSpeciesByIds(() => [member.value?.species_id]);
const backgroundMap = useBackgroundNameMap();

const isLoading = computed(() => partyLoading.value || inventoryLoading.value);

const inventory = computed(() =>
  (inventoryItems.value ?? []).filter((i) => i.carried_by === memberId.value),
);
// Carried rows resolve in `resolvable`, not the edition-narrowed browse list (#961).
const { items } = useStoredItemRefs(() => inventory.value.map(inventoryItemRef), resolvable);

/** Resolved names — fall back to null if the lookup maps aren't loaded yet */
const speciesName = computed(() =>
  member.value?.species_id ? (speciesById.value.get(member.value.species_id)?.name ?? null) : null,
);
const backgroundName = computed(() =>
  member.value?.background_id ? (backgroundMap.value.get(member.value.background_id) ?? null) : null,
);

/** Players go back to /play, the DM goes back to /party */
const backRoute = computed(() => auth.isDM ? "/party" : "/play");
</script>
