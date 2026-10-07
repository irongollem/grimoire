<template>
  <AppModal :open="memorial !== null" size="md" @close="emit('close')">
    <ModalHeader
      :title="memorial?.kind === 'retired' ? 'Their farewell' : 'Their last words'"
      :subtitle="memorial ? `Written for ${memorial.character_name}, and signed with your name.` : undefined"
      closeable
      @close="emit('close')"
    />
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      <RichTextEditor
        v-model="draft"
        size="md"
        placeholder="What did they say, or would they have said?"
      />
    </div>
    <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" size="md" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="md"
        label="Save"
        :loading="write.isPending.value"
        :disabled="!dirty"
        @click="save"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { useWriteLastWords } from "@/composables/memorials/useMemorials";
import { useToast } from "@/composables/useToast";
import { writtenOrNull } from "@/lib/memorials/writing";
import type { CharacterMemorial } from "@/types/memorial.types";

/**
 * The owner's last words for a memorial (#982). Open while `memorial` is set; saving writes
 * through `write_last_words`, which only the owner of the character may call. An editor
 * left empty clears the words rather than saving an empty document, so the card's invitation to
 * write them comes back.
 */
const props = defineProps<{ memorial: CharacterMemorial | null }>();
const emit = defineEmits<{ close: [] }>();

const toast = useToast();
const write = useWriteLastWords();
const draft = ref<string | null>(null);

watch(
  () => props.memorial?.id,
  () => {
    draft.value = props.memorial ? props.memorial.last_words : null;
  },
  { immediate: true },
);

const dirty = computed(() => {
  const stored = writtenOrNull(props.memorial?.last_words);
  const next = writtenOrNull(draft.value);
  return stored !== next;
});

/** Writes the draft through `write_last_words`; an emptied editor clears the words. */
function save() {
  const memorial = props.memorial;
  if (!memorial) return;
  write.mutate(
    { partyMemberId: memorial.party_member_id, lastWords: writtenOrNull(draft.value) },
    {
      onSuccess: () => emit("close"),
      onError: (e) => toast.error(toast.fromError(e, "Could not save their last words.")),
    },
  );
}
</script>
