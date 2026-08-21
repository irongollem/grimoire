<template>
  <ItemEditorCard
    title="Written Contents"
    hint="optional; what the item itself says"
    toggle-label="HAS WRITING"
    toggle-shrink
    v-model:toggle="hasWrittenContent"
    :gap="3"
  >
    <template v-if="hasWrittenContent">
      <RichTextEditor
        v-model="content"
        allow-upload
        placeholder="A ledger's pages, a contract's clauses, a scroll's text…"
        size="md"
      />
      <p class="text-caption text-muted-foreground italic">
        Players can read this once the item is identified, and while the party carries it,
        it appears as a tome tab in their journals.
      </p>
      <AppCheckbox v-model="playerWritable" label-role="label-lg" label="PLAYER WRITABLE" class="self-start" />
      <!-- The entries journal — the same thread as the view sheet, so the DM
           can read, add and moderate entries without leaving the editor.
           Entries mutate immediately; they are not part of the form's Save. -->
      <ItemDocumentSection
        v-if="item"
        :item="item"
        :campaign-id="activeCampaignId"
        :can-write-entries="true"
        :author-party-member-id="null"
        :can-moderate="true"
        :dm-user-id="dmUserId"
        hide-content
      />
    </template>
  </ItemEditorCard>
</template>

<script setup lang="ts">
/**
 * The Written Contents fold of the item editor: a HAS WRITING master toggle
 * (non-null content is a real signal — feather badge, tome tab in player
 * journals — so document-ness is declared, never typed into existence), the
 * content editor, the PLAYER WRITABLE flag, and on existing items the
 * item_entries journal. The parent keeps ownership of persistence: it derives
 * `effectiveContent` from the two models and writes NULL/false when the fold
 * is closed, so this component never decides what gets saved.
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import ItemDocumentSection from "@/components/items/ItemDocumentSection.vue";
import ItemEditorCard from "@/components/items/ItemEditorCard.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import type { Item } from "@/types/item.types";

const { item } = defineProps<{
  /** Null while creating — no id yet, so no entries thread to anchor. */
  item: Item | null;
}>();

const hasWrittenContent = defineModel<boolean>("hasWrittenContent", { required: true });
const content = defineModel<string | null>("content", { required: true });
const playerWritable = defineModel<boolean>("playerWritable", { required: true });

const { activeCampaignId, activeCampaign } = storeToRefs(useCampaignStore());
const dmUserId = computed(() => activeCampaign.value?.user_id ?? null);
</script>
