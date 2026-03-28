<template>
  <div>
    <div v-if="isLoading && !isFetching" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!spells?.spells.length && !props.search && !props.levelFilter && !props.schoolFilter && !props.classFilter"
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
      v-else-if="!spells?.spells.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No spells match your filters.
    </p>

    <template v-else>
      <div
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        :class="{ 'opacity-60 pointer-events-none': isFetching && !isLoading }"
      >
        <div
          v-for="spell in spells.spells"
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

          <!-- Edit button — DM mode only -->
          <RouterLink
            v-if="!props.playerMemberId"
            :to="`/spells/${spell.id}?edit=true`"
            class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit spell"
          >
            <Pencil class="h-3 w-3" />
            Edit
          </RouterLink>

          <!-- Learn / Prepare button — player mode -->
          <template v-if="showLearnButton">
            <button
              v-if="!isKnown(spell.id)"
              class="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-primary/80 hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40 cursor-pointer"
              :disabled="isAdding"
              @click.prevent.stop="addSpell({ partyMemberId: props.playerMemberId!, spellId: spell.id, isPrepared: props.casterType === 'prepared' })"
            >
              <BookPlus class="h-3 w-3" />
              {{ learnLabel(spell.level === 0) }}
            </button>
            <button
              v-else
              class="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40 cursor-pointer"
              :class="isRemoving ? 'text-muted-foreground' : 'text-emerald-400 hover:text-red-400'"
              :disabled="isRemoving"
              :title="props.casterType === 'prepared' ? 'Unprepare' : 'Remove from spellbook'"
              @click.prevent.stop="removeSpell({ partyMemberId: props.playerMemberId!, spellId: spell.id })"
            >
              <Check v-if="!isRemoving" class="h-3 w-3" />
              <X v-else class="h-3 w-3" />
              {{ learnedLabel(spell.level === 0) }}
            </button>
          </template>
        </div>
      </div>

      <!-- Footer: count + pagination -->
      <div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <p class="font-fell text-xs text-muted-foreground italic">
          {{ rangeStart }}–{{ rangeEnd }} of {{ spells.total }} spells
        </p>

        <div v-if="totalPages > 1" class="flex items-center gap-0.5">
          <!-- First -->
          <button
            :disabled="props.page === 0"
            class="pager-btn"
            title="First page"
            @click="emit('update:page', 0)"
          >«</button>
          <!-- Prev -->
          <button
            :disabled="props.page === 0"
            class="pager-btn"
            title="Previous page"
            @click="emit('update:page', props.page - 1)"
          >‹</button>

          <!-- Page window -->
          <template v-for="item in pageWindow" :key="typeof item === 'number' ? item : `e-${item}`">
            <span v-if="item === '…'" class="px-1 font-cinzel text-xs text-muted-foreground select-none">…</span>
            <button
              v-else
              class="pager-btn"
              :class="item === props.page ? 'bg-primary text-primary-foreground border-primary' : ''"
              @click="emit('update:page', item)"
            >{{ item + 1 }}</button>
          </template>

          <!-- Next -->
          <button
            :disabled="props.page >= totalPages - 1"
            class="pager-btn"
            title="Next page"
            @click="emit('update:page', props.page + 1)"
          >›</button>
          <!-- Last -->
          <button
            :disabled="props.page >= totalPages - 1"
            class="pager-btn"
            title="Last page"
            @click="emit('update:page', totalPages - 1)"
          >»</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { Pencil, BookPlus, Check, X } from "lucide-vue-next";
import { useSpellsPage, SPELLS_PAGE_SIZE } from "@/composables/useSpells";
import type { SpellFilters } from "@/composables/useSpells";
import { useAddCharacterSpell, useRemoveCharacterSpell } from "@/composables/useCharacterSpells";
import { SCHOOL_COLORS, spellLevelLabel } from "@/types/spell.types";
import type { CasterType } from "@/types/spell.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const props = defineProps<{
  search: string;
  levelFilter: string;
  schoolFilter: string;
  classFilter: string;
  sourceFilter: string;
  page: number;
  /** Set when rendering inside the player portal — hides Edit, shows Learn/Remove button. */
  playerMemberId?: string;
  /** Caster archetype — controls button label and whether to show the button at all. */
  casterType?: CasterType;
  /** Spell IDs already in this character's spellbook (drives button state). */
  knownSpellIds?: string[];
  /** Spell IDs currently prepared (subset of knownSpellIds, for prepared casters). */
  preparedSpellIds?: string[];
}>();

const emit = defineEmits<{ (e: "update:page", page: number): void }>();

const { mutate: addSpell, isPending: isAdding } = useAddCharacterSpell();
const { mutate: removeSpell, isPending: isRemoving } = useRemoveCharacterSpell();

const showLearnButton = computed(() => !!props.playerMemberId && props.casterType !== "none");

function learnLabel(isCantrip: boolean) {
  if (props.casterType === "prepared") return "Prepare";
  if (isCantrip) return "Learn";
  return props.casterType === "spellbook" ? "Add" : "Learn";
}

function learnedLabel(isCantrip: boolean) {
  if (props.casterType === "prepared") return "Prepared";
  if (isCantrip) return "Known";
  return props.casterType === "spellbook" ? "Added" : "Learned";
}

// For prepared casters the "known" check is whether the spell is prepared
function isKnown(spellId: string): boolean {
  if (props.casterType === "prepared") return props.preparedSpellIds?.includes(spellId) ?? false;
  return props.knownSpellIds?.includes(spellId) ?? false;
}

const filters = computed<SpellFilters>(() => ({
  search: props.search,
  level: props.levelFilter,
  school: props.schoolFilter,
  class: props.classFilter,
  source: props.sourceFilter,
}));

const pageRef = toRef(props, "page");

const { data: spells, isLoading, isFetching } = useSpellsPage(filters, pageRef);

const totalPages = computed(() => Math.ceil((spells.value?.total ?? 0) / SPELLS_PAGE_SIZE));
const rangeStart = computed(() => props.page * SPELLS_PAGE_SIZE + 1);
const rangeEnd = computed(() =>
  Math.min((props.page + 1) * SPELLS_PAGE_SIZE, spells.value?.total ?? 0),
);

const pageWindow = computed<(number | "…")[]>(() => {
  const total = totalPages.value;
  if (total <= 9) return Array.from({ length: total }, (_, i) => i);

  const cur = props.page;
  const pages = new Set<number>();
  pages.add(0);
  pages.add(total - 1);
  for (let i = Math.max(0, cur - 2); i <= Math.min(total - 1, cur + 2); i++) pages.add(i);

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
});
</script>
