<template>
  <div class="space-y-6 pb-8">
    <!-- Header row -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-heading-lg font-bold text-foreground">Choose a Species</h1>
        <p v-if="headerDescription" class="text-body text-muted-foreground italic mt-1">
          {{ headerDescription }}
        </p>
      </div>
      <AppButton
        to="/play"
        variant="subtle"
        size="sm"
        class="shrink-0"
        label="← Back"
      />
    </div>

    <!-- Filter bar -->
    <ListFilterBar
      :has-active-filters="ui.speciesHasActiveFilters"
      @clear="ui.resetSpeciesFilters()"
    >
      <ListSearchInput v-model="ui.speciesSearch" placeholder="Search species…" />
      <ListFilterGroup
        v-model="ui.speciesFilterSize"
        :options="SIZE_OPTIONS"
        aria-label="Species size filter"
      />
    </ListFilterBar>

    <!-- Species grid -->
    <SpeciesList
      :select-mode="true"
      :readonly="true"
      :selected-id="currentSpeciesId || undefined"
      @select="onSelect"
    />

    <!-- Confirmation panel -->
    <AppModal :open="!!pendingSpecies" size="md" align="sheet" @close="cancel">
      <ModalHeader
        :title="pendingSpecies?.name ?? ''"
        :subtitle="[pendingSpecies?.size, pendingSpecies?.speed?.walk ? `${pendingSpecies.speed.walk} ft` : null].filter(Boolean).join(' · ') || '—'"
      />

      <!-- Scrolls because the shell caps the panel at the viewport, where the old
           hand-rolled panel simply overflowed it. -->
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        <!-- Subrace picker (when species has subraces) -->
        <div v-if="pendingSpecies?.subraces?.length">
          <p class="text-eyebrow font-semibold text-muted-foreground mb-2">VARIANT</p>
          <AppSelect
            v-model="selectedSubrace"
            tone="filled"
            size="body"
            weight="normal"
            block
          >
            <option value="">— None —</option>
            <option v-for="sr in pendingSpecies.subraces" :key="sr.name" :value="sr.name">
              {{ sr.name }}
            </option>
          </AppSelect>
        </div>

        <!-- Languages to be added -->
        <div v-if="languagesToAdd.length > 0">
          <p class="text-eyebrow font-semibold text-muted-foreground mb-2">
            LANGUAGES GRANTED
          </p>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="l in languagesToAdd"
              :key="l"
              class="px-2 py-0.5 rounded-full bg-primary/10 font-cinzel text-xs text-primary"
            >
              {{ l }}
            </span>
          </div>
        </div>

        <!-- Speed note -->
        <p
          v-if="pendingSpecies?.speed?.walk && pendingSpecies.speed.walk !== me?.speed"
          class="text-caption text-muted-foreground italic"
        >
          Walk speed will be updated to {{ pendingSpecies.speed.walk }} ft.
        </p>

        <!-- Free-pick spell grants -->
        <div v-if="freePickGrants.length > 0">
          <p class="text-eyebrow font-semibold text-muted-foreground mb-2">
            SPELLS REQUIRING YOUR CHOICE
          </p>
          <div class="space-y-1">
            <div
              v-for="grant in freePickGrants"
              :key="grant.spell_name"
              class="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20"
            >
              <div class="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <span class="text-body text-foreground flex-1">{{ grant.spell_name }}</span>
              <span class="font-cinzel text-2xs text-amber-500">
                {{ grant.uses_per_day === null ? "At will" : `${grant.uses_per_day}/day` }}
              </span>
            </div>
          </div>
          <p class="text-caption text-muted-foreground italic mt-1.5">
            You'll be taken to your Innate Spells to add these manually.
          </p>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="shrink-0 flex gap-3 px-5 pb-5">
        <AppButton variant="subtle" size="md" class="flex-1" label="Cancel" @click="cancel" />
        <AppButton
          variant="primary"
          size="md"
          class="flex-1"
          :disabled="saving"
          :label="saving ? 'Saving…' : 'Confirm & Apply'"
          @click="confirm"
        />
      </div>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/party/useParty";
import SpeciesList from "@/components/species/SpeciesList.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { Species } from "@/types/species.types";
import { applySpeciesSpellGrants, removeSpeciesSpellGrants } from "@/composables/party/useCharacterSpells";
import { useAllSpecies } from "@/composables/rules/useSpecies";

const SIZE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tiny", label: "Tiny" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const { data: party } = useParty();
const { data: allSpecies } = useAllSpecies();
const { mutateAsync: update } = useUpdatePartyMember();

const resolvedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);
const me = computed(() => party.value?.find((m) => m.id === resolvedMemberId.value) ?? null);

const currentSpeciesId = computed(() => me.value?.species_id ?? "");

const headerDescription = computed(() => {
  if (!me.value) return null;
  return me.value.species_id
    ? `${me.value.name} — click a species card to change`
    : `${me.value.name} — no species selected`;
});

// ── Confirmation panel state ──────────────────────────────────────────────────

const pendingSpecies = ref<Species | null>(null);
const selectedSubrace = ref("");
const saving = ref(false);

/** Free-pick grants relevant to the selected subrace that need manual spell selection */
const freePickGrants = computed(() =>
  (pendingSpecies.value?.granted_spells ?? []).filter(
    (g) =>
      g.spell_id === null &&
      (g.subrace === null || g.subrace === (selectedSubrace.value || null)),
  ),
);

/** Languages from the new species that the member doesn't already have. */
const languagesToAdd = computed(() => {
  if (!pendingSpecies.value || !me.value) return [];
  return (pendingSpecies.value.languages ?? []).filter(
    (l) => !me.value!.languages.includes(l),
  );
});

function onSelect(species: Species) {
  pendingSpecies.value = species;
  selectedSubrace.value = "";
}

function cancel() {
  pendingSpecies.value = null;
  selectedSubrace.value = "";
}

async function confirm() {
  if (!me.value || !pendingSpecies.value) return;
  saving.value = true;
  try {
    // Strip the OLD species' grants before applying the new ones — otherwise a
    // Tiefling→Dwarf switch keeps Infernal + Thaumaturgy. Mirrors the background
    // picker's computeRemovals: drop old-species languages the new one doesn't
    // also grant (can't distinguish a language also granted by another source —
    // same limitation as the background flow).
    const oldSpecies = (allSpecies.value ?? []).find((s) => s.id === me.value!.species_id) ?? null;
    const newLangs = pendingSpecies.value.languages ?? [];
    const languagesToRemove = (oldSpecies?.languages ?? []).filter((l) => !newLangs.includes(l));
    const updatedLanguages = [
      ...me.value.languages.filter((l) => !languagesToRemove.includes(l)),
      ...languagesToAdd.value,
    ];
    await update({
      id: me.value.id,
      update: {
        species_id: pendingSpecies.value.id,
        subrace: selectedSubrace.value || null,
        languages: updatedLanguages,
        ...(pendingSpecies.value.speed?.walk !== undefined && pendingSpecies.value.speed.walk !== null
          ? { speed: pendingSpecies.value.speed.walk }
          : {}),
      },
    });
    // Drop the old species' innate spells, then seed the new species' grants
    // (returns free-pick grants to surface to the player).
    await removeSpeciesSpellGrants(me.value.id);
    const freePicks = await applySpeciesSpellGrants(
      me.value.id, pendingSpecies.value, me.value.level ?? 1, selectedSubrace.value || null,
    );
    // Navigate to innate spells tab so player can complete any free-pick selections
    router.push(freePicks.length > 0 ? "/play/spells?tab=innate" : "/play");
  } finally {
    saving.value = false;
  }
}
</script>
