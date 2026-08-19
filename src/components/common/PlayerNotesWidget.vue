<template>
  <div class="space-y-3">
    <!-- Private note -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <IconLock class="h-3 w-3 text-muted-foreground shrink-0" />
        <div class="flex-1">
          <span class="text-label-lg font-semibold text-muted-foreground">My Private Notes</span>
          <span class="text-caption-sm text-muted-foreground/50 italic ml-2">
            {{ sharedWithDm ? 'Shared with your DM' : 'Only you can see this' }}
          </span>
        </div>
        <label class="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            class="rounded border-border accent-primary h-3 w-3"
            :checked="sharedWithDm"
            @change="toggleSharedWithDm"
          />
          <span class="text-label text-muted-foreground">Share with DM</span>
        </label>
      </div>
      <RichTextEditor v-model="privateContent" :placeholder="placeholder" min-height="80px" :sticky-toolbar="false">
        <template #toolbar-end>
          <div class="ml-auto flex items-center gap-2 pl-1">
            <div class="w-px h-5 bg-border" />
            <span class="text-label text-muted-foreground/40">
              {{ privateSaved ? '' : 'Unsaved' }}
            </span>
            <AppButton
              v-if="myPrivateNote"
              variant="ghost"
              tone="danger"
              fill="muted"
              size="toolbar"
              label="Clear"
              @click="clearPrivate"
            />
            <button
              type="button"
              :disabled="privateSaving || privateSaved"
              class="px-2 h-6.5 text-label font-semibold rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors"
              @click="savePrivate"
            >{{ privateSaving ? '…' : 'Save' }}</button>
          </div>
        </template>
      </RichTextEditor>
    </div>

    <!-- Shared / party note -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <IconFaction class="h-3 w-3 text-elven-green shrink-0" />
        <div>
          <span class="text-label-lg font-semibold" style="color: var(--color-elven-green)">My Party Notes</span>
          <span class="text-caption-sm text-muted-foreground/50 italic ml-2">Visible to everyone in the campaign</span>
        </div>
      </div>
      <RichTextEditor v-model="sharedContent" :placeholder="placeholder" min-height="80px" :sticky-toolbar="false">
        <template #toolbar-end>
          <div class="ml-auto flex items-center gap-2 pl-1">
            <div class="w-px h-5 bg-border" />
            <span class="text-label text-muted-foreground/40">
              {{ sharedSaved ? '' : 'Unsaved' }}
            </span>
            <AppButton
              v-if="mySharedNote"
              variant="ghost"
              tone="danger"
              fill="muted"
              size="toolbar"
              label="Clear"
              @click="clearShared"
            />
            <button
              type="button"
              :disabled="sharedSaving || sharedSaved"
              class="px-2 h-6.5 text-label font-semibold rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors"
              @click="saveShared"
            >{{ sharedSaving ? '…' : 'Save' }}</button>
          </div>
        </template>
      </RichTextEditor>
    </div>

    <!-- Other party members' shared notes -->
    <div v-if="othersNotes.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">
          From the Party
          <span class="font-fell font-normal text-muted-foreground/60"> · {{ othersNotes.length }}</span>
        </span>
      </div>
      <div class="divide-y divide-border">
        <div v-for="note in othersNotes" :key="note.id" class="px-3 py-2.5 space-y-1">
          <p class="text-label font-semibold text-muted-foreground">
            {{ authorName(note.user_id) }}
          </p>
          <RichTextViewer :content="note.content" />
          <p class="text-label text-muted-foreground/40">
            {{ note.updated_at?.slice(0, 10) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Player insights shared with DM (only DMs can see these via RLS) -->
    <div v-if="dmSharedNotes.length" class="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20 bg-amber-500/10">
        <IconLock class="h-3 w-3 text-amber-500/70 shrink-0" />
        <span class="text-label-lg font-semibold text-amber-600/80 dark:text-amber-400/80">
          Player Insights
          <span class="font-fell font-normal text-amber-500/60"> · {{ dmSharedNotes.length }}</span>
        </span>
        <span class="text-caption-sm text-amber-500/50 italic">Shared with you privately</span>
      </div>
      <div class="divide-y divide-amber-500/20">
        <div v-for="note in dmSharedNotes" :key="note.id" class="px-3 py-2.5 space-y-1">
          <p class="text-label font-semibold text-amber-600/70 dark:text-amber-400/70">
            {{ authorName(note.user_id) }}
          </p>
          <RichTextViewer :content="note.content" />
          <p class="text-label text-muted-foreground/40">
            {{ note.updated_at?.slice(0, 10) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IconFaction, IconLock } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { useAuthStore } from "@/stores/auth";
import { useMemberByUserId } from "@/composables/useCampaignMembers";
import {
  useEntityNotes,
  useCreateEntityNote,
  useUpdateEntityNote,
  useDeleteEntityNote,
} from "@/composables/useEntityNotes";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const { entityType, entityId, placeholder = "Write your note…" } = defineProps<{
  entityType: string;
  entityId: string;
  placeholder?: string;
}>();

const auth = useAuthStore();
const myUserId = computed(() => auth.user?.id ?? "");

const { displayNameFor: authorName } = useMemberByUserId();

// Pass getters (not the destructured values) so the query key stays reactive when
// the parent swaps entityType/entityId in place (e.g. PlayerLocationDialog).
const { data: notes } = useEntityNotes(() => entityType, () => entityId);
const createMut = useCreateEntityNote();
const updateMut = useUpdateEntityNote();
const deleteMut = useDeleteEntityNote();

// Split notes into my-private, my-shared, others'-shared, dm-visible
const myPrivateNote = computed(() =>
  notes.value?.find((n) => n.user_id === myUserId.value && n.is_private) ?? null,
);
const mySharedNote = computed(() =>
  notes.value?.find((n) => n.user_id === myUserId.value && !n.is_private) ?? null,
);
const othersNotes = computed(() =>
  (notes.value ?? []).filter((n) => n.user_id !== myUserId.value && !n.is_private),
);
// Notes that others shared with the DM — only visible to DMs via RLS
const dmSharedNotes = computed(() =>
  (notes.value ?? []).filter((n) => n.user_id !== myUserId.value && n.shared_with_dm),
);

// ── Private note state ─────────────────────────────────────────────────────────
const privateContent  = ref<string | null>(null);
const privateSaving   = ref(false);
const privateSaved    = ref(true);
const sharedWithDm    = ref(false);

watch(myPrivateNote, (note) => {
  if (note) {
    privateContent.value = note.content;
    sharedWithDm.value   = note.shared_with_dm;
  }
}, { immediate: true });
watch(privateContent, () => { privateSaved.value = false; });

function toggleSharedWithDm(e: Event) {
  sharedWithDm.value = (e.target as HTMLInputElement).checked;
  privateSaved.value = false;
}

async function savePrivate() {
  privateSaving.value = true;
  try {
    if (myPrivateNote.value) {
      await updateMut.mutateAsync({
        id: myPrivateNote.value.id,
        content: privateContent.value ?? "",
        is_private: true,
        shared_with_dm: sharedWithDm.value,
        entity_type: entityType,
        entity_id: entityId,
      });
    } else {
      await createMut.mutateAsync({
        entity_type: entityType,
        entity_id: entityId,
        content: privateContent.value ?? "",
        is_private: true,
        shared_with_dm: sharedWithDm.value,
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
    entity_type: entityType,
    entity_id: entityId,
  });
  privateContent.value = null;
  sharedWithDm.value   = false;
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
        entity_type: entityType,
        entity_id: entityId,
      });
    } else {
      await createMut.mutateAsync({
        entity_type: entityType,
        entity_id: entityId,
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
    entity_type: entityType,
    entity_id: entityId,
  });
  sharedContent.value = null;
  sharedSaved.value   = true;
}
</script>
