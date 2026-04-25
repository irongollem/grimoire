<template>
  <div class="space-y-3">
    <!-- Private note -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <Lock class="h-3 w-3 text-muted-foreground shrink-0" />
        <div>
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">My Private Notes</span>
          <span class="font-fell text-[10px] text-muted-foreground/50 italic ml-2">Only you can see this</span>
        </div>
      </div>
      <RichTextEditor v-model="privateContent" :placeholder="placeholder" min-height="80px" :sticky-toolbar="false">
        <template #toolbar-end>
          <div class="ml-auto flex items-center gap-2 pl-1">
            <div class="w-px h-5 bg-border" />
            <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground/40">
              {{ privateSaved ? '' : 'Unsaved' }}
            </span>
            <button
              v-if="myPrivateNote"
              type="button"
              class="px-2 h-6.5 font-cinzel text-[10px] tracking-wider rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
              @click="clearPrivate"
            >Clear</button>
            <button
              type="button"
              :disabled="privateSaving || privateSaved"
              class="px-2 h-6.5 font-cinzel text-[10px] font-semibold tracking-wider rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors"
              @click="savePrivate"
            >{{ privateSaving ? '…' : 'Save' }}</button>
          </div>
        </template>
      </RichTextEditor>
    </div>

    <!-- Shared / party note -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <Globe class="h-3 w-3 text-elven-green shrink-0" />
        <div>
          <span class="font-cinzel text-xs font-semibold tracking-wider" style="color: var(--color-elven-green)">My Party Notes</span>
          <span class="font-fell text-[10px] text-muted-foreground/50 italic ml-2">Visible to everyone in the campaign</span>
        </div>
      </div>
      <RichTextEditor v-model="sharedContent" :placeholder="placeholder" min-height="80px" :sticky-toolbar="false">
        <template #toolbar-end>
          <div class="ml-auto flex items-center gap-2 pl-1">
            <div class="w-px h-5 bg-border" />
            <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground/40">
              {{ sharedSaved ? '' : 'Unsaved' }}
            </span>
            <button
              v-if="mySharedNote"
              type="button"
              class="px-2 h-6.5 font-cinzel text-[10px] tracking-wider rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
              @click="clearShared"
            >Clear</button>
            <button
              type="button"
              :disabled="sharedSaving || sharedSaved"
              class="px-2 h-6.5 font-cinzel text-[10px] font-semibold tracking-wider rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors"
              @click="saveShared"
            >{{ sharedSaving ? '…' : 'Save' }}</button>
          </div>
        </template>
      </RichTextEditor>
    </div>

    <!-- Other party members' shared notes -->
    <div v-if="othersNotes.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
          From the Party
          <span class="font-fell font-normal text-muted-foreground/60"> · {{ othersNotes.length }}</span>
        </span>
      </div>
      <div class="divide-y divide-border">
        <div v-for="note in othersNotes" :key="note.id" class="px-3 py-2.5">
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

// Split notes into my-private, my-shared, others'-shared
const myPrivateNote = computed(() =>
  notes.value?.find((n) => n.user_id === myUserId.value && n.is_private) ?? null,
);
const mySharedNote = computed(() =>
  notes.value?.find((n) => n.user_id === myUserId.value && !n.is_private) ?? null,
);
const othersNotes = computed(() =>
  (notes.value ?? []).filter((n) => n.user_id !== myUserId.value && !n.is_private),
);

// ── Private note state ─────────────────────────────────────────────────────────
const privateContent = ref<string | null>(null);
const privateSaving  = ref(false);
const privateSaved   = ref(true);

watch(myPrivateNote, (note) => {
  if (note) privateContent.value = note.content;
}, { immediate: true });
watch(privateContent, () => { privateSaved.value = false; });

async function savePrivate() {
  privateSaving.value = true;
  try {
    if (myPrivateNote.value) {
      await updateMut.mutateAsync({
        id: myPrivateNote.value.id,
        content: privateContent.value ?? "",
        is_private: true,
        entity_type: props.entityType,
        entity_id: props.entityId,
      });
    } else {
      await createMut.mutateAsync({
        entity_type: props.entityType,
        entity_id: props.entityId,
        content: privateContent.value ?? "",
        is_private: true,
      });
    }
    privateSaved.value = true;
  } finally {
    privateSaving.value = false;
  }
}

async function clearPrivate() {
  if (!myPrivateNote.value) return;
  await deleteMut.mutateAsync({
    id: myPrivateNote.value.id,
    entity_type: props.entityType,
    entity_id: props.entityId,
  });
  privateContent.value = null;
  privateSaved.value   = true;
}

// ── Shared note state ──────────────────────────────────────────────────────────
const sharedContent = ref<string | null>(null);
const sharedSaving  = ref(false);
const sharedSaved   = ref(true);

watch(mySharedNote, (note) => {
  if (note) sharedContent.value = note.content;
}, { immediate: true });
watch(sharedContent, () => { sharedSaved.value = false; });

async function saveShared() {
  sharedSaving.value = true;
  try {
    if (mySharedNote.value) {
      await updateMut.mutateAsync({
        id: mySharedNote.value.id,
        content: sharedContent.value ?? "",
        is_private: false,
        entity_type: props.entityType,
        entity_id: props.entityId,
      });
    } else {
      await createMut.mutateAsync({
        entity_type: props.entityType,
        entity_id: props.entityId,
        content: sharedContent.value ?? "",
        is_private: false,
      });
    }
    sharedSaved.value = true;
  } finally {
    sharedSaving.value = false;
  }
}

async function clearShared() {
  if (!mySharedNote.value) return;
  await deleteMut.mutateAsync({
    id: mySharedNote.value.id,
    entity_type: props.entityType,
    entity_id: props.entityId,
  });
  sharedContent.value = null;
  sharedSaved.value   = true;
}
</script>
