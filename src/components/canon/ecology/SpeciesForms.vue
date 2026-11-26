<template>
  <div class="flex flex-col gap-2" data-testid="species-forms">
    <ul v-if="mine.length > 0" class="m-0 flex list-none flex-col gap-1.5 p-0">
      <li v-for="f in mine" :key="f.id" class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="species-form">
        <InlineEditText :model-value="f.label" required placeholder="A stage" :ariaLabel="`Stage of ${f.label}`" :maxlength="60" text-class="text-body font-semibold" @commit="(v) => v !== null && updateForm(f.id, { label: v })" />
        <EntityMentionChip v-if="statBlockOf(f) !== null" entity-type="monster" :id="statBlockOf(f) as string" :editable="false" data-testid="form-stat-block" />
        <span v-else class="text-caption italic text-muted-foreground">No stat block</span>
        <span class="ml-auto flex items-center gap-2">
          <AppCheckbox :model-value="f.domesticated" label="Domesticated" label-role="caption" @update:model-value="(v: boolean) => updateForm(f.id, { domesticated: v })" />
          <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove the ${f.label} form`" data-testid="remove-form" @click="removeForm(f.id)" />
        </span>
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground">No form yet. A form is one age or breed of this species, with its own stat block.</p>

    <form class="flex flex-wrap gap-2" @submit.prevent="add">
      <div class="min-w-[min(100%,14rem)] flex-1">
        <MentionTextarea
          v-model="line"
          :items="bestiary"
          :rows="1"
          placeholder="A stage, or @ a stat block…"
          aria-label="A new form"
          input-class="field-input w-full resize-none text-body"
          @item-selected="(s) => (picked = { id: s.item.id, token: s.token, fromLibrary: statBlockFromLibrary(s.item.id) })"
          @keydown.enter="onEnter"
        />
      </div>
      <AppButton type="submit" variant="outline" class="whitespace-nowrap" :icon="IconAdd" icon-size="xs" label="Add form" :disabled="line.trim() === ''" />
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * A species' forms (#1283): one row per age or breed, each with its stat block as a chip, a Domesticated mark and a remove.
 * The add line is one line of words: the text before an @ is the stage and the @ picks a stat block from the bestiary
 * ("Young @Rime_Cub"); a stat block alone is an Adult. A stat block another species already uses is refused by the
 * composable, which says so.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import InlineEditText from "@/components/common/controls/InlineEditText.vue";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";
import EntityMentionChip from "@/components/tiptap/EntityMentionChip.vue";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { splitStageInput } from "@/lib/canon/fieldGuide";
import type { Species, SpeciesForm } from "@/lib/canon/ecologyTypes";
import { IconAdd, IconClose } from "@/lib/icons";

const { species } = defineProps<{ species: Species }>();
const { forms, addForm, updateForm, removeForm } = useSpeciesEditing();

const mine = computed(() => forms.value.filter((f) => f.speciesId === species.id).sort((a, b) => a.stageOrder - b.stageOrder));
/** The form's stat block id (the DM's own or a book's), or null when it has none. */
const statBlockOf = (f: SpeciesForm): string | null => (f.monsterId !== null ? f.monsterId : f.libraryMonsterId);

const { data: index } = useMonsterIndex();
const bestiary = computed(() => (index.value ?? []).map((m) => ({ id: m.id, label: m.name, entityType: "monster" as const })));
const statBlockFromLibrary = (id: string): boolean => index.value?.find((m) => m.id === id)?.is_shared ?? false;

const line = ref("");
const picked = ref<{ id: string; token: string; fromLibrary: boolean } | null>(null);

// The picker takes Enter for its own choice and marks the event handled; only a free Enter adds.
function onEnter(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  e.preventDefault();
  void add();
}

async function add() {
  const stage = splitStageInput(line.value, picked.value?.token ?? null, picked.value?.id ?? null);
  if (stage === null) return;
  const own = stage.itemId !== null && picked.value !== null && !picked.value.fromLibrary;
  const library = stage.itemId !== null && picked.value !== null && picked.value.fromLibrary;
  const id = await addForm(species.id, { label: stage.label, monsterId: own ? stage.itemId : null, libraryMonsterId: library ? stage.itemId : null });
  // A refusal (a stat block another species holds) is already a toast; the words stay to be changed.
  if (id === null) return;
  line.value = "";
  picked.value = null;
}
</script>
