<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !props.search && !props.levelFilter && !props.schoolFilter && !props.classFilter"
      title="No spells yet"
      description="Craft your spellbook — cantrips to 9th-level catastrophes."
    >
      <template #action>
        <RouterLink
          to="/spells/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first spell
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No spells match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <div
        v-for="spell in filtered"
        :key="spell.id"
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay -->
        <RouterLink :to="`/spells/${spell.id}`" class="absolute inset-0 z-2" />

        <!-- School colour bar -->
        <div
          class="h-1.5 w-full shrink-0"
          :style="{ backgroundColor: SCHOOL_COLORS[spell.school] }"
        />

        <div class="p-3 flex flex-col gap-2 flex-1">
          <!-- Name + level badge -->
          <div class="flex items-start justify-between gap-2">
            <h3
              class="font-cinzel text-sm font-bold text-foreground leading-tight flex-1 line-clamp-2"
            >
              {{ spell.name }}
            </h3>
            <span
              class="shrink-0 px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider text-white whitespace-nowrap"
              :style="{ backgroundColor: SCHOOL_COLORS[spell.school] }"
            >
              {{ spell.level === 0 ? "C" : spell.level }}
            </span>
          </div>

          <!-- School + type line -->
          <p class="font-fell text-xs text-muted-foreground italic capitalize">
            {{ spellLevelLabel(spell.level) }} {{ spell.school }}
            <span v-if="spell.ritual"> · Ritual</span>
          </p>

          <!-- Cast time + range -->
          <div class="flex gap-3 font-cinzel text-[11px] text-muted-foreground">
            <span><span class="text-foreground font-bold">Cast</span> {{ spell.casting_time }}</span>
            <span><span class="text-foreground font-bold">Range</span> {{ spell.range }}</span>
          </div>

          <!-- Components -->
          <p class="font-cinzel text-[11px] text-muted-foreground">
            <span class="text-foreground font-bold">Components</span>
            {{ spell.components.join(", ") || "—" }}
            <span v-if="spell.concentration"> · <em class="text-primary">Conc.</em></span>
          </p>

          <!-- Classes -->
          <p
            v-if="spell.classes.length"
            class="font-fell text-[11px] text-muted-foreground truncate"
          >
            {{ spell.classes.join(", ") }}
          </p>

          <!-- Tags -->
          <div v-if="spell.tags.length" class="flex flex-wrap gap-1 mt-auto">
            <span
              v-for="tag in spell.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Edit button (floats top-left on hover) -->
        <RouterLink
          :to="`/spells/${spell.id}?edit=true`"
          class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit spell"
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
      {{ filtered.length }} of {{ spells?.length ?? 0 }} spells
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Pencil } from "lucide-vue-next";
import { useSpells } from "@/composables/useSpells";
import { SCHOOL_COLORS, spellLevelLabel } from "@/types/spell.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const props = defineProps<{
  search: string;
  levelFilter: string;
  schoolFilter: string;
  classFilter: string;
}>();

const { data: spells, isLoading } = useSpells();

const filtered = computed(() => {
  let list = spells.value ?? [];
  if (props.search.trim()) {
    const q = props.search.toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.school.toLowerCase().includes(q) ||
        s.classes.some((c) => c.toLowerCase().includes(q)) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (props.levelFilter !== "") list = list.filter((s) => s.level === parseInt(props.levelFilter));
  if (props.schoolFilter) list = list.filter((s) => s.school === props.schoolFilter);
  if (props.classFilter) list = list.filter((s) => s.classes.includes(props.classFilter));
  return list;
});
</script>
