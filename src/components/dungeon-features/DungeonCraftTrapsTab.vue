<template>
  <div v-if="trapsLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <template v-else-if="traps?.length">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <input
        v-model="trapsSearch"
        type="search"
        placeholder="Search traps…"
        class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        v-model="trapsTypeFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Types</option>
        <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>
    <p v-if="!filteredTraps.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
      No traps match your filter.
    </p>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <RouterLink
        v-for="trap in filteredTraps"
        :key="trap.id"
        :to="`/traps/${trap.id}`"
        class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
      >
        <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
          <FocalImage
            :src="trap.image_url"
            :alt="trap.name"
            format="portrait"
            :focal-point="trap.image_focal_point"
            placeholder="/assets/placeholders/trap.webp"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <span
            class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
            :style="{ backgroundColor: TRAP_TYPE_COLORS[trap.trap_type] + 'DD' }"
          >{{ trap.trap_type }}</span>
        </div>
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ trap.name }}</h3>
          <div class="flex items-center gap-2">
            <span v-if="trap.cr" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">CR {{ trap.cr }}</span>
            <span v-if="trap.trigger_type" class="font-fell text-[10px] text-muted-foreground italic truncate">{{ trap.trigger_type }}</span>
          </div>
        </div>
      </RouterLink>
    </div>
  </template>
  <EmptyState
    v-else
    icon="Crosshair"
    title="No traps yet"
    description="Build your first trap — set the trigger, DCs, damage, and CR."
    action-label="New Trap"
    @action="router.push('/traps/new')"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useTraps } from "@/composables/useTraps";
import { TRAP_TYPES, TRAP_TYPE_COLORS } from "@/types/trap.types";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const router = useRouter();
const { data: traps, isLoading: trapsLoading } = useTraps();
const trapsSearch     = ref("");
const trapsTypeFilter = ref("");

const filteredTraps = computed(() => {
  let list = traps.value ?? [];
  if (trapsTypeFilter.value) list = list.filter((t) => t.trap_type === trapsTypeFilter.value);
  const q = trapsSearch.value.toLowerCase().trim();
  if (q) list = list.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    (t.trigger_type ?? "").toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});
</script>
