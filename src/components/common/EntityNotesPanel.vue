<template>
  <div class="flex flex-col gap-3">
    <h2 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">Notes</h2>

    <!-- Existing notes -->
    <div v-if="notes?.length" class="flex flex-col gap-2">
      <div
        v-for="note in notes"
        :key="note.id"
        class="rounded-md border bg-card overflow-hidden"
        :class="note.is_private ? 'border-border' : 'border-primary/20'"
      >
        <div class="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
          <IconLock v-if="note.is_private" class="h-3 w-3 text-muted-foreground shrink-0" />
          <IconFaction v-else class="h-3 w-3 text-primary/70 shrink-0" />
          <span class="font-cinzel text-2xs tracking-wider text-muted-foreground flex-1">
            {{ note.is_private ? "Private" : "Party" }} note
            <span v-if="note.user_id !== myUserId" class="italic"> · from DM/party</span>
          </span>
          <template v-if="note.user_id === myUserId">
            <button
              type="button"
              class="font-cinzel text-2xs tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              @click="startEdit(note)"
            >Edit</button>
            <button
              type="button"
              class="font-cinzel text-2xs tracking-wider text-destructive hover:opacity-70 transition-opacity"
              @click="deleteNote(note)"
            >Delete</button>
          </template>
        </div>

        <!-- Edit mode -->
        <div v-if="editingId === note.id" class="p-3 flex flex-col gap-2">
          <RichTextEditor v-model="editContent" min-height="100px" />
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" v-model="editPrivate" class="rounded" />
              <span class="font-cinzel text-2xs tracking-wider text-muted-foreground">Private</span>
            </label>
            <button type="button" class="ml-auto font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors" @click="cancelEdit">Cancel</button>
            <button type="button" :disabled="saving" class="font-cinzel text-xs text-primary hover:opacity-80 transition-opacity disabled:opacity-50" @click="saveEdit(note)">Save</button>
          </div>
        </div>
        <!-- View mode -->
        <div v-else class="px-3 py-2">
          <RichTextViewer :content="note.content" />
        </div>
      </div>
    </div>

    <!-- Compose new note -->
    <div v-if="composing" class="rounded-md border border-border bg-card overflow-hidden">
      <div class="px-3 py-1.5 border-b border-border bg-muted/30 font-cinzel text-2xs tracking-wider text-muted-foreground">
        New note
      </div>
      <div class="p-3 flex flex-col gap-2">
        <RichTextEditor v-model="newContent" min-height="100px" placeholder="Write your note…" />
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" v-model="newPrivate" class="rounded" />
            <span class="font-cinzel text-2xs tracking-wider text-muted-foreground">Private (only you)</span>
          </label>
          <button type="button" class="ml-auto font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors" @click="composing = false">Cancel</button>
          <button type="button" :disabled="saving" class="font-cinzel text-xs text-primary hover:opacity-80 transition-opacity disabled:opacity-50" @click="create">Save</button>
        </div>
      </div>
    </div>

    <button
      v-if="!composing"
      type="button"
      class="self-start inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 font-cinzel text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
      @click="composing = true"
    >
      <IconAdd class="h-3 w-3" />
      Add note
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconFaction, IconLock } from '@/lib/icons';
import { useAuthStore } from "@/stores/auth";
import {
  useEntityNotes,
  useCreateEntityNote,
  useUpdateEntityNote,
  useDeleteEntityNote,
} from "@/composables/useEntityNotes";
import type { EntityNote } from "@/types/faction.types";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props = defineProps<{ entityType: string; entityId: string; campaignId?: string | null }>();

const auth = useAuthStore();
const myUserId = computed(() => auth.user?.id ?? "");

const { data: notes }  = useEntityNotes(props.entityType, props.entityId);
const createMut = useCreateEntityNote();
const updateMut = useUpdateEntityNote();
const deleteMut = useDeleteEntityNote();

const saving    = ref(false);
const composing = ref(false);
const newContent = ref<string | null>(null);
const newPrivate = ref(false);

async function create() {
  saving.value = true;
  try {
    await createMut.mutateAsync({
      entity_type: props.entityType,
      entity_id: props.entityId,
      content: newContent.value ?? "",
      is_private: newPrivate.value,
      campaign_id: props.campaignId ?? null,
    });
    composing.value  = false;
    newContent.value = null;
    newPrivate.value = false;
  } finally {
    saving.value = false;
  }
}

const editingId   = ref<string | null>(null);
const editContent = ref<string | null>(null);
const editPrivate = ref(false);

function startEdit(note: EntityNote) {
  editingId.value   = note.id;
  editContent.value = note.content;
  editPrivate.value = note.is_private;
}
function cancelEdit() {
  editingId.value   = null;
  editContent.value = null;
}

async function saveEdit(note: EntityNote) {
  saving.value = true;
  try {
    await updateMut.mutateAsync({
      id: note.id,
      content: editContent.value ?? "",
      is_private: editPrivate.value,
      entity_type: props.entityType,
      entity_id: props.entityId,
    });
    editingId.value = null;
  } finally {
    saving.value = false;
  }
}

async function deleteNote(note: EntityNote) {
  await deleteMut.mutateAsync({
    id: note.id,
    entity_type: props.entityType,
    entity_id: props.entityId,
  });
}
</script>
