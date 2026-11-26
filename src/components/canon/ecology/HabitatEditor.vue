<template>
  <CanonEntryPane kind="Habitat" letterhead delete-label="Delete this habitat" close-label="Close this habitat" data-testid="habitat-editor" @close="emit('close')" @delete="remove">
    <template #rank>Habitat · {{ placeCount === 1 ? "1 place" : `${placeCount} places` }}</template>
    <template #title>
      <InlineEditText :model-value="habitat.name" required placeholder="A kind of country…" ariaLabel="The habitat's name" text-class="text-title font-bold" :maxlength="80" @commit="rename" />
    </template>

    <div class="flex flex-col gap-1">
      <InlineEditRich v-model="draft.body" allow-secrets :entity-mention-items="mentionItems" ariaLabel="What it is like" placeholder="Its weather, its look, what a traveller meets there…" />
      <AutosaveStatus :status="status" :error="saveError" />
    </div>

    <CanonBlock title="The places it covers"><HabitatPlaces :habitat="habitat" /></CanonBlock>
    <CanonBlock title="What lives here" :suggest="suggestLife"><HabitatLife :habitat="habitat" /></CanonBlock>
    <CanonBlock title="Notes on the living world"><HabitatNotes :habitat="habitat" /></CanonBlock>
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * The open habitat, in the chapter's entry pane: its name and a description that each save as they are left, the places it covers, what
 * lives there as shares and the notes on the living world that belong to it. Everything saves as it is changed; only the
 * delete asks first.
 */
import { computed, reactive, watch } from "vue";
import InlineEditRich from "@/components/common/controls/InlineEditRich.vue";
import InlineEditText from "@/components/common/controls/InlineEditText.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import CanonBlock from "../kit/CanonBlock.vue";
import CanonEntryPane from "../kit/CanonEntryPane.vue";
import HabitatLife from "./HabitatLife.vue";
import HabitatNotes from "./HabitatNotes.vue";
import HabitatPlaces from "./HabitatPlaces.vue";
import { useHabitatEditing } from "@/composables/canon/useCampaignHabitats";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import type { Habitat } from "@/lib/canon/habitats";

const { habitat } = defineProps<{ habitat: Habitat }>();
const emit = defineEmits<{ delete: []; close: [] }>();

const { places, renameHabitat, saveDescription, removeHabitat } = useHabitatEditing();
const { confirm } = useConfirm();
const { mentionItems } = useEntityMentionItems();

const suggestLife = computed(() => `Suggest the creatures that live in the habitat "${habitat.name}".`);

const placeCount = computed(() => places.value.filter((p) => p.habitatId === habitat.id).length);
// The name is required, so a commit always carries words.
const rename = (next: string | null) => {
  if (next !== null) renameHabitat(habitat.id, next);
};

interface DescriptionDraft { body: string | null }
const draft = reactive<DescriptionDraft>({ body: habitat.description });
const { status, saveError, dirty, reset } = useAutosave<DescriptionDraft>({
  draft,
  initial: () => ({ body: habitat.description }),
  equal: (a, b) => a.body === b.body,
  save: (snapshot) => saveDescription(habitat.id, snapshot.body),
});
watch(() => habitat.description, (next) => {
  if (!dirty.value && next !== draft.body) reset({ body: next });
});

async function remove() {
  const ok = await confirm(`Delete "${habitat.name}"? The places it covers and the creatures listed here are cleared. Notes on the living world stay, no longer tied to a habitat.`, {
    title: "Delete this habitat?",
    confirmLabel: "Delete habitat",
  });
  if (!ok) return;
  removeHabitat(habitat.id);
  emit("delete");
}
</script>
