<template>
  <section class="flex flex-col gap-4 border border-border bg-card p-4" :aria-label="`The habitat ${habitat.name}`" data-testid="habitat-editor">
    <AppInput :key="revision" v-model.lazy="text" wrap size="body" tone="filled" maxlength="80" aria-label="The habitat's name" placeholder="A kind of country…" />

    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">What it is like</span>
      <RichTextEditor v-model="draft.body" size="sm" toolbar="focus" allow-secrets :entity-mention-items="mentionItems" placeholder="Its weather, its look, what a traveller meets there…" />
      <AutosaveStatus :status="status" :error="saveError" />
    </div>

    <HabitatPlaces :habitat="habitat" />
    <HabitatLife :habitat="habitat" />
    <HabitatNotes :habitat="habitat" />

    <AppButton variant="destructive" size="sm" :icon="IconDelete" icon-size="xs" label="Delete this habitat" class="self-start" @click="remove" />
  </section>
</template>

<script setup lang="ts">
/**
 * The selected habitat: its name, a description that saves itself, the places it covers, what lives there as shares and
 * the notes on the living world that belong to it. Everything saves as it is changed; only the delete asks first.
 */
import { reactive, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import HabitatLife from "./HabitatLife.vue";
import HabitatNotes from "./HabitatNotes.vue";
import HabitatPlaces from "./HabitatPlaces.vue";
import { useHabitatEditing } from "@/composables/canon/useCampaignHabitats";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { IconDelete } from "@/lib/icons";
import type { Habitat } from "@/lib/canon/habitats";

const { habitat } = defineProps<{ habitat: Habitat }>();
const emit = defineEmits<{ delete: [] }>();

const { renameHabitat, saveDescription, removeHabitat } = useHabitatEditing();
const { confirm } = useConfirm();
const { mentionItems } = useEntityMentionItems();

const { text, revision } = useCommittedText(() => habitat.name, (next) => renameHabitat(habitat.id, next));

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
