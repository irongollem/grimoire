<template>
  <div class="space-y-3">
    <!-- Private note -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <IconLock class="h-3 w-3 text-muted-foreground shrink-0" />
        <div class="flex-1">
          <span class="text-label-lg font-semibold text-muted-foreground">My Private Notes</span>
          <span class="text-caption-sm text-muted-foreground/50 italic ml-2">
            {{ privateNote.draft.sharedWithDm ? 'Shared with your DM' : 'Only you can see this' }}
          </span>
        </div>
        <AppCheckbox
          v-model="privateNote.draft.sharedWithDm"
          size="sm"
          label-role="label"
          label="Share with DM"
          class="gap-1.5 select-none shrink-0"
        />
      </div>
      <RichTextEditor :key="privateNote.revision.value" v-model="privateNote.draft.content" :placeholder="placeholder" size="sm" :sticky-toolbar="false">
        <template #toolbar-end>
          <div class="ml-auto flex items-center gap-2 pl-1">
            <div class="w-px h-5 bg-border" />
            <AutosaveStatus
              v-if="privateNote.exists.value || privateNote.status.value !== 'saved'"
              :status="privateNote.status.value"
              :error="privateNote.saveError.value"
              paused-label="Saves once you write something"
            />
            <AppButton
              v-if="privateNote.exists.value"
              variant="ghost"
              tone="danger"
              fill="muted"
              size="toolbar"
              label="Clear"
              @click="privateNote.clear"
            />
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
      <RichTextEditor :key="partyNote.revision.value" v-model="partyNote.draft.content" :placeholder="placeholder" size="sm" :sticky-toolbar="false">
        <template #toolbar-end>
          <div class="ml-auto flex items-center gap-2 pl-1">
            <div class="w-px h-5 bg-border" />
            <AutosaveStatus
              v-if="partyNote.exists.value || partyNote.status.value !== 'saved'"
              :status="partyNote.status.value"
              :error="partyNote.saveError.value"
              paused-label="Saves once you write something"
            />
            <AppButton
              v-if="partyNote.exists.value"
              variant="ghost"
              tone="danger"
              fill="muted"
              size="toolbar"
              label="Clear"
              @click="partyNote.clear"
            />
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
    <div v-if="dmSharedNotes.length" class="rounded-lg border border-tone-caution/30 bg-tone-caution/5 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-tone-caution/20 bg-tone-caution/10">
        <IconLock class="h-3 w-3 text-ink-caution/70 shrink-0" />
        <span class="text-label-lg font-semibold text-ink-caution/80 ">
          Player Insights
          <span class="font-fell font-normal text-ink-caution/60"> · {{ dmSharedNotes.length }}</span>
        </span>
        <span class="text-caption-sm text-ink-caution/50 italic">Shared with you privately</span>
      </div>
      <div class="divide-y divide-tone-caution/20">
        <div v-for="note in dmSharedNotes" :key="note.id" class="px-3 py-2.5 space-y-1">
          <p class="text-label font-semibold text-ink-caution/70 ">
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
import { computed } from "vue";
import { IconFaction, IconLock } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { useAuthStore } from "@/stores/auth";
import { useMemberByUserId } from "@/composables/campaign/useCampaignMembers";
import { useEntityNotes } from "@/composables/notes/useEntityNotes";
import { useMyEntityNote } from "@/composables/notes/useMyEntityNote";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";

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

// Both of the viewer's own notes save themselves as they type.
const noteSource = { entityType: () => entityType, entityId: () => entityId, notes, userId: myUserId };
const privateNote = useMyEntityNote({ ...noteSource, isPrivate: true });
const partyNote = useMyEntityNote({ ...noteSource, isPrivate: false });

const othersNotes = computed(() =>
  (notes.value ?? []).filter((n) => n.user_id !== myUserId.value && !n.is_private),
);
// Notes that others shared with the DM — only visible to DMs via RLS
const dmSharedNotes = computed(() =>
  (notes.value ?? []).filter((n) => n.user_id !== myUserId.value && n.shared_with_dm),
);
</script>
