<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && typeFilter === 'all' && sourceFilter === 'custom'"
      title="No custom monsters yet"
      description="Customize an SRD monster or build your own from scratch."
    >
      <template #icon><IconNavBestiary class="h-16 w-16" /></template>
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          @click="handleNew"
        >
          Add your first monster
        </button>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No monsters match your filters.
    </p>

    <!-- ── Mobile list (<md): compact rows / gallery ─────────────────────── -->
    <template v-else-if="isMobile">
      <MobileEntityMetaRow
        v-model:layout="layout"
        :shown="filtered.length"
        :total="allMonsters?.length ?? 0"
        plural="monsters"
      />
      <div
        :class="layout === 'gallery'
          ? 'grid grid-cols-2 gap-3 pb-2'
          : 'flex flex-col gap-2 pb-2'"
      >
        <EntityMobileCard
          v-for="monster in visibleItems"
          :key="monster.id"
          :layout="layout"
          :to="`/monsters/${monster.id}`"
          :title="monster.name"
          :subtitle="monsterSubtitle(monster)"
          :image-url="monster.image_url"
          :focal-point="monster.portrait_focal_point"
          placeholder="/assets/placeholders/monster.webp"
          :badge-text="crLabel(monster.stat_block.challenge_rating)"
          :badge-color="crColor(monster.stat_block.challenge_rating)"
          :location="monster.habitat || undefined"
          :shared="isDiscovered(monster)"
        />
      </div>
    </template>

    <!-- ── Desktop grid (≥md): unchanged ─────────────────────────────────── -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <MonsterGridCard
        v-for="monster in visibleItems"
        :key="monster.id"
        :monster="monster"
        :locked="lockedMonsterIds.has(monster.id)"
      />
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length && !isMobile"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ allMonsters?.length ?? 0 }} monsters
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconNavBestiary } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useAllMonsters } from "@/composables/useMonsters";
import { useCampaignDiscoveries } from "@/composables/useDiscoveredMonsters";
import MonsterGridCard from "@/components/monsters/MonsterGridCard.vue";
import { crColor, crLabel } from "@/lib/monsterDisplay";
import type { Monster } from "@/types/monster.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const { canCreate, quota: monsterQuota } = useQuota("monsters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/monsters/new");
}

const ui = useUiStore();
const search = computed(() => ui.monstersSearch);
const typeFilter = computed(() => ui.monstersFilterType);
const sourceFilter = computed(() => ui.monstersFilterSource);
const isMobile = useMediaQuery("(max-width: 767px)");
const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => { ui.entityListLayout = v; },
});

const { data: allMonsters, isLoading } = useAllMonsters();

// ── Discovery ────────────────────────────────────────────────────────────────
//
// Only the mobile card's "shared" badge still asks. Managing the reveal — the
// audience and the stat-block gate — is MonsterRevealControl's, which is why
// the hand-positioned popover left this file.

const { data: discoveries } = useCampaignDiscoveries();

function isDiscovered(monster: Monster): boolean {
  return !!discoveries.value?.find(
    (d) => (monster.is_shared ? d.library_monster_id === monster.id : d.monster_id === monster.id),
  );
}

const filtered = computed(() => {
  let list = allMonsters.value ?? [];
  if (sourceFilter.value === "custom") list = list.filter((m) => !m.is_shared);
  else if (sourceFilter.value !== "all") list = list.filter((m) => m.source === sourceFilter.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.monster_type.toLowerCase().includes(q) ||
        m.habitat?.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (typeFilter.value !== "all")
    list = list.filter((m) => m.monster_type === typeFilter.value);
  return list;
});

const { savedCount, linkCount } = useScrollRestore("monsters");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

const lockedMonsterIds = computed((): Set<string> => {
  const q = monsterQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const customMonsters = (allMonsters.value ?? []).filter(m => !m.is_shared);
  const sorted = [...customMonsters].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map(m => m.id));
});

// Mobile-card subtitle — mirrors the desktop "{size} {type}" line.
function monsterSubtitle(monster: Monster): string {
  return `${monster.size} ${monster.monster_type}`;
}
</script>
