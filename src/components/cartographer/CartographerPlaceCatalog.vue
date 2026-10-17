<template>
  <div class="space-y-3">
    <!-- A picker of candidates to place, not a filter over a list on the page:
         CLAUDE.md's Sanctioned Exceptions keep it out of the UI store. -->
    <AppInput v-model="search" size="body-xs" placeholder="Search objects and props…" aria-label="Search the catalogue" />

    <section v-if="recentRows.length > 0 && !needle" class="space-y-1">
      <h4 class="text-caption-sm text-muted-foreground">Recent</h4>
      <div class="flex flex-wrap gap-1.5">
        <CartographerPlaceTile
          v-for="row in recentRows"
          :key="row.key"
          :label="row.label"
          :selected="samePlaceItem(item, row.item)"
          @pick="emit('pick', row.item)"
        >
          <PlaceItemThumb :item="row.item" :runtime="runtime" :image-url="row.imageUrl" :footprint="row.footprint" />
        </CartographerPlaceTile>
      </div>
    </section>

    <!-- The active set's own objects: one row per kind, "Any" first (mixes the variants by
         position, as the stamp always did), then each variant as its own picture. -->
    <section v-if="singleObjects.length > 0 || objectRows.length > 0" class="space-y-2">
      <h4 class="text-caption-sm text-muted-foreground">{{ setName }}</h4>

      <!-- Kinds with one picture (or none yet) are one tile each, sharing a flowing grid:
           "Any" and the only variant would be the same thing. -->
      <div v-if="singleObjects.length > 0" class="flex flex-wrap gap-x-1.5 gap-y-2" data-testid="single-objects">
        <div v-for="single in singleObjects" :key="single.category" class="flex w-14 flex-col items-center gap-0.5">
          <CartographerPlaceTile
            :label="single.label"
            :selected="isSelectedObject(single.category, 0)"
            @pick="emit('pick', { kind: 'object', category: single.category, variant: 'any' })"
          >
            <PackTileThumb :runtime="runtime" :category="single.category" :variant="0" :side="single.stairs ? 'N' : undefined" />
          </CartographerPlaceTile>
          <span class="w-full truncate text-center text-label text-muted-foreground">{{ single.label }}</span>
        </div>
      </div>

      <!-- Kinds with several variants get a row: the schema's name for the kind, an Any tile
           (the first picture faded, with a mix mark) and each variant under its pack label. -->
      <div v-for="row in objectRows" :key="row.category" class="space-y-1" data-testid="object-row">
        <p class="text-label text-foreground">{{ row.heading }}</p>
        <div class="flex flex-wrap gap-1.5">
          <CartographerPlaceTile
            :label="`${row.heading}, any variant`"
            :selected="samePlaceItem(item, { kind: 'object', category: row.category, variant: 'any' })"
            @pick="emit('pick', { kind: 'object', category: row.category, variant: 'any' })"
          >
            <span class="relative block size-full">
              <span class="block size-full opacity-50">
                <PackTileThumb :runtime="runtime" :category="row.category" :variant="0" :side="row.stairs ? 'N' : undefined" />
              </span>
              <component
                :is="IconShuffle"
                class="absolute bottom-0 right-0 size-3.5 rounded-sm bg-card/80 p-0.5 text-foreground"
                aria-hidden="true"
              />
            </span>
          </CartographerPlaceTile>
          <CartographerPlaceTile
            v-for="v in row.variants"
            :key="v.variant"
            :label="v.label"
            :selected="samePlaceItem(item, { kind: 'object', category: row.category, variant: v.variant })"
            @pick="emit('pick', { kind: 'object', category: row.category, variant: v.variant })"
          >
            <PackTileThumb :runtime="runtime" :category="row.category" :variant="v.variant" :side="row.stairs ? 'N' : undefined" />
          </CartographerPlaceTile>
        </div>
      </div>
    </section>

    <ListSkeleton v-if="propsLoading" variant="tiles" :columns="1" :count="2" />

    <!-- The Dressing books switched on for this table, each under its own name. -->
    <section v-for="book in enabledBooks" :key="book.source" class="space-y-2">
      <h4 class="text-caption-sm text-muted-foreground">{{ book.title }}</h4>
      <div v-for="group in book.groups" :key="group.key" class="space-y-1">
        <p class="text-label text-foreground">{{ group.label }}</p>
        <div class="flex flex-wrap gap-1.5">
          <CartographerPlaceTile
            v-for="prop in group.props"
            :key="prop.id"
            :label="prop.name"
            :selected="item?.kind === 'prop' && item.propId === prop.id"
            @pick="emit('pick', { kind: 'prop', propId: prop.id })"
          >
            <PlaceItemThumb
              :item="{ kind: 'prop', propId: prop.id }"
              :runtime="runtime"
              :image-url="prop.image_url"
              :footprint="{ w: prop.footprint_w, h: prop.footprint_h }"
            />
          </CartographerPlaceTile>
        </div>
      </div>
    </section>

    <!-- Books on offer that are not switched on: what exists, and a way to turn it on here. -->
    <section v-if="moreBooks.length > 0" class="space-y-2">
      <h4 class="text-caption-sm text-muted-foreground">More books</h4>
      <article
        v-for="book in moreBooks"
        :key="book.source"
        class="space-y-1.5 rounded-md border border-border bg-card p-2"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-label-lg text-foreground">{{ book.title }}</p>
            <p class="text-caption-sm text-muted-foreground">{{ book.count }} {{ book.count === 1 ? "prop" : "props" }}</p>
          </div>
          <AppButton
            variant="outline"
            size="xs"
            label="Enable"
            :tooltip="`Switch on ${book.title} for this table`"
            :loading="enablingSource === book.source"
            :disabled="enablingSource !== null"
            @click="enable(book)"
          />
        </div>
        <div v-if="book.preview.length > 0" class="flex gap-1" aria-hidden="true">
          <span
            v-for="p in book.preview"
            :key="p.id"
            class="flex size-10 items-center justify-center rounded-sm border border-border bg-muted/40 p-0.5"
          >
            <img :src="p.image_url ?? undefined" alt="" crossorigin="anonymous" loading="lazy" class="size-full object-contain" />
          </span>
        </div>
      </article>
    </section>

    <p v-if="nothingMatches" class="text-caption-sm text-muted-foreground italic">Nothing matches.</p>

    <!-- The sources picker stays reachable for switching a book off again. -->
    <div class="flex items-center justify-between gap-2 border-t border-border pt-2">
      <span class="text-caption-sm text-muted-foreground">Manage the books for this table</span>
      <SourcesPickerPanel
        title="Dressing Sources"
        cue-key="dressing"
        description="Enabled sources add their props to the Place tool. Nothing to download."
        empty-message="No dressing sources available yet."
        :available-sources="availableSources"
        :is-loading="sourcesLoading"
      >
        <template #trigger="{ open: pickerOpen, toggle }">
          <AppButton
            variant="subtle"
            size="icon-sm"
            :active="pickerOpen"
            :icon="IconLibrary"
            class="shrink-0"
            tooltip="Manage Dressing sources for this campaign"
            @click="toggle"
          />
        </template>
      </SourcesPickerPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
