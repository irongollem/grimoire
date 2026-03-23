<template>
  <div class="space-y-3">
    <!-- My note -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">My Note</span>
        <button
          type="button"
          :title="isPrivate ? 'Private — only you can see this' : 'Shared — visible to everyone in the campaign'"
          class="inline-flex items-center gap-1.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors px-2 py-0.5 rounded border"
          :class="isPrivate
            ? 'text-muted-foreground border-border hover:border-foreground/30'
            : 'text-elven-green border-elven-green/30 bg-elven-green/10'"
          @click="isPrivate = !isPrivate"
        >
          <Lock v-if="isPrivate" class="h-3 w-3" />
          <Globe v-else class="h-3 w-3" />
          {{ isPrivate ? 'Private' : 'Shared' }}
        </button>
      </div>
      <div class="p-3 space-y-2">
        <RichTextEditor v-model="content" :placeholder="placeholder" min-height="100px" />
        <div class="flex items-center justify-between">
          <span class="font-cinzel text-[10px] tracking-wider" :class="saved ? 'text-muted-foreground/50' : 'text-muted-foreground/40'">
            {{ saved ? 'Saved' : 'Unsaved changes' }}
          </span>
          <div class="flex items-center gap-2">
            <button
              v-if="myNote"
              type="button"
              class="font-cinzel text-[10px] text-muted-foreground/50 hover:text-destructive tracking-wider transition-colors"
              @click="clearNote"
            >
              Clear
            </button>
            <button
              type="button"
              :disabled="saving || saved"
              class="font-cinzel text-[10px] text-primary hover:opacity-80 tracking-wider transition-opacity disabled:opacity-40"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Others' shared notes -->
    <div v-if="partyNotes.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
          Party Notes
          <span class="font-fell font-normal text-muted-foreground/60"> · {{ partyNotes.length }}</span>
        </span>
      </div>
      <div class="divide-y divide-border">
        <div v-for="note in partyNotes" :key="note.id" class="px-3 py-2.5">
          <RichTextViewer :content="note.content" />
          <p class="font-cinzel text-[10px] text-muted-foreground/40 tracking-wider mt-1">
            {{ note.updated_at?.slice(0, 10) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Lock, Globe } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import {
  useEntityNotes,
  useCreateEntityNote,
  useUpdateEntityNote,
  useDeleteEntityNote,
} from "@/composables/useEntityNotes";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props = withDefaults(defineProps<{
  entityType: string;
  entityId: string;
  placeholder?: string;
}>(), {
  placeholder: "Write your note…",
});

const auth = useAuthStore();
const myUserId = computed(() => auth.user?.id ?? "");

const { data: notes } = useEntityNotes(props.entityType, props.entityId);
const createMut = useCreateEntityNote();
const updateMut = useUpdateEntityNote();
const deleteMut = useDeleteEntityNote();

const myNote = computed(() => notes.value?.find((n) => n.user_id === myUserId.value) ?? null);
const partyNotes = computed(() => (notes.value ?? []).filter((n) => n.user_id !== myUserId.value && !n.is_private));

const content   = ref<string | null>(null);
const isPrivate = ref(true);
const saving    = ref(false);
const saved     = ref(true);

// Initialise form from loaded note
watch(myNote, (note) => {
  if (note) {
    content.value   = note.content;
    isPrivate.value = note.is_private;
  }
}, { immediate: true });

// Mark unsaved when content or privacy changes
watch([content, isPrivate], () => { saved.value = false; });

async function save() {
  saving.value = true;
  try {
    if (myNote.value) {
      await updateMut.mutateAsync({
        id: myNote.value.id,
        content: content.value ?? "",
        is_private: isPrivate.value,
        entity_type: props.entityType,
        entity_id: props.entityId,
      });
    } else {
      await createMut.mutateAsync({
        entity_type: props.entityType,
        entity_id: props.entityId,
        content: content.value ?? "",
        is_private: isPrivate.value,
      });
    }
    saved.value = true;
  } finally {
    saving.value = false;
  }
}

async function clearNote() {
  if (!myNote.value) return;
  await deleteMut.mutateAsync({
    id: myNote.value.id,
    entity_type: props.entityType,
    entity_id: props.entityId,
  });
  content.value   = null;
  isPrivate.value = true;
  saved.value     = true;
}
</script>
