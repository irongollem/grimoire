<template>
  <div>
    <PageHeader
      title="Factions"
      description="Guilds, cults, governments, and other organisations"
    >
      <template #actions>
        <RouterLink
          to="/factions/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New Faction
        </RouterLink>
      </template>
    </PageHeader>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!factions?.length"
      title="No factions yet"
      description="Create guilds, cults, governments and other organisations."
    />

    <template v-else>
      <!-- Filter bar -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <input
          v-model="search"
          type="search"
          placeholder="Filter factions…"
          class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          v-model="typeFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All types</option>
          <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="faction in filtered"
          :key="faction.id"
          :to="`/factions/${faction.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-4"
        >
          <!-- Emblem / placeholder -->
          <div class="shrink-0 h-12 w-12 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
            <img v-if="faction.emblem_url" :src="faction.emblem_url" alt="" class="w-full h-full object-cover" />
            <Shield v-else class="h-5 w-5 text-muted-foreground/40" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-cinzel text-sm font-bold text-foreground truncate flex-1">{{ faction.name }}</p>
              <Eye v-if="faction.is_player_visible" class="h-3 w-3 shrink-0 text-elven-green" />
            </div>
            <p v-if="faction.faction_type" class="font-cinzel text-[10px] text-muted-foreground tracking-wider mt-0.5">
              {{ faction.faction_type }}
            </p>
            <div v-if="faction.tags.length" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in faction.tags.slice(0, 3)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >{{ tag }}</span>
            </div>
          </div>

          <ChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, Shield, ChevronRight, Eye } from "lucide-vue-next";
import { useAllFactions } from "@/composables/useFactions";
import { FACTION_TYPES } from "@/types/faction.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const { data: factions, isLoading } = useAllFactions();

const search     = ref("");
const typeFilter = ref("");

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (factions.value ?? []).filter((f) => {
    if (typeFilter.value && f.faction_type !== typeFilter.value) return false;
    if (q && !f.name.toLowerCase().includes(q) && !f.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});
</script>
