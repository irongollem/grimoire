<template>
  <div v-if="!hasNothingToShow" class="flex flex-col gap-4">
    <!-- The item's own writing — DM-authored, in-world text carried by the
         object itself (a ledger's pages, a contract's clauses). -->
    <div v-if="!hideContent && item.content !== null" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-2">
      <h3 class="text-label-lg font-bold text-muted-foreground uppercase">Written Contents</h3>
      <RichTextViewer :content="item.content" />
    </div>

    <!-- Entries added at the table. Only meaningful within a campaign — the
         table is scoped by campaign_id, so with no active campaign there is
         nothing to fetch and nothing to write into. -->
    <div v-if="showEntriesBlock" class="flex flex-col gap-2">
      <h3 class="text-label-lg font-bold text-muted-foreground uppercase">Added Writing</h3>

      <div
        v-for="entry in entries"
        :key="entry.id"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
          <span class="text-label font-semibold text-primary">
            {{ authorLabel(entry) }}
            <span class="text-caption-sm font-normal text-muted-foreground/60"> · {{ formatChatTimestamp(entry.created_at) }}</span>
          </span>
          <div v-if="editingId !== entry.id" class="flex items-center gap-3">
            <AppButton v-if="isOwn(entry)" variant="ghost" size="inline-xs" label="Edit" @click="startEdit(entry)" />
            <AppButton
              v-if="isOwn(entry) || canModerate"
              variant="ghost"
              size="inline-xs"
              label="Delete"
              class="text-destructive hover:text-destructive/70"
              @click="removeEntry(entry)"
            />
          </div>
        </div>

        <!-- Edit mode -->
        <div v-if="editingId === entry.id" class="p-3 flex flex-col gap-2">
          <RichTextEditor v-model="editContent" allow-upload min-height="100px" />
          <div class="flex items-center gap-2 justify-end">
            <AppButton variant="ghost" size="inline" label="Cancel" @click="cancelEdit" />
            <AppButton
              variant="link"
              size="inline"
              label="Save"
              :disabled="isBlankDoc(editContent)"
              @click="saveEdit(entry)"
            />
          </div>
        </div>
        <!-- View mode -->
        <div v-else class="px-3 py-2">
          <RichTextViewer :content="entry.content" />
        </div>
      </div>

      <!-- Composer -->
      <div v-if="canCompose" class="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
        <RichTextEditor
          ref="composerRef"
          v-model="newContent"
          allow-upload
          placeholder="Add your own writing to this item…"
          min-height="100px"
        />
        <AppButton
          variant="primary"
          size="sm"
          label="Add"
          class="self-end"
          :disabled="isBlankDoc(newContent) || isAdding"
          @click="addEntry"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The one document-text mount for both the DM item sheet and the player
 * inventory panel (a later story adds the player mounts). `canWriteEntries`,
 * `canModerate` and `authorPartyMemberId` are all parent-decided — this
 * component only renders what it is told, so a DM sheet and a player sheet
 * differ purely in what props they pass.
 */
import { computed, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useConfirm } from "@/composables/useConfirm";
import { useParty } from "@/composables/useParty";
import {
  useItemEntries,
  useAddItemEntry,
  useUpdateItemEntry,
  useDeleteItemEntry,
} from "@/composables/useItemEntries";
import {
  cleanupRemovedRichTextImages,
  removeRichTextImages,
  extractRichTextImageUrls,
} from "@/composables/useImageUpload";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { formatChatTimestamp } from "@/lib/utils";
import AppButton from "@/components/common/AppButton.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import type { Item, ItemEntry } from "@/types/item.types";

const {
  item,
  campaignId,
  canWriteEntries,
  authorPartyMemberId,
  canModerate,
  dmUserId,
  hideContent = false,
} = defineProps<{
  item: Item;
  /** Entries scope; null when the DM is browsing /vault with no active
   *  campaign — content still renders, but the entries thread does not. */
  campaignId: string | null;
  canWriteEntries: boolean;
  /** Stamped on new entries. Null for the DM. */
  authorPartyMemberId: string | null;
  canModerate: boolean;
  /** The item editor mounts this thread below its own `content` editor box,
   *  so it suppresses the read-only content block that every other parent
   *  wants. */
  hideContent?: boolean;
  /**
   * The campaign owner's user id. An entry is labelled "DM" only when
   * `entry.user_id` matches this — never merely because `party_member_id` is
   * null, since `item_entries_insert` accepts a null `party_member_id` from
   * any campaign member (a player with no linked character posts null too).
   */
  dmUserId: string | null;
}>();

const auth = useAuthStore();
const { confirm } = useConfirm();

const itemId = computed(() => item.id);
const campaignIdRef = computed(() => campaignId ?? undefined);

// Both DM and player call sites resolve `campaignId` from the same active-
// campaign store that `useParty()` reads internally, so the two stay in
// lockstep without threading campaignId through it explicitly.
const { data: entries } = useItemEntries(itemId, campaignIdRef);
const { data: partyMembers } = useParty();

const { mutateAsync: addEntryMut, isPending: isAdding } = useAddItemEntry();
const { mutateAsync: updateEntryMut } = useUpdateItemEntry(itemId, campaignIdRef);
const { mutateAsync: deleteEntryMut } = useDeleteItemEntry(itemId, campaignIdRef);

const hasEntries = computed(() => (entries.value?.length ?? 0) > 0);
const canCompose = computed(() => canWriteEntries && campaignId !== null);
const showEntriesBlock = computed(() => hasEntries.value || canCompose.value);
const hasNothingToShow = computed(
  () => (hideContent || item.content === null) && !showEntriesBlock.value,
);

/** A doc with no text and no embedded images carries nothing worth saving. */
function isBlankDoc(json: string | null): boolean {
  if (!json) return true;
  return !tiptapToPlainText(json).trim() && extractRichTextImageUrls(json).length === 0;
}

function authorLabel(entry: ItemEntry): string {
  if (entry.user_id === dmUserId) return "DM";
  const member = partyMembers.value?.find((m) => m.id === entry.party_member_id);
  return member?.name ?? "Unknown hand";
}

function isOwn(entry: ItemEntry): boolean {
  return entry.user_id === auth.user?.id;
}

// ── Compose ───────────────────────────────────────────────────────────────────
const newContent = ref<string | null>(null);
const composerRef = ref<InstanceType<typeof RichTextEditor> | null>(null);

async function addEntry() {
  if (campaignId === null || isBlankDoc(newContent.value)) return;
  const content = newContent.value!;
  await addEntryMut({
    item_id: item.id,
    campaign_id: campaignId,
    party_member_id: authorPartyMemberId,
    content,
  });
  newContent.value = null;
  // The editor only emits outward — nulling the ref doesn't reach it.
  composerRef.value?.clearContent();
}

// ── Edit ──────────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editContent = ref<string | null>(null);

function startEdit(entry: ItemEntry) {
  editingId.value = entry.id;
  editContent.value = entry.content;
}
function cancelEdit() {
  editingId.value = null;
  editContent.value = null;
}
async function saveEdit(entry: ItemEntry) {
  if (isBlankDoc(editContent.value)) return;
  const oldContent = entry.content;
  const nextContent = editContent.value!;
  await updateEntryMut({ id: entry.id, update: { content: nextContent } });
  cleanupRemovedRichTextImages(oldContent, nextContent);
  cancelEdit();
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function removeEntry(entry: ItemEntry) {
  if (!(await confirm("Delete this entry? This cannot be undone."))) return;
  await deleteEntryMut(entry.id);
  removeRichTextImages(entry.content);
}
</script>
