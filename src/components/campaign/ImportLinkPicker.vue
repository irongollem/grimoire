<template>
  <div data-slip class="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-2">
      <AppInput
        v-model="query"
        type="search"
        block
        placeholder="Search your campaign…"
        aria-label="Find something to link to"
        autofocus
      />
      <div v-if="trimmed.length < 2" class="py-2 text-center text-caption text-muted-foreground">
        Type a name to search your campaign
      </div>
      <div v-else-if="isFetching" class="flex items-center gap-2 py-2 text-caption text-muted-foreground">
        <BannerLoader class="h-3.5" />
        Searching…
      </div>
      <div v-else-if="isError" class="py-2 text-center text-caption text-muted-foreground">Search failed. Try again.</div>
      <div v-else-if="groups.length === 0 && !isSemanticPending" class="py-2 text-center text-caption text-muted-foreground">
        Nothing matches "{{ trimmed }}".
      </div>
      <SearchResultList
        v-if="trimmed.length >= 2 && !isFetching && !isError"
        selectable
        inset="sm"
        :groups="groups"
        :thumbnails="thumbnails"
        :is-semantic-pending="isSemanticPending"
        @pick="onPick"
      />
    <AppButton variant="ghost" size="sm" label="Cancel" @click="emit('close')" />
  </div>
</template>

<script setup lang="ts">
/**
 * "Link to something else…" under an import row's options: the DM owns the
 * thing under another name, so they search for it and pick it. The query is a
 * local ref on purpose: a picker's search is a transient popup of candidates,
 * not a filter over a list on the page.
 *
 * Mounted only while open (`ImportDecisionChoice` holds the button), so a
 * review of forty rows does not hold forty searches.
 */
import { computed, ref } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SearchResultList from "@/components/layout/SearchResultList.vue";
import { hitToCandidate, useImportLinkSearch } from "@/composables/campaign/useImportLinkSearch";
import type { EntityCandidate } from "@/lib/documentImport/entityMatching";
import type { ImportEntityKind } from "@/types/documentImport.types";

const { kind } = defineProps<{ kind: ImportEntityKind }>();
const emit = defineEmits<{ pick: [candidate: EntityCandidate]; close: [] }>();

const query = ref("");
const trimmed = computed(() => query.value.trim());

const { groups, isFetching, isError, isSemanticPending, thumbnails } = useImportLinkSearch(() => kind, query);

function onPick(picked: { kind: string; id: string; name: string }) {
  const hit = groups.value.flatMap((g) => g.items).find((item) => item.id === picked.id);
  emit("pick", hitToCandidate(picked.kind, { id: picked.id, name: picked.name, detail: hit?.detail, descriptor: hit?.descriptor }));
  emit("close");
}
</script>
