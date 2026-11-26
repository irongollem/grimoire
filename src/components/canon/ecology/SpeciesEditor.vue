<template>
  <CanonEntryPane kind="Species" letterhead delete-label="Delete this species" close-label="Close this species" data-testid="species-editor" @close="emit('close')" @delete="remove">
    <template #rank><SpeciesRank :species="species" /></template>
    <template #title>
      <InlineEditText :model-value="species.name" required placeholder="A name" ariaLabel="The species' common name" :maxlength="80" text-class="text-title font-bold" @commit="(v) => v !== null && updateSpecies(species.id, { name: v })" />
      <InlineEditText :model-value="species.scientificName" placeholder="Add a scientific name" ariaLabel="The scientific name" :maxlength="120" text-class="italic text-heading-sm" @commit="(v) => updateSpecies(species.id, { scientificName: v })" />
    </template>

    <label class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="species-lives-as">
      <span class="text-body font-semibold">How it lives</span>
      <AppSelect :model-value="species.livesAs ?? NONE" size="sm" aria-label="How it lives" @update:model-value="(v: string) => setLivesAs(v)">
        <option :value="NONE">Choose…</option>
        <option v-for="l in LIVES_AS" :key="l" :value="l">{{ LIVES_AS_LABEL[l] }}</option>
      </AppSelect>
      <span class="text-caption text-muted-foreground">Grimoire uses it, with how common it is, to work out how often it is met.</span>
    </label>

    <div class="flex flex-col gap-1">
      <InlineEditRich v-model="draft.body" size="sm" allow-secrets :entity-mention-items="mentionItems" ariaLabel="What it is like" placeholder="What it looks like, how it lives, what a traveller notices first…" />
      <AutosaveStatus :status="status" :error="saveError" />
    </div>

    <CanonBlock title="Forms"><SpeciesForms :species="species" /></CanonBlock>
    <CanonBlock title="In the web" :suggest="suggestWeb"><SpeciesLinks :species="species" /></CanonBlock>
    <CanonBlock title="Lives in"><SpeciesHabitats :species="species" /></CanonBlock>
    <CanonBlock v-if="shows('when')" title="When it is about"><SpeciesWhen :species="species" /></CanonBlock>
    <CanonBlock v-if="shows('yields')" title="Yields"><SpeciesYields :species="species" /></CanonBlock>
    <CanonBlock v-if="shows('notes')" title="Notes"><SpeciesNotes :species="species" /></CanonBlock>
    <CanonAddFold :choices="choices" @choose="(key) => revealed.add(key)" />
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * The open species, in the Field guide's entry pane (#1283): its rank line, common and scientific names, how it lives, a
 * description that saves itself, its forms, its place in the web, the habitats it lives in and, folded under Add…, when it
 * is about, what it yields and the notes on it. Everything saves as it is changed; only the delete asks first.
 */
import { computed, reactive, watch } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import InlineEditRich from "@/components/common/controls/InlineEditRich.vue";
import InlineEditText from "@/components/common/controls/InlineEditText.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import CanonAddFold from "../kit/CanonAddFold.vue";
import CanonBlock from "../kit/CanonBlock.vue";
import CanonEntryPane from "../kit/CanonEntryPane.vue";
import SpeciesForms from "./SpeciesForms.vue";
import SpeciesHabitats from "./SpeciesHabitats.vue";
import SpeciesLinks from "./SpeciesLinks.vue";
import SpeciesNotes from "./SpeciesNotes.vue";
import SpeciesRank from "./SpeciesRank.vue";
import SpeciesWhen from "./SpeciesWhen.vue";
import SpeciesYields from "./SpeciesYields.vue";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { LIVES_AS_LABEL } from "@/lib/canon/ecology";
import { LIVES_AS, type Species } from "@/lib/canon/ecologyTypes";

const { species } = defineProps<{ species: Species }>();
const emit = defineEmits<{ delete: []; close: [] }>();

const { updateSpecies, removeSpecies, yields } = useSpeciesEditing();
const { data: entries } = useCanonEntries();
const { confirm } = useConfirm();
const { mentionItems } = useEntityMentionItems();

const NONE = "";
const suggestWeb = computed(() => `Suggest how ${species.name} lives among the other species.`);

function setLivesAs(value: string) {
  void updateSpecies(species.id, { livesAs: LIVES_AS.find((l) => l === value) ?? null });
}

interface DescriptionDraft { body: string | null }
const draft = reactive<DescriptionDraft>({ body: species.description });
const { status, saveError, dirty, reset } = useAutosave<DescriptionDraft>({
  draft,
  initial: () => ({ body: species.description }),
  equal: (a, b) => a.body === b.body,
  // A failed write resolves to null (already a toast); throwing makes the status line say it too.
  save: async (snapshot) => {
    if ((await updateSpecies(species.id, { description: snapshot.body })) === null) throw new Error("The description was not saved.");
  },
});
watch(() => species.description, (next) => {
  if (!dirty.value && next !== draft.body) reset({ body: next });
});

// The optional blocks show once they hold something, or once the DM chose them in Add…
const revealed = reactive(new Set<string>());
const has = computed<Record<string, boolean>>(() => ({
  when: species.activity !== null || Object.keys(species.seasons).length > 0,
  yields: yields.value.some((y) => y.speciesId === species.id),
  notes: (entries.value ?? []).some((e) => e.part === "truth" && e.species_id === species.id),
}));
const shows = (key: string): boolean => has.value[key] === true || revealed.has(key);
const CHOICES = [
  { key: "when", label: "When it is about" },
  { key: "yields", label: "Yields" },
  { key: "notes", label: "Notes" },
] as const;
const choices = computed(() => CHOICES.filter((c) => !shows(c.key)));

async function remove() {
  const ok = await confirm(`Delete "${species.name}"? Its forms, its links to other species and its place in each habitat are cleared. Notes on it stay, no longer tied to a species.`, {
    title: "Delete this species?",
    confirmLabel: "Delete species",
  });
  if (!ok) return;
  // A failed delete is already a toast, and the species stays open.
  if ((await removeSpecies(species.id)) === null) return;
  emit("delete");
}
</script>
