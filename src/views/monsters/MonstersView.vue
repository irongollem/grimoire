<template>
  <ListPageLayout title="Bestiary" description="Your custom monster compendium">
    <template #actions>
      <!-- Sources panel — per-campaign library selection, DB-backed so it persists -->
      <div ref="sourcePickerRef" class="relative shrink-0">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shrink-0"
          :class="showSourcePicker ? 'border-primary/50 text-foreground' : ''"
          title="Manage monster sources for this campaign"
          @click="showSourcePicker = !showSourcePicker"
        >
          <Library class="size-3.5 shrink-0" />
        </button>
        <div
          v-show="showSourcePicker"
          class="absolute right-0 top-full mt-1 z-50 w-80 rounded-md border border-border bg-popover shadow-lg"
        >
          <div class="p-3 border-b border-border">
            <p class="font-cinzel text-xs font-semibold text-foreground">Monster Sources</p>
            <p class="font-fell text-xs text-muted-foreground mt-0.5 italic">
              Enabled sources appear in your Bestiary instantly — no download needed.
            </p>
          </div>
          <div v-if="sourcesLoading" class="p-4 flex items-center justify-center">
            <Loader2 class="size-4 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="availableSources.length === 0" class="p-4">
            <p class="font-fell text-xs text-muted-foreground italic">No sources available yet. Ask your admin to seed the srd_monsters table.</p>
          </div>
          <div v-else class="p-2 flex flex-col gap-0.5 max-h-72 overflow-y-auto">
            <label
              v-for="src in availableSources"
              :key="src.source"
              class="flex items-center gap-2.5 px-2 py-2 rounded cursor-pointer hover:bg-accent transition-colors"
              :class="(enableEnable.isPending.value || enableDisable.isPending.value) ? 'pointer-events-none opacity-60' : ''"
            >
              <input
                type="checkbox"
                :checked="isEnabled(src.source)"
                class="accent-primary shrink-0"
                @change="toggleSource(src)"
              />
              <span class="font-fell text-sm text-foreground flex-1 min-w-0 truncate">
                {{ src.source_title ?? src.source }}
              </span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ src.count.toLocaleString() }}</span>
            </label>
          </div>
        </div>
      </div>

      <ListActionButton
        :icon="Wand2"
        label="Generate"
        @click="ui.monsterGeneratorOpen = true"
      />
      <ListActionButton
        :icon="Plus"
        label="New Monster"
        mobile-label="Monster"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.monstersHasActiveFilters"
        @clear="ui.resetMonstersFilters()"
      >
        <ListSearchInput v-model="ui.monstersSearch" placeholder="Search monsters…" />
        <!--
          Source pill group is desktop-only: on mobile the row has to fit
          search + type dropdown + Clear inside the viewport, and SRD-vs-
          Custom is a rare filter that mobile DMs can surface from desktop
          when they actually need it. `md:contents` keeps the group
          transparent to the flex layout at md+ so nothing changes there.
        -->
        <div class="hidden md:contents">
          <ListFilterGroup
            v-model="ui.monstersFilterSource"
            :options="SOURCE_OPTIONS"
            aria-label="Source filter"
          />
        </div>
        <!--
          Type covers all 14 standard D&D creature types — too many to sit as
          a button row without causing weird widths and wrap on mobile. A
          native select lists them compactly and uses the OS picker on
          touch devices (keeps iOS wheel / Android bottom-sheet).
        -->
        <ListFilterSelect
          v-model="ui.monstersFilterType"
          aria-label="Monster type filter"
        >
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <MonsterList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Plus, Wand2, Loader2, Library } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MonsterList from "@/components/monsters/MonsterList.vue";
import { useUiStore } from "@/stores/ui";
import { useRouter } from "vue-router";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";
import {
  useEnabledSources,
  useAvailableSrdSources,
  useEnableSource,
  useDisableSource,
  type AvailableSrdSource,
} from "@/composables/useEnabledSources";

const router = useRouter();
const ui = useUiStore();
const { canCreate } = useQuota("monsters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/monsters/new");
}

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "srd", label: "SRD" },
  { value: "custom", label: "Custom" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "aberration", label: "Aberration" },
  { value: "beast", label: "Beast" },
  { value: "celestial", label: "Celestial" },
  { value: "construct", label: "Construct" },
  { value: "dragon", label: "Dragon" },
  { value: "elemental", label: "Elemental" },
  { value: "fey", label: "Fey" },
  { value: "fiend", label: "Fiend" },
  { value: "giant", label: "Giant" },
  { value: "humanoid", label: "Humanoid" },
  { value: "monstrosity", label: "Monstrosity" },
  { value: "ooze", label: "Ooze" },
  { value: "plant", label: "Plant" },
  { value: "undead", label: "Undead" },
] as const;

// ── Sources panel ────────────────────────────────────────────────────────────
const showSourcePicker = ref(false);
const sourcePickerRef  = ref<HTMLElement | null>(null);
onClickOutside(sourcePickerRef, () => { showSourcePicker.value = false; });

const { data: enabledSourceData }                      = useEnabledSources();
const { data: availableSourceData, isLoading: sourcesLoading } = useAvailableSrdSources();
const enableEnable  = useEnableSource();
const enableDisable = useDisableSource();

const availableSources = computed(() => availableSourceData.value ?? []);
const enabledSlugs     = computed(() => new Set(enabledSourceData.value?.map((e) => e.source_slug) ?? []));

function isEnabled(slug: string) { return enabledSlugs.value.has(slug); }

function toggleSource(src: AvailableSrdSource) {
  if (isEnabled(src.source)) {
    enableDisable.mutate(src.source);
  } else {
    enableEnable.mutate({ source_slug: src.source, source_title: src.source_title });
  }
}
</script>
