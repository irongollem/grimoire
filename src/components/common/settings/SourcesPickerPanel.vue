<template>
  <!-- ══ Popover variant — desktop trigger + absolute-positioned panel ══════ -->
  <div v-if="variant === 'popover'" ref="rootRef" class="relative shrink-0">
    <slot name="trigger" :open="open" :toggle="toggle" :has-cue="hasCue" />
    <!-- The trigger is an icon button that fills this wrapper, so the dot sits on its corner. -->
    <EntityNewDot
      :is-new="hasCue"
      size="sm"
      title="More library content to explore"
      class="pointer-events-none absolute -top-0.5 -right-0.5"
    />

    <!-- On a phone the trigger usually sits at the left of a wrapped action
         row, so a 20rem panel hung off its right edge ran off the screen and
         under the list. The same rows open as a sheet there instead. -->
    <MobileSheet v-if="isMobile" v-model:open="open" :title="title">
      <SourcesPickerPanel
        variant="sheet"
        :scope="scope"
        :description="description"
        :empty-message="emptyMessage"
        :available-sources="availableSources"
        :is-loading="isLoading"
        :cue-key="cueKey"
      />
    </MobileSheet>

    <div
      v-show="open && !isMobile"
      data-slip class="absolute right-0 top-full mt-1 z-50 w-80 rounded-md border border-border bg-popover shadow-lg"
    >
      <div class="p-3 border-b border-border">
        <p class="text-label-lg font-semibold text-foreground">{{ title }}</p>
        <p class="text-caption text-muted-foreground mt-0.5 italic">
          {{ description }}
        </p>
      </div>
      <div v-if="isLoading" class="p-4 flex items-center justify-center">
        <BannerLoader class="h-6" />
      </div>
      <div v-else-if="rows.length === 0" class="p-4">
        <p class="text-caption text-muted-foreground italic">{{ emptyMessage }}</p>
      </div>
      <div v-else class="p-2 flex flex-col gap-0.5 max-h-72 overflow-y-auto">
        <AppCheckbox
          v-for="row in rows"
          :key="row.source"
          :model-value="row.locked || isEnabled(row.source)"
          :disabled="row.locked"
          :class="[
            'gap-2.5 px-2 py-2 rounded hover:bg-accent transition-colors',
            isMutating ? 'pointer-events-none opacity-60' : '',
          ]"
          label-layout="row"
          @update:model-value="toggleSource(row)"
        >
          <span class="min-w-0 flex-1 truncate">{{ row.title }}</span>
          <span v-if="row.locked" class="text-caption italic text-muted-foreground shrink-0">always on</span>
          <span v-else-if="row.count !== null" class="text-label text-muted-foreground shrink-0">{{ row.count.toLocaleString() }}</span>
        </AppCheckbox>
      </div>
      <div class="p-2 border-t border-border">
        <RouterLink
          to="/rules?tab=licenses"
          class="block px-1 py-1 text-caption text-primary hover:underline"
        >
          Licenses &amp; attribution
        </RouterLink>
      </div>
    </div>
  </div>

  <!-- ══ Sheet variant — inner list only; parent hosts it inside a MobileSheet ══ -->
  <div v-else class="flex flex-col">
    <p class="mb-3 text-caption italic text-muted-foreground">
      {{ description }}
    </p>
    <div v-if="isLoading" class="flex items-center justify-center py-6">
      <BannerLoader class="h-8" />
    </div>
    <p v-else-if="rows.length === 0" class="py-4 text-body italic text-muted-foreground">
      {{ emptyMessage }}
    </p>
    <div v-else class="flex flex-col gap-0.5">
      <AppCheckbox
        v-for="row in rows"
        :key="row.source"
        :model-value="row.locked || isEnabled(row.source)"
        :disabled="row.locked"
        :class="[
          'gap-3 rounded-lg px-2 py-3 hover:bg-muted/50',
          isMutating ? 'pointer-events-none opacity-60' : '',
        ]"
        label-layout="row"
        @update:model-value="toggleSource(row)"
      >
        <span class="min-w-0 flex-1 truncate">{{ row.title }}</span>
        <span v-if="row.locked" class="shrink-0 text-caption italic text-muted-foreground">always on</span>
        <span v-else-if="row.count !== null" class="shrink-0 text-label text-muted-foreground">{{ row.count.toLocaleString() }}</span>
      </AppCheckbox>
    </div>
    <RouterLink
      to="/rules?tab=licenses"
      class="mt-2 px-2 py-1 text-caption text-primary hover:underline"
    >
      Licenses &amp; attribution
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { ref, computed, watch } from "vue";
import { RouterLink } from "vue-router";
import { onClickOutside } from "@vueuse/core";
import EntityNewDot from "@/components/common/entity/EntityNewDot.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
// Itself, for the phone sheet: the sheet variant is this component's own list.
import SourcesPickerPanel from "./SourcesPickerPanel.vue";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { useSourceCue } from "@/composables/library/useSourceCue";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useToast } from "@/composables/useToast";
import {
  STANDALONE_LIBRARY_SLUGS,
  useEnabledSources,
  useEnableSource,
  useDisableSource,
  useUserEnabledSources,
  useEnableUserSource,
  useDisableUserSource,
  type AvailableLibrarySource,
} from "@/composables/library/useEnabledSources";

