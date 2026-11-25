<template>
  <div class="flex flex-col gap-2" data-testid="canon-campaign-search">
    <AppButton
      variant="outline"
      block
      class="justify-start"
      :icon="IconSearch"
      :label="`Search the whole campaign for “${query.trim()}”`"
      :aria-expanded="open"
      data-testid="campaign-search-open"
      @click="open = !open"
    />
    <CanonCampaignResults v-if="open" :query="query" @navigate="emit('navigate')" />
  </div>
</template>

<script setup lang="ts">
/**
 * The last row of the Canon's search results (#1279 item 24): the canon is only part of a campaign, so the same words
 * can be put to everything else (people, places, items, quests) without leaving the page. The global search's own
 * dropdown cannot be opened with a word in it, so its results open here, in place, through the same read.
 */
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconSearch } from "@/lib/icons";
import CanonCampaignResults from "./CanonCampaignResults.vue";

const { query } = defineProps<{ query: string }>();
const emit = defineEmits<{ navigate: [] }>();

const open = ref(false);
// A new search starts closed: the DM chose to widen the last one, not this.
watch(
  () => query,
  () => {
    open.value = false;
  },
);
</script>
