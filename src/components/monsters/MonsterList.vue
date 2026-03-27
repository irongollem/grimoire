<template>
  <div>
    <!-- Filters bar -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-48">
        <Search
          class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
        />
        <input
          v-model="search"
          type="text"
          placeholder="Search monsters…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Source filter -->
      <div
        class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider"
      >
        <button
          v-for="s in SOURCE_OPTIONS"
          :key="s.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="
            sourceFilter === s.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'
          "
          @click="sourceFilter = s.value"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- Type filter -->
      <div
        class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider"
      >
        <button
          v-for="t in TYPE_OPTIONS"
          :key="t.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="
            typeFilter === t.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'
          "
          @click="typeFilter = t.value"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && typeFilter === 'all' && sourceFilter === 'custom'"
      title="No custom monsters yet"
      description="Customize an SRD monster or build your own from scratch."
    >
      <template #action>
        <RouterLink
          to="/monsters/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first monster
        </RouterLink>
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
        v-for="monster in filtered"
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
            <span><span class="text-foreground font-bold">HP</span> {{ monster.stat_block.hit_points }}</span>
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
          class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit monster"
        >
          <Pencil class="h-3 w-3" />
          Edit
        </RouterLink>
      </div>
    </div>

    <p
      v-if="filtered.length"
      class="mt-4 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ allMonsters?.length ?? 0 }} monsters
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search, Pencil } from "lucide-vue-next";
import { useAllMonsters } from "@/composables/useMonsters";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "srd", label: "SRD" },
  { value: "custom", label: "Custom" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "beast", label: "Beast" },
  { value: "humanoid", label: "Humanoid" },
  { value: "undead", label: "Undead" },
  { value: "fiend", label: "Fiend" },
  { value: "dragon", label: "Dragon" },
  { value: "giant", label: "Giant" },
  { value: "monstrosity", label: "Monstrosity" },
];

const search = ref("");
const typeFilter = ref("all");
const sourceFilter = ref("all");

const { data: allMonsters, isLoading } = useAllMonsters();

const filtered = computed(() => {
  let list = allMonsters.value ?? [];
  if (sourceFilter.value === "srd") list = list.filter((m) => m.is_srd);
  if (sourceFilter.value === "custom") list = list.filter((m) => !m.is_srd);
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
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
