<template>
  <ItemDocumentSection
    :item="item"
    :campaign-id="activeCampaignId"
    :can-write-entries="canWriteEntries"
    :author-party-member-id="authorPartyMemberId"
    :can-moderate="false"
    :dm-user-id="dmUserId"
  />
</template>

<script setup lang="ts">
/**
 * One tab body per document item currently in the party's inventory (see
 * PlayerJournalView.vue's `tomeTabs`). No header — none of the sibling tabs
 * (My/Party/Quest Log/Puzzles/DM Notes) render one either; the tab strip
 * label above already names the item.
 *
 * This is a pure player surface: unlike ItemDetailPanel (which also serves
 * the DM's own real inventory access), PlayerJournalView has no DM-preview
 * branch anywhere else in the file, so props here are the player-only half
 * of ItemSheet.vue's split — no isRealDm check, canModerate always false.
 */
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useItemEntries } from "@/composables/items/useItemEntries";
import { useMarkRead } from "@/composables/play/useReadItems";
import ItemDocumentSection from "@/components/items/ItemDocumentSection.vue";
import type { Item } from "@/types/item.types";

const props = defineProps<{
  item: Item;
}>();

const auth = useAuthStore();
const { activeCampaignId, activeCampaign } = storeToRefs(useCampaignStore());

const dmUserId = computed(() => activeCampaign.value?.user_id ?? null);
const authorPartyMemberId = computed(() => auth.linkedPartyMemberId);
const canWriteEntries = computed(() => props.item.content_player_writable);

// ── Mark read ─────────────────────────────────────────────────────────────
// ItemDocumentSection emits nothing on a successful post, so this tab owns
// its own entries watch while mounted (i.e. while it is the active tab) and
// re-marks read on every change — covering both "tab opened" and "the
// player's own new entry would otherwise re-flag them".
const itemId = computed(() => props.item.id);
const campaignIdRef = computed(() => activeCampaignId.value ?? undefined);
const { data: entries } = useItemEntries(itemId, campaignIdRef);
const { mutate: markRead } = useMarkRead();

watch(
  () => [props.item.id, entries.value] as const,
  ([id]) => {
    if (id) markRead({ entityType: "item_document", entityId: id });
  },
  { immediate: true },
);
</script>
