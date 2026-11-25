<template>
  <div class="border border-border bg-card" data-testid="campaign-search-results">
    <div v-if="isFetching" class="flex items-center gap-2 px-3 py-2 text-caption text-muted-foreground"><BannerLoader class="h-3.5" />Searching…</div>
    <p v-else-if="isError" role="alert" class="m-0 px-3 py-3 text-center text-caption text-muted-foreground">Search failed. Try again.</p>
    <p v-else-if="groups.length === 0 && failedMessage !== null" class="m-0 px-3 py-3 text-center text-caption text-muted-foreground">{{ failedMessage }}</p>
    <p v-else-if="groups.length === 0 && isSemanticPending" class="m-0 px-3 py-2 text-caption text-muted-foreground">Searching by meaning…</p>
    <p v-else-if="groups.length === 0" class="m-0 px-3 py-3 text-center text-caption text-muted-foreground">Nothing else in the campaign has “{{ query.trim() }}” in it.</p>
    <SearchResultList v-else :groups="groups" :thumbnails="thumbnails" :is-semantic-pending="isSemanticPending" :failed-message="failedMessage" inset="md" @navigate="emit('navigate')" />
  </div>
</template>

<script setup lang="ts">
/** The whole-campaign read behind the Canon search's last row. It exists only while open, so a closed row reads nothing. */
import { computed, toRef } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import SearchResultList from "@/components/layout/SearchResultList.vue";
import { failedGroupsMessage, useGlobalSearch } from "@/composables/useGlobalSearch";

const props = defineProps<{ query: string }>();
const emit = defineEmits<{ navigate: [] }>();

const { data, isFetching, isError, isSemanticPending, thumbnails } = useGlobalSearch(toRef(props, "query"));
const groups = computed(() => (props.query.trim().length < 2 ? [] : (data.value?.groups ?? [])));
const failedMessage = computed(() => {
  const failed = data.value?.failedGroups ?? [];
  return failed.length > 0 ? failedGroupsMessage(failed) : null;
});
</script>
