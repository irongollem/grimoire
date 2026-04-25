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
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No monsters match your filters.
    </p>

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <div
        v-for="monster in visibleItems"
        :key="monster.id"
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay -->
        <RouterLink :to="`/monsters/${monster.id}`" class="absolute inset-0 z-2" />

        <!-- CR colour bar -->
        <div
          class="h-1.5 w-full shrink-0"
          :style="{ backgroundColor: crColor(monster.stat_block.challenge_rating) }"
        />

        <!-- Thumbnail (landscape) -->
        <div class="relative h-36 bg-muted overflow-hidden shrink-0">
          <FocalImage
            v-if="monster.image_url"
            :src="monster.image_url"
            :alt="monster.name"
            format="landscape"
            :focal-point="monster.portrait_focal_point"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-3xl font-cinzel font-bold"
            :style="{
              backgroundColor: crColor(monster.stat_block.challenge_rating) + '22',
              color: crColor(monster.stat_block.challenge_rating),
            }"
          >
            {{ monster.name.charAt(0).toUpperCase() }}
          </div>
        </div>

        <div class="p-3 flex flex-col gap-2 flex-1">
          <!-- Name + SRD badge + CR -->
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight flex-1 line-clamp-1">
              {{ monster.name }}
            </h3>
            <div class="flex items-center gap-1 shrink-0">
              <span
                v-if="monster.is_srd"
                class="px-1 py-0.5 rounded font-cinzel text-[9px] font-bold tracking-wider bg-muted text-muted-foreground border border-border"
              >
                SRD
              </span>
              <span
                class="min-w-8 text-center px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider text-white"
                :style="{ backgroundColor: crColor(monster.stat_block.challenge_rating) }"
              >
                CR {{ monster.stat_block.challenge_rating }}
              </span>
            </div>
          </div>

          <!-- Type + Size -->
          <p class="font-fell text-xs text-muted-foreground italic capitalize">
            {{ monster.size }} {{ monster.monster_type }}
          </p>

          <!-- Stats row -->
          <div class="flex gap-3 font-cinzel text-[11px] text-muted-foreground">
            <span><span class="text-foreground font-bold">AC</span> {{ monster.stat_block.armor_class }}</span>
            <span><span class="text-foreground font-bold">HP</span> {{ formatHitPoints(monster.stat_block.hit_points) }}</span>
          </div>

          <!-- Tags -->
          <div v-if="monster.tags.length" class="flex flex-wrap gap-1 mt-auto">
            <span
              v-for="tag in monster.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Edit button (custom monsters only, floats over portrait top-left on hover) -->
        <RouterLink
          v-if="!monster.is_srd"
          :to="`/monsters/${monster.id}?edit=true`"
          class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit monster"
        >
          <Pencil class="h-3 w-3" />
          Edit
        </RouterLink>
        <!-- Player visibility button (floats top-right, opens share popover) -->
        <button
          type="button"
          class="absolute top-2 right-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider transition-opacity cursor-pointer"
          :class="isDiscovered(monster)
            ? 'text-primary bg-black/60 opacity-100'
            : 'text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100'"
          :title="isDiscovered(monster) ? 'Shared — click to manage' : 'Hidden — click to share'"
          @click.prevent.stop="openPopover(monster, $event)"
        >
          <Eye v-if="isDiscovered(monster)" class="h-3 w-3" />
          <EyeOff v-else class="h-3 w-3" />
        </button>
      </div>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length"
      class="mt-4 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ allMonsters?.length ?? 0 }} monsters
    </p>
  </div>

  <!-- Share popover (Teleported to avoid card overflow clipping) -->
  <Teleport to="body">
    <div
      v-if="popover.monster"
      class="fixed inset-0 z-50"
      @mousedown.self="closePopover"
    >
      <div
        class="absolute bg-card border border-border rounded-lg shadow-xl p-3 w-52 space-y-2"
        :style="popover.style"
        @mousedown.stop
      >
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider truncate">{{ popover.monster.name }}</p>

        <!-- Whole party -->
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
          :class="popoverCurrentDiscovery && allPartyIds.every(id => isMemberVisible(id))
            ? 'bg-primary/15 text-primary'
            : 'text-foreground hover:bg-muted/50'"
          @click="setWholeParty()"
        >
          <Users class="h-3 w-3 shrink-0" />
          Whole party
        </button>

        <!-- Per-player toggles -->
        <div class="space-y-0.5">
          <button
            v-for="member in party"
            :key="member.id"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
            :class="isMemberVisible(member.id)
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
            @click="toggleMember(member.id)"
          >
            <component
              :is="isMemberVisible(member.id) ? Eye : EyeOff"
              class="h-3 w-3 shrink-0"
            />
            {{ member.name }}
          </button>
        </div>

        <!-- Reveal stats toggle (only when shared) -->
        <div v-if="popoverCurrentDiscovery" class="border-t border-border pt-1">
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs transition-colors"
            :class="popoverCurrentDiscovery.reveal_stats
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
            @click="updateStats({ id: popoverCurrentDiscovery.id, revealStats: !popoverCurrentDiscovery.reveal_stats })"
          >
            <BarChart2 class="h-3 w-3 shrink-0" />
            {{ popoverCurrentDiscovery.reveal_stats ? 'Stats visible' : 'Stats hidden' }}
          </button>
        </div>

        <!-- Divider + unshare -->
        <div class="border-t border-border pt-1">
          <button
            v-if="popoverCurrentDiscovery"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-fell text-xs text-destructive hover:bg-destructive/10 transition-colors"
            @click="unshare"
          >
            <EyeOff class="h-3 w-3 shrink-0" />
            Hide from all players
          </button>
          <p v-else class="font-fell text-[10px] text-muted-foreground italic px-2">
            Select players above to share.
          </p>
        </div>
      </div>
    </div>
  </Teleport>

  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { useRouter } from "vue-router";
