<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-label-lg font-semibold text-muted-foreground uppercase">Notes</h2>

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
          <span class="text-label text-muted-foreground flex-1">
            {{ note.is_private ? "Private" : "Party" }} note
            <span v-if="note.user_id !== myUserId" class="italic"> · from DM/party</span>
          </span>
          <template v-if="note.user_id === myUserId">
            <AppButton variant="ghost" size="inline-xs" label="Edit" @click="startEdit(note)" />
            <!-- The `destructive` variant is the bordered one; this is a bare
                 text action, so it borrows ghost and states the colour. -->
            <AppButton
              variant="ghost"
              size="inline-xs"
              label="Delete"
              class="text-destructive hover:text-destructive/70"
              @click="deleteNote(note)"
            />
          </template>
        </div>

        <!-- Edit mode -->
        <div v-if="editingId === note.id" class="p-3 flex flex-col gap-2">
          <RichTextEditor v-model="editContent" min-height="100px" />
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" v-model="editPrivate" class="rounded" />
              <span class="text-label text-muted-foreground">Private</span>
            </label>
            <AppButton variant="ghost" size="inline" label="Cancel" class="ml-auto" @click="cancelEdit" />
            <AppButton variant="link" size="inline" label="Save" :disabled="saving" @click="saveEdit(note)" />
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
      <div class="px-3 py-1.5 border-b border-border bg-muted/30 text-label text-muted-foreground">
        New note
      </div>
      <div class="p-3 flex flex-col gap-2">
        <RichTextEditor v-model="newContent" min-height="100px" placeholder="Write your note…" />
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" v-model="newPrivate" class="rounded" />
            <span class="text-label text-muted-foreground">Private (only you)</span>
          </label>
          <AppButton variant="ghost" size="inline" label="Cancel" class="ml-auto" @click="composing = false" />
          <AppButton variant="link" size="inline" label="Save" :disabled="saving" @click="create" />
        </div>
      </div>
    </div>

    <!-- Dashed border marks this as an "add" affordance; the variants have no
         dashed treatment, so it stays a call-site class. -->
    <AppButton
      v-if="!composing"
      variant="subtle"
      size="sm"
      label="Add note"
      :icon="IconAdd"
      class="self-start border-dashed hover:border-border/80"
      @click="composing = true"
    />
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
import AppButton from "@/components/common/AppButton.vue";
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