// The Place tool's drawer (#1073 story 11): one picture catalogue for everything the tool can
// put down. The active set's own objects come first, each variant pickable and an "Any" tile
// that keeps the old mixing by position; then every Dressing book switched on for the table;
// then the books that are not, with an Enable button, so a DM sees what exists and turns it on
// without leaving the map. One search runs over all of it.
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import SourcesPickerPanel from "@/components/common/settings/SourcesPickerPanel.vue";
import CartographerPlaceTile from "@/components/cartographer/CartographerPlaceTile.vue";
import PackTileThumb from "@/components/cartographer/PackTileThumb.vue";
import PlaceItemThumb from "@/components/cartographer/PlaceItemThumb.vue";
import { useAllLibraryDressing, useLibraryDressing } from "@/composables/cartographer/useLibraryDressing";
import {
  useAvailableLibraryDressingSources,
  useEnableSource,
  useEnableUserSource,
  useLibrarySourceSlugs,
} from "@/composables/library/useEnabledSources";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { useContentScope } from "@/composables/rules/useRuleset";
import { useToast } from "@/composables/useToast";
import { IconLibrary, IconShuffle } from "@/lib/icons";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { placeItemLabel, samePlaceItem } from "@/cartographer/placeItem";
import { STAMP_CATEGORIES, stampLabel, variantLabel, type StampCategory } from "@/cartographer/stampCategories";
import type { PlaceItem } from "@/cartographer/tools";
import { DRESSING_GROUPS, type DressingGroup, type LibraryDressing } from "@/types/dressing.types";
import type { AvailableLibrarySource } from "@/composables/library/useEnabledSources";

const { item, runtime, setName, recent } = defineProps<{
  /** What is armed, or null when nothing is. */
  item: PlaceItem | null;
  /** The active tile set, whose objects the first section lists. Null until it loads. */
  runtime: TilePackRuntime | null;
  setName: string;
  /** The last items picked this session, newest first. */
  recent: readonly PlaceItem[];
}>();

const emit = defineEmits<{ pick: [item: PlaceItem] }>();

const search = ref("");
const needle = computed(() => search.value.trim().toLowerCase());
function matches(...fields: Array<string | null | undefined>): boolean {
  return !needle.value || fields.some((f) => f?.toLowerCase().includes(needle.value));
}

const toast = useToast();
const { labelFor } = useSourceTitles();
const { data: enabledProps, isLoading: propsLoading } = useLibraryDressing();
const { data: everyProp } = useAllLibraryDressing();
const { data: availableSources, isLoading: sourcesLoading } = useAvailableLibraryDressingSources();
const { slugs: enabledSlugs } = useLibrarySourceSlugs();

