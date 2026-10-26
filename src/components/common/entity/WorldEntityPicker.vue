<template>
  <div class="flex min-w-0 flex-col gap-2">
    <AppInput
      v-model="query"
      type="search"
      block
      placeholder="Find a person, place, faction, god or item…"
      aria-label="Find something to connect"
      autofocus
    />
    <div v-if="chips.length > 1" class="flex flex-wrap gap-1" role="group" aria-label="Kind">
      <AppButton size="xs" :active="chosenKind === null" label="All" @click="chosenKind = null" />
      <AppButton
        v-for="chip in chips"
        :key="chip.kind"
        size="xs"
        :active="chosenKind === chip.kind"
        :label="chip.label"
        @click="chosenKind = chosenKind === chip.kind ? null : chip.kind"
      />
    </div>

    <div v-if="trimmed.length < 2" class="py-3 text-center text-caption text-muted-foreground">
      Type a name, or what they do or where they are.
    </div>
    <div v-else-if="isFetching" class="flex items-center gap-2 py-2 text-caption text-muted-foreground">
      <BannerLoader class="h-3.5" />
      Searching…
    </div>
    <div v-else-if="isError" class="py-3 text-center text-caption text-muted-foreground">Search failed. Try again.</div>
    <div v-else-if="groups.length === 0 && !isSemanticPending" class="py-3 text-center text-caption text-muted-foreground">
      No one matches "{{ trimmed }}".
    </div>
    <SearchResultList
      v-if="trimmed.length >= 2 && !isFetching && !isError"
      selectable
      inset="sm"
      :groups="groups"
      :thumbnails="thumbnails"
      :is-semantic-pending="isSemanticPending"
      :exclude="subject ?? null"
      @pick="onPick"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The search half of the Add-connection dialog (#1084): the global search
 * engine, limited to the kinds that can hold a link, with a result row picked
 * instead of followed. Names first, then meaning (Pro), grouped by kind; a place
 * or faction opens in place to its people. The dialog around it, and the type
 * choice, belong to the next story.
 *
 * The query is a local ref on purpose: a picker's search is a transient popup
 * of candidates, not a filter over a list on the page.
 */
import { computed, ref } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SearchResultList from "@/components/layout/SearchResultList.vue";
import { useGlobalSearch } from "@/composables/useGlobalSearch";
import type { SearchKind } from "@/lib/search/searchRows";
import { isUuid } from "@/lib/library/contentIdentity";
import { LINK_KINDS, type LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import type { SearchGroup } from "@/lib/search/mergeSearchHits";
import type { WorldRef } from "@/types/connections.types";

const { subject, kinds = LINK_KINDS } = defineProps<{
  /** The thing the connection is for; never offered as its own far end. */
  subject?: WorldRef;
  /** Kinds the far end may be. Defaults to every kind that can hold a link. */
  kinds?: readonly LinkKind[];
}>();

const emit = defineEmits<{ pick: [ref: WorldRef & { name: string }] }>();

const KIND_LABEL: Record<LinkKind, string> = {
  npc: "NPCs",
  party_member: "Party",
  faction: "Factions",
  location: "Places",
  deity: "Deities",
  item: "Items",
};

const query = ref("");
const chosenKind = ref<LinkKind | null>(null);
const trimmed = computed(() => query.value.trim());

const chips = computed(() => kinds.map((kind) => ({ kind, label: KIND_LABEL[kind] })));
const searched = computed<readonly SearchKind[]>(() => (chosenKind.value ? [chosenKind.value] : kinds));

const { data, isFetching, isError, isSemanticPending, thumbnails } = useGlobalSearch(query, { kinds: searched });

function isLinkKind(kind: string): kind is LinkKind {
  return (LINK_KINDS as readonly string[]).includes(kind);
}

/** Rows that can be linked: not the subject, and not a shared-library item (those have text ids and no row to link to). */
const groups = computed<SearchGroup[]>(() => {
  if (trimmed.value.length < 2) return [];
  return (data.value?.groups ?? [])
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const kind = item.kind ?? group.type;
        if (!isLinkKind(kind)) return false;
        if (subject && subject.kind === kind && subject.id === item.id) return false;
        return kind !== "item" || isUuid(item.id);
      }),
    }))
    .filter((group) => group.items.length > 0);
});

function onPick(picked: { kind: string; id: string; name: string }) {
  if (isLinkKind(picked.kind)) emit("pick", { kind: picked.kind, id: picked.id, name: picked.name });
}
</script>
