<template>
  <div>
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-48">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search spells…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Level filter -->
      <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="lvl in LEVEL_FILTERS"
          :key="lvl.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="levelFilter === lvl.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="levelFilter = lvl.value"
        >
          {{ lvl.label }}
        </button>
      </div>

      <!-- School filter -->
      <select
        v-model="schoolFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Schools</option>
        <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
      </select>

      <!-- Class filter -->
      <select
        v-model="classFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Classes</option>
        <option v-for="c in SPELL_CLASSES" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && !levelFilter && !schoolFilter && !classFilter"
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

    <p v-else-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-12">
      No spells match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <RouterLink
        v-for="spell in filtered"
        :key="spell.id"
        :to="`/spells/${spell.id}`"
        class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- School colour bar -->
        <div class="h-1.5 w-full shrink-0" :style="{ backgroundColor: SCHOOL_COLORS[spell.school] }" />

        <div class="p-3 flex flex-col gap-2 flex-1">
          <!-- Name + level badge -->
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight flex-1 line-clamp-2">
              {{ spell.name }}
            </h3>
            <span
              class="shrink-0 px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider text-white whitespace-nowrap"
              :style="{ backgroundColor: SCHOOL_COLORS[spell.school] }"
            >
              {{ spell.level === 0 ? 'C' : spell.level }}
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
            {{ spell.components.join(', ') || '—' }}
            <span v-if="spell.concentration"> · <em class="text-primary">Conc.</em></span>
          </p>

          <!-- Classes -->
          <p v-if="spell.classes.length" class="font-fell text-[11px] text-muted-foreground truncate">
            {{ spell.classes.join(', ') }}
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
      </RouterLink>
    </div>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ spells?.length ?? 0 }} spells
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from 'lucide-vue-next'
import { useSpells } from '@/composables/useSpells'
import { SPELL_SCHOOLS, SPELL_CLASSES, SCHOOL_COLORS, spellLevelLabel } from '@/types/spell.types'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const LEVEL_FILTERS = [
  { value: '',  label: 'All' },
  { value: '0', label: 'C' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
  { value: '8', label: '8' },
  { value: '9', label: '9' },
]

const search      = ref('')
const levelFilter = ref('')
const schoolFilter = ref('')
const classFilter = ref('')

const { data: spells, isLoading } = useSpells()

const filtered = computed(() => {
  let list = spells.value ?? []

  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.school.toLowerCase().includes(q) ||
      s.classes.some(c => c.toLowerCase().includes(q)) ||
      s.tags.some(t => t.toLowerCase().includes(q))
    )
  }
  if (levelFilter.value !== '') list = list.filter(s => s.level === parseInt(levelFilter.value))
  if (schoolFilter.value)       list = list.filter(s => s.school === schoolFilter.value)
  if (classFilter.value)        list = list.filter(s => s.classes.includes(classFilter.value))
  return list
})
</script>