const manifest = computed(() => runtime?.manifest ?? null);

// ── The set's own objects ────────────────────────────────────────────────────
const objectKinds = computed(() =>
  STAMP_CATEGORIES.map((category: StampCategory) => {
    const count = runtime?.variantCount(category) ?? 0;
    return {
      category,
      count,
      // A lone tile is captioned by the pack's name for it, else the schema's.
      label: stampLabel(manifest.value, category),
      // A row is headed by the schema's name: its variants carry the pack's own labels.
      heading: stampLabel(null, category),
      stairs: category === "stairsUp" || category === "stairsDown",
    };
  }),
);

const singleObjects = computed(() =>
  objectKinds.value.filter((kind) => kind.count <= 1 && matches(kind.label, kind.heading)),
);

const objectRows = computed(() =>
  objectKinds.value
    .filter((kind) => kind.count >= 2)
    .map((kind) => ({
      ...kind,
      variants: Array.from({ length: kind.count }, (_, variant) => ({
        variant,
        label: variantLabel(manifest.value, kind.category, variant),
      })),
    }))
    .map((row) => ({
      ...row,
      variants: needle.value && !matches(row.heading) ? row.variants.filter((v) => matches(v.label)) : row.variants,
    }))
    .filter((row) => !needle.value || matches(row.heading) || row.variants.length > 0),
);

/** A lone tile stands for Any and variant 0 alike, so either selection marks it. */
function isSelectedObject(category: StampCategory, variant: 0): boolean {
  return samePlaceItem(item, { kind: "object", category, variant }) || samePlaceItem(item, { kind: "object", category, variant: "any" });
}

// ── Books switched on ────────────────────────────────────────────────────────
const enabledBooks = computed(() => {
  const bySource = new Map<string, LibraryDressing[]>();
  for (const prop of enabledProps.value ?? []) {
    const bucket = bySource.get(prop.source);
    if (bucket) bucket.push(prop);
    else bySource.set(prop.source, [prop]);
  }
  const books: Array<{ source: string; title: string; groups: Array<{ key: DressingGroup; label: string; props: LibraryDressing[] }> }> = [];
  for (const [source, props] of bySource) {
    const title = labelFor(source) ?? source;
    const groups = DRESSING_GROUPS.map((group) => ({
      ...group,
      props: props.filter(
        (p) => p.group_key === group.key && matches(p.name, group.label, title, ...p.tags),
      ),
    })).filter((group) => group.props.length > 0);
    if (groups.length > 0) books.push({ source, title, groups });
  }
  return books;
});

// ── Books on offer ───────────────────────────────────────────────────────────
const moreBooks = computed(() => {
  // Null means the enabled books are not known yet, not that none are on: offering every book to Enable while that
  // read loads would list books that are already switched on.
  if (enabledSlugs.value === null) return [];
  const on = new Set(enabledSlugs.value);
  return (availableSources.value ?? [])
    .filter((src) => !on.has(src.source))
    .map((src) => {
      const title = labelFor(src.source, src.source_title) ?? src.source;
      const preview = (everyProp.value ?? [])
        .filter((p) => p.source === src.source && p.image_url)
        .slice(0, 4);
      return { ...src, title, preview, tags: (everyProp.value ?? []).filter((p) => p.source === src.source).flatMap((p) => [p.name, ...p.tags]) };
    })
    .filter((book) => matches(book.title, ...book.tags));
});

const { standalone } = useContentScope();
const enableCampaign = useEnableSource();
const enableUser = useEnableUserSource();
const enablingSource = ref<string | null>(null);

/** Switches a book on through the same write the sources picker makes. */
function enable(book: AvailableLibrarySource & { title: string }): void {
  enablingSource.value = book.source;
  const vars = { source_slug: book.source, source_title: book.source_title };
  const options = {
    onSettled: () => { enablingSource.value = null; },
    onError: (e: unknown) => toast.error(toast.fromError(e, "Couldn't switch that book on.")),
  };
  if (standalone.value) enableUser.mutate(vars, options);
  else enableCampaign.mutate(vars, options);
}

// ── Recent ───────────────────────────────────────────────────────────────────
const recentRows = computed(() =>
  recent.map((entry, index) => {
    const prop = entry.kind === "prop" ? everyProp.value?.find((p) => p.id === entry.propId) : undefined;
    return {
      key: `${index}`,
      item: entry,
      label: placeItemLabel(entry, manifest.value, (id) => everyProp.value?.find((p) => p.id === id)?.name),
      imageUrl: prop ? prop.image_url : null,
      footprint: prop ? { w: prop.footprint_w, h: prop.footprint_h } : null,
    };
  }),
);

const nothingMatches = computed(
  () => !!needle.value && objectRows.value.length === 0 && singleObjects.value.length === 0 && enabledBooks.value.length === 0 && moreBooks.value.length === 0,
);
</script>
