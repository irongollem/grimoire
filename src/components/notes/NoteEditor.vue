<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Note title</span>
        <input
          v-model="title"
          placeholder="Note title…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <!-- Category -->
      <select
        v-model="category"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">
          {{ c.label }}
        </option>
      </select>

      <!-- Session # — only relevant for session notes -->
      <label v-if="category === 'session'" class="flex items-center gap-1.5">
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >#</span
        >
        <input
          v-model.number="sessionNum"
          type="number"
          min="1"
          placeholder="Session"
          class="w-20 bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <!-- Pin toggle -->
      <button
        type="button"
        :title="isPinned ? 'Unpin note' : 'Pin note'"
        class="p-2 rounded-md border border-border transition-colors"
        :class="
          isPinned
            ? 'bg-primary/10 text-primary border-primary/30'
            : 'bg-card text-muted-foreground hover:text-foreground'
        "
        @click="isPinned = !isPinned"
      >
        <Pin class="h-3.5 w-3.5" />
      </button>

      <!-- Player visibility toggle -->
      <PlayerVisibilityToggle
        :shared-with-all="sharedWithPlayers"
        :visible-to="playerVisibleTo"
        @update:shared-with-all="sharedWithPlayers = $event"
        @update:visible-to="playerVisibleTo = $event"
      />

      <button
        type="button"
        :disabled="saving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : props.note ? "Save" : "Create" }}
      </button>

      <button
        v-if="props.note"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <!-- Tags -->
    <TagInput v-model="tags" />

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Tiptap editor -->
    <RichTextEditor v-model="body" placeholder="Write your note here…" />
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref } from "vue";
import { useRouter } from "vue-router";
import RichTextEditor from "../common/RichTextEditor.vue";
import { Save, Trash2, Pin } from "lucide-vue-next";
import TagInput from "@/components/common/TagInput.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import {
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from "@/composables/useNotes";
import type { Note, NoteCategory } from "@/types/notes.types";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { getCurrentUser } from "@/lib/supabase";
import { storeToRefs } from "pinia";

const CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "session", label: "Session" },
  { value: "lore", label: "Lore" },
  { value: "location", label: "Location" },
  { value: "quest", label: "Quest" },
  { value: "faction", label: "Faction" },
];

const props = defineProps<{ note: Note | null }>();
const router = useRouter();

const title = ref(props.note?.title ?? "");
const body = ref<string | null>(props.note?.content ?? null);
const category = ref<NoteCategory>(props.note?.category ?? "general");
const sessionNum = ref<number | null>(props.note?.session_num ?? null);
const isPinned = ref(props.note?.is_pinned ?? false);
const sharedWithPlayers = ref(props.note?.shared_with_players ?? false);
const playerVisibleTo = ref<string[] | null>(props.note?.player_visible_to ?? null);
const tags = ref<string[]>(props.note?.tags ? [...props.note.tags] : []);
const saving = ref(false);
const saveError = ref("");
const user = getCurrentUser();

const { mutateAsync: create } = useCreateNote();
const { mutateAsync: update } = useUpdateNote();
const { mutateAsync: del } = useDeleteNote();
const { activeCampaignId } = storeToRefs(useCampaignStore());

function buildPayload() {
  return {
    title: title.value.trim() || "Untitled Note",
    category: category.value,
    session_num:
      category.value === "session" ? (sessionNum.value ?? null) : null,
    is_pinned: isPinned.value,
    shared_with_players: sharedWithPlayers.value,
    player_visible_to: playerVisibleTo.value,
    tags: tags.value,
    content: body.value ?? null,
    // campaign_id is injected by useCreateNote for inserts; never include it
    // in update payloads or it can overwrite with null on a stale active campaign.
    user_id: user?.id,
  };
}

async function save() {
  if (!title.value.trim() && !body.value) return;
  saving.value = true;
  saveError.value = "";
  const wasShared = props.note?.shared_with_players || (props.note?.player_visible_to?.length ?? 0) > 0;
  const nowShared = sharedWithPlayers.value || (playerVisibleTo.value?.length ?? 0) > 0;
  const justShared = nowShared && !wasShared;
  try {
    if (props.note) {
      await update({ id: props.note.id, update: buildPayload() });
      if (justShared && activeCampaignId.value)
        void sendCampaignAnnouncement(
          activeCampaignId.value,
          `📜 Note shared: "${title.value.trim()}"`,
        );
      router.push("/notes");
    } else {
      const created = await create(buildPayload());
      if (nowShared && activeCampaignId.value)
        void sendCampaignAnnouncement(
          activeCampaignId.value,
          `📜 Note shared: "${created.title}"`,
        );
      router.replace(`/notes/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.note) return;
  if (!(await confirm(`Delete "${props.note.title}"? This cannot be undone.`)))
    return;
  await del(props.note.id);
  router.push("/notes");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.note-editor :deep(.ProseMirror) {
  @apply font-fell text-sm text-foreground outline-none min-h-96;
}
.note-editor :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed;
}
.note-editor :deep(.ProseMirror h1) {
  @apply font-cinzel text-2xl font-bold mb-3 mt-5 first:mt-0;
}
.note-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mb-2 mt-4 first:mt-0;
}
.note-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-bold mb-2 mt-3 first:mt-0;
}
.note-editor :deep(.ProseMirror ul) {
  @apply list-disc pl-5 mb-3 space-y-1;
}
.note-editor :deep(.ProseMirror ol) {
  @apply list-decimal pl-5 mb-3 space-y-1;
}
.note-editor :deep(.ProseMirror blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
.note-editor :deep(.ProseMirror hr) {
  @apply border-t border-primary/30 my-4;
}
.note-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground/50 italic pointer-events-none float-left h-0;
}
</style>