import { formatHitPoints } from "@/lib/utils";
import { Pencil, Eye, EyeOff, Users, BarChart2 } from "lucide-vue-next";
import { useUiStore } from "@/stores/ui";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useAllMonsters } from "@/composables/useMonsters";
import { useMonsterVisibility } from "@/composables/useMonsterVisibility";
import type { Monster, DiscoveredMonster } from "@/types/monster.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const { canCreate } = useQuota("monsters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/monsters/new");
}

const ui = useUiStore();
const search = computed(() => ui.monstersSearch);
const typeFilter = computed(() => ui.monstersFilterType);
const sourceFilter = computed(() => ui.monstersFilterSource);

const { data: allMonsters, isLoading } = useAllMonsters();

// ── Share popover ────────────────────────────────────────────────────────────

const popover = reactive<{ monster: Monster | null; style: string }>({
  monster: null,
  style: "",
});

const {
  discoveries,
  party,
  currentDiscovery: popoverCurrentDiscovery,
  allPartyIds,
  isMemberVisible,
  setWholeParty,
  toggleMember,
  unshare: doUnshare,
  updateStats,
} = useMonsterVisibility(computed(() => popover.monster));

function getDiscovery(monster: Monster): DiscoveredMonster | undefined {
  return discoveries.value?.find(
    (d) => monster.is_srd ? d.srd_slug === monster.id : d.monster_id === monster.id,
  );
}

function isDiscovered(monster: Monster): boolean {
  return !!getDiscovery(monster);
}

function openPopover(monster: Monster, event: MouseEvent) {
  popover.monster = monster;
  const btn = event.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  const top = rect.bottom + 4;
  const right = window.innerWidth - rect.right;
  popover.style = `top:${top}px;right:${right}px`;
}

function closePopover() { popover.monster = null; }

function unshare() {
  doUnshare();
  closePopover();
}

const filtered = computed(() => {
  let list = allMonsters.value ?? [];
  if (sourceFilter.value === "srd") list = list.filter((m) => m.is_srd);
  if (sourceFilter.value === "custom") list = list.filter((m) => !m.is_srd);
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

const { visibleItems, sentinelRef } = useInfiniteScroll(filtered);

function parseFraction(s: string): number {
  const [a, b] = s.split("/");
  return parseFloat(a) / parseFloat(b);
}

function crColor(cr: string): string {
  const num =
    cr === "0" ? 0 : cr.includes("/") ? parseFraction(cr) : parseFloat(cr);
  if (num <= 0.5) return "#22c55e";
  if (num <= 4) return "#eab308";
  if (num <= 9) return "#f97316";
  if (num <= 15) return "#dc2626";
  return "#7c3aed";
}
</script>
