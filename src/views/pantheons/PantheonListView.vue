<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Pantheons"
    description="Named groups of deities and their divine hierarchies"
  >
    <template #actions>
      <ListActionButton
        :icon="IconSun"
        label="All Deities"
        mobile-label="Deities"
        to="/deities"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Pantheon"
        mobile-label="Pantheon"
        variant="primary"
        to="/pantheons/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="!!search"
        @clear="search = ''"
      >
        <ListSearchInput v-model="search" placeholder="Filter pantheons…" />
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      title="No pantheons yet"
      description="Create a pantheon to group your deities — Faerûnian, Olympian, or wholly homebrew."
    />

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="pantheon in filtered"
          :key="pantheon.id"
          :to="`/pantheons/${pantheon.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-4"
        >
          <div class="shrink-0 h-12 w-12 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
            <FocalImage v-if="pantheon.emblem_url" :src="pantheon.emblem_url" format="square" :render-width="200" />
            <IconFire v-else class="h-5 w-5 text-muted-foreground/40" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-cinzel text-sm font-bold text-foreground truncate flex-1">{{ pantheon.name }}</p>
              <IconReveal v-if="pantheon.player_visible_to?.length" class="h-3 w-3 shrink-0 text-elven-green" />
            </div>
            <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mt-0.5">
              {{ deityCount(pantheon.id) }} {{ deityCount(pantheon.id) === 1 ? 'deity' : 'deities' }}
            </p>
            <div v-if="pantheon.tags.length" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in pantheon.tags.slice(0, 3)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >{{ tag }}</span>
            </div>
          </div>

          <IconChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
        </RouterLink>
      </div>
    </template>
  </ListPageLayout>

  <!-- ══ Mobile (<md): purpose-built list chrome ═══════════════════════════ -->
  <div v-else class="flex h-full flex-col">
    <div class="shrink-0 px-4 pt-3">
      <!-- Search row: search input + overflow ⋮ (no filter sheet — search only) -->
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <IconSearch
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="search"
            type="search"
            inputmode="search"
            placeholder="Search pantheons…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="search"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="search = ''"
          >
            <IconClose class="size-4" />
          </button>
        </div>

        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-label="More actions"
          @click="overflowOpen = true"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- List body -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <div v-if="isLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <EmptyState
        v-else-if="!pantheons?.length"
        title="No pantheons yet"
        description="Create a pantheon to group your deities — Faerûnian, Olympian, or wholly homebrew."
      />

      <p
        v-else-if="!filtered.length"
        class="py-12 text-center font-fell text-sm italic text-muted-foreground"
      >
        No pantheons match your search.
      </p>

      <template v-else>
        <MobileEntityMetaRow
          v-model:layout="layout"
          :shown="filtered.length"
          :total="pantheons?.length ?? 0"
          plural="Pantheons"
        />
        <div
          :class="layout === 'gallery'
            ? 'grid grid-cols-2 gap-3 pb-2'
            : 'flex flex-col gap-2 pb-2'"
        >
          <EntityMobileCard
            v-for="pantheon in filtered"
            :key="pantheon.id"
            :layout="layout"
            :to="`/pantheons/${pantheon.id}`"
            :title="pantheon.name"
            :subtitle="deityCount(pantheon.id) === 1 ? '1 deity' : `${deityCount(pantheon.id)} deities`"
            :image-url="pantheon.emblem_url"
            placeholder="/assets/placeholders/faction.webp"
            :shared="(pantheon.player_visible_to?.length ?? 0) > 0"
          />
        </div>
      </template>
    </div>

    <!-- Overflow ⋮ sheet -->
    <MobileSheet v-model:open="overflowOpen" title="More">
      <div class="flex flex-col gap-1 py-1">
        <RouterLink
          to="/deities"
          class="flex items-center gap-3 rounded-lg px-2 py-3 font-fell text-sm text-foreground hover:bg-muted/50"
          @click="overflowOpen = false"
        >
          <IconSun class="size-5 shrink-0 text-muted-foreground" /> All Deities
        </RouterLink>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { IconAdd, IconChevronRight, IconClose, IconFire, IconReveal, IconSearch, IconSun } from '@/lib/icons';
import { useAllPantheons, useAllDeities } from "@/composables/useDeities";
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";

const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");

const overflowOpen = ref(false);
const search = ref("");

const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => { ui.entityListLayout = v; },
});

const { data: pantheons, isLoading } = useAllPantheons();
const { data: deities } = useAllDeities();

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (pantheons.value ?? []).filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

function deityCount(pantheonId: string): number {
  return (deities.value ?? []).filter((d) => d.pantheon_id === pantheonId).length;
}
</script>
