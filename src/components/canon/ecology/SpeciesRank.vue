<template>
  <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 normal-case tracking-normal" data-testid="species-rank">
    <AppSelect v-if="editingKingdom" v-model="kingdomValue" size="xs" aria-label="Kingdom" data-testid="species-kingdom-select" @blur="editingKingdom = false">
      <option v-for="k in KINGDOMS" :key="k" :value="k">{{ KINGDOM_LABEL[k] }}</option>
    </AppSelect>
    <AppButton v-else variant="ghost" size="inline-caption" :label="KINGDOM_LABEL[species.kingdom]" tooltip="Change the kingdom" data-testid="species-kingdom" @click="editingKingdom = true" />

    <template v-if="!editingClade">
      <template v-for="(c, i) in path" :key="c.id">
        <span aria-hidden="true">/</span>
        <AppButton variant="ghost" size="inline-caption" :label="c.name" tooltip="Change the clade" data-testid="species-clade" @click="editingClade = true" />
        <span v-if="i === path.length - 1 && c.rank" class="text-caption italic">{{ c.rank }}</span>
      </template>
      <AppButton v-if="path.length === 0" variant="ghost" size="inline-caption" label="In no clade" tooltip="Choose a clade" data-testid="species-clade" @click="editingClade = true" />
    </template>
    <form v-else class="inline-flex flex-wrap items-center gap-1.5" data-testid="species-clade-editor" @submit.prevent="addClade">
      <!-- The clades are the DM's own and grow without bound: a searchable picker, not a native select. -->
      <EntityCombobox v-model="cladeValue" :options="cladeOptions" placeholder="Find a clade…" aria-label="Clade" class="w-56" data-testid="species-clade-picker" />
      <template v-if="cladeValue === NEW">
        <AppInput v-model="newName" size="xs" tone="filled" placeholder="Name of the clade" aria-label="Name of the new clade" maxlength="80" />
        <EntityCombobox v-model="newParent" :options="parentOptions" placeholder="Inside which clade…" aria-label="Inside which clade" class="w-56" />
        <AppButton type="submit" variant="outline" size="xs" label="Add clade" :disabled="newName.trim() === ''" />
      </template>
      <AppButton variant="ghost" size="xs" label="Done" @click="editingClade = false" />
    </form>
  </span>
</template>

<script setup lang="ts">
/**
 * The rank line over a species' name (#1283): its kingdom and the clades it sits in, each plain text until clicked. A click
 * turns the kingdom into a small select and the clade into a select of the campaign's clades with "New clade…", which asks
 * for a name and, optionally, the clade it lies inside. Every choice saves at once.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { cladePath, KINGDOM_LABEL } from "@/lib/canon/ecology";
import { KINGDOMS, type Kingdom, type Species } from "@/lib/canon/ecologyTypes";

const { species } = defineProps<{ species: Species }>();
const { clades, updateSpecies, addClade: createClade } = useSpeciesEditing();

const NONE = "__none";
const NEW = "__new";

const path = computed(() => cladePath(species.cladeId, clades.value));
const cladeOptions = computed(() => [
  { id: NONE, name: "In no clade" },
  ...clades.value.map((c) => ({ id: c.id, name: c.name })),
  { id: NEW, name: "New clade…" },
]);
const parentOptions = computed(() => [{ id: NONE, name: "Inside no other clade" }, ...clades.value.map((c) => ({ id: c.id, name: c.name }))]);

const editingKingdom = ref(false);
const kingdomValue = computed<Kingdom>({
  get: () => species.kingdom,
  set: (next) => {
    editingKingdom.value = false;
    if (next !== species.kingdom) void updateSpecies(species.id, { kingdom: next });
  },
});

const editingClade = ref(false);
const picked = ref<string | null>(null);
const cladeValue = computed<string>({
  get: () => picked.value ?? species.cladeId ?? NONE,
  set: (next) => {
    if (next === NEW) {
      picked.value = NEW;
      return;
    }
    picked.value = null;
    editingClade.value = false;
    const target = next === NONE ? null : next;
    if (target !== species.cladeId) void updateSpecies(species.id, { cladeId: target });
  },
});
const newName = ref("");
const newParent = ref(NONE);

async function addClade() {
  const name = newName.value.trim();
  if (name === "") return;
  const id = await createClade(name, newParent.value === NONE ? null : newParent.value);
  // A refused clade (a failed write) is already a toast; the form stays to try again.
  if (id === null) return;
  await updateSpecies(species.id, { cladeId: id });
  newName.value = "";
  newParent.value = NONE;
  picked.value = null;
  editingClade.value = false;
}
</script>
