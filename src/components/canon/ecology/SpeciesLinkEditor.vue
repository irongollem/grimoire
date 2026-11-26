<template>
  <div class="ml-2 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3" data-testid="species-link-editor">
    <AppInput v-model.lazy="note" tone="filled" size="sm" maxlength="200" aria-label="A note on this link" placeholder="A note: in winter only, when the other is young…" />
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label class="flex items-center gap-2 text-label text-muted-foreground">
        Where
        <AppSelect :model-value="link.habitatId ?? NONE" size="sm" aria-label="Where it happens" @update:model-value="(v: string) => updateLink(link.id, { habitatId: v === NONE ? null : v })">
          <option :value="NONE">Wherever they meet</option>
          <option v-for="h in habitats" :key="h.id" :value="h.id">{{ h.name }}</option>
        </AppSelect>
      </label>
      <label class="flex items-center gap-2 text-label text-muted-foreground">
        {{ species.name }}, at
        <AppSelect :model-value="ownFormId ?? NONE" size="sm" :aria-label="`Age of ${species.name}`" @update:model-value="(v: string) => setSide('own', v)">
          <option :value="NONE">any age</option>
          <option v-for="f in ownForms" :key="f.id" :value="f.id">{{ f.label }}</option>
        </AppSelect>
      </label>
      <label v-if="otherSpecies !== null" class="flex items-center gap-2 text-label text-muted-foreground">
        {{ otherSpecies.name }}, at
        <AppSelect :model-value="otherFormId ?? NONE" size="sm" :aria-label="`Age of ${otherSpecies.name}`" @update:model-value="(v: string) => setSide('other', v)">
          <option :value="NONE">any age</option>
          <option v-for="f in otherForms" :key="f.id" :value="f.id">{{ f.label }}</option>
        </AppSelect>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One link's small editor (#1283): its note, the habitat it holds in ("wherever they meet" otherwise) and the age of each
 * species it is about, read from the open species' side whichever way the link was written.
 */
import { computed, ref, watch } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import type { Species, SpeciesLink } from "@/lib/canon/ecologyTypes";

const { link, species } = defineProps<{ link: SpeciesLink; species: Species }>();
const { species: everyone, forms, updateLink } = useSpeciesEditing();
const { habitats } = useCampaignHabitats();

const NONE = "";

const forward = computed(() => link.fromSpeciesId === species.id);
const ownFormId = computed(() => (forward.value ? link.fromFormId : link.toFormId));
const otherFormId = computed(() => (forward.value ? link.toFormId : link.fromFormId));
const otherSpecies = computed<Species | null>(() => {
  const id = forward.value ? link.toSpeciesId : link.fromSpeciesId;
  return id === null ? null : (everyone.value.find((s) => s.id === id) ?? null);
});
const formsOf = (speciesId: string) => forms.value.filter((f) => f.speciesId === speciesId).sort((a, b) => a.stageOrder - b.stageOrder);
const ownForms = computed(() => formsOf(species.id));
const otherForms = computed(() => (otherSpecies.value === null ? [] : formsOf(otherSpecies.value.id)));

/** Writes the form on one side of the link, whichever column that side is. */
function setSide(side: "own" | "other", value: string) {
  const formId = value === NONE ? null : value;
  const isFrom = (side === "own") === forward.value;
  void updateLink(link.id, isFrom ? { fromFormId: formId } : { toFormId: formId });
}

// A cleared note is saved as no note; an unchanged one writes nothing.
const note = ref(link.note ?? "");
watch(() => link.note, (next) => { note.value = next ?? ""; });
watch(note, (typed) => {
  const next = typed.trim();
  if (next === (link.note ?? "")) return;
  void updateLink(link.id, { note: next === "" ? null : next });
});
</script>