// Popover: desktop trigger button (parent-supplied via #trigger slot) + a
// floating panel, self-contained click-outside-to-close.
// Sheet: just the description + list, meant to be dropped inside a parent's
// own MobileSheet — that shell already owns open/close chrome and scrolling.
//
// Scope: "campaign" toggles the active campaign's books (a DM's choice for the
// table); "player" toggles the signed-in player's own books, which build the
// characters that have no table. The two SRDs are always on for a player, so
// that scope shows them checked and locked rather than as rows to toggle.
const {
  variant = "popover",
  scope = "campaign",
  title = "",
  description,
  emptyMessage,
  availableSources,
  isLoading,
  cueKey,
} = defineProps<{
  variant?: "popover" | "sheet";
  scope?: "campaign" | "player";
  title?: string;
  description: string;
  emptyMessage: string;
  availableSources: AvailableLibrarySource[] | undefined;
  isLoading: boolean;
  /** Names this picker in the "more to explore" cue; without it the picker shows no dot. */
  cueKey?: string;
}>();

const toast = useToast();
const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const isMobile = useIsMobile();
// The sheet is teleported, so a tap inside it is "outside" the root; it owns
// its own dismissal.
onClickOutside(rootRef, () => { if (!isMobile.value) open.value = false; });
function toggle() { open.value = !open.value; }

// Scope-specific, not entity-specific, so the panel owns this wiring directly
// rather than receiving it as props.
const { data: campaignSourceData } = useEnabledSources();
const campaignEnable = useEnableSource();
const campaignDisable = useDisableSource();
const { data: userSourceData } = useUserEnabledSources();
const userEnable = useEnableUserSource();
const userDisable = useDisableUserSource();

const enabledSlugs = computed(() => {
  const data = scope === "player" ? userSourceData.value : campaignSourceData.value;
  return new Set(data ? data.map((e) => e.source_slug) : []);
});
const isMutating = computed(() =>
  scope === "player"
    ? userEnable.isPending.value || userDisable.isPending.value
    : campaignEnable.isPending.value || campaignDisable.isPending.value,
);

interface PickerRow {
  source: string;
  source_title: string | null;
  title: string;
  count: number | null;
  locked: boolean;
}

const { labelFor } = useSourceTitles();

const rows = computed<PickerRow[]>(() => {
  const listed = (availableSources ?? []).map((src) => ({
    source: src.source,
    source_title: src.source_title,
    title: labelFor(src.source, src.source_title) ?? src.source,
    count: src.count,
    locked: scope === "player" && STANDALONE_LIBRARY_SLUGS.includes(src.source),
  }));
  if (scope !== "player") return listed;
  // The SRDs are always on, so they show even when the library lists nothing for them.
  const missing = STANDALONE_LIBRARY_SLUGS
    .filter((slug) => !listed.some((row) => row.source === slug))
    .map((slug) => ({ source: slug, source_title: null, title: labelFor(slug) ?? slug, count: null, locked: true }));
  return [...missing, ...listed];
});

// The cue counts a source as taken care of when it is enabled in this scope; a
// player's SRDs are always on. Null until the scope's sources have loaded.
const cueEnabled = computed(() => {
  const data = scope === "player" ? userSourceData.value : campaignSourceData.value;
  if (!data) return null;
  const slugs = data.map((e) => e.source_slug);
  return new Set(scope === "player" ? [...slugs, ...STANDALONE_LIBRARY_SLUGS] : slugs);
});
const { hasCue, markSeen } = useSourceCue(() => cueKey, () => availableSources, cueEnabled);
// Opening the picker (the sheet exists only while open) is what "seen" means.
watch(
  () => [variant === "sheet" || open.value, availableSources] as const,
  ([showing]) => { if (showing) markSeen(); },
  { immediate: true },
);

function isEnabled(slug: string) { return enabledSlugs.value.has(slug); }

function toggleSource(row: PickerRow) {
  if (row.locked) return;
  const enabling = !isEnabled(row.source);
  const options = { onError: (e: unknown) => toast.error(toast.fromError(e, "Couldn't change the books.")) };
  if (scope === "player") {
    if (enabling) userEnable.mutate({ source_slug: row.source, source_title: row.source_title }, options);
    else userDisable.mutate(row.source, options);
  } else if (enabling) {
    campaignEnable.mutate({ source_slug: row.source, source_title: row.source_title }, options);
  } else {
    campaignDisable.mutate(row.source, options);
  }
}
</script>
