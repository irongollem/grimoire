<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PartyMember } from "@/types/party.types";
import { useAllSpecies } from "@/composables/useSpecies";
import { useSetShapeshifterAppearance, useClearShapeshifterAppearance } from "@/composables/useParty";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ member: PartyMember }>();

const { data: allSpecies } = useAllSpecies();
const speciesOptions = computed(() => allSpecies.value ?? []);

const { mutate: setAppearance, isPending: setting } = useSetShapeshifterAppearance();
const { mutate: clearAppearance, isPending: clearing } = useClearShapeshifterAppearance();

const selectedSpeciesId = ref(props.member.disguise_species_id ?? "");

watch(() => props.member.disguise_species_id, (id) => {
  selectedSpeciesId.value = id ?? "";
});

function onAppearanceSelected(id: string) {
  selectedSpeciesId.value = id;
  if (id) setAppearance({ memberId: props.member.id, speciesId: id });
}
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground uppercase">
        Current Appearance
      </span>
      <button
        v-if="member.disguise_species_id"
        type="button"
        class="text-caption text-muted-foreground hover:text-destructive transition-colors italic"
        :disabled="clearing"
        @click="clearAppearance(member.id)"
      >
        {{ clearing ? 'Reverting…' : 'Revert to true form' }}
      </button>
    </div>
    <p v-if="!member.disguise_species_id" class="text-body text-muted-foreground/60 italic">
      Showing true form — pick a species below to take on a disguise.
    </p>
    <p v-else class="text-body text-muted-foreground italic">
      Appearing as
      <span class="text-foreground not-italic font-semibold">{{ member.disguise_race }}</span>
      <span v-if="setting" class="text-muted-foreground/60"> (saving…)</span>
    </p>
    <EntityCombobox
      :model-value="selectedSpeciesId"
      :options="speciesOptions"
      placeholder="Appear as…"
      @update:model-value="onAppearanceSelected"
    />
  </div>
</template>
