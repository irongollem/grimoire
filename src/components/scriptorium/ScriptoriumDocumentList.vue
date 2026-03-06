<template>
  <div>
    <!-- Filters bar -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-48">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search documents…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div class="flex flex-wrap gap-1">
        <button
          v-for="t in TYPE_OPTIONS"
          :key="t.value"
          class="px-2.5 py-1.5 rounded border border-border font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="typeFilter === t.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:text-foreground'"
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
      v-else-if="!filtered.length && !search && typeFilter === 'all'"
      title="The scriptorium awaits"
      description="Craft monsters, spells, items, and adventure documents with the look of the official books."
    >
      <template #action>
        <RouterLink
          to="/scriptorium/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Create your first document
        </RouterLink>
      </template>
    </EmptyState>

    <p v-else-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-12">
      No documents match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <RouterLink
        v-for="doc in filtered"
        :key="doc.id"
        :to="`/scriptorium/${doc.id}`"
        class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Type colour bar -->
        <div class="h-1 w-full shrink-0" :style="{ backgroundColor: typeColor(doc.doc_type) }" />

        <div class="p-4 flex flex-col gap-2 flex-1">
          <!-- Header row -->
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
              {{ doc.title }}
            </h3>
            <span
              class="shrink-0 px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider uppercase"
              :style="{ backgroundColor: typeColor(doc.doc_type) + '22', color: typeColor(doc.doc_type) }"
            >
              {{ DOC_TYPE_LABELS[doc.doc_type] }}
            </span>
          </div>

          <!-- Tags -->
          <div v-if="doc.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in doc.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
            <span v-if="doc.tags.length > 3" class="font-fell text-[10px] text-muted-foreground italic self-center">
              +{{ doc.tags.length - 3 }}
            </span>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between mt-auto pt-1">
            <span class="font-fell text-[11px] text-muted-foreground italic">
              {{ doc.word_count }} words
            </span>
            <span class="font-fell text-[11px] text-muted-foreground">
              {{ formatDate(doc.updated_at) }}
            </span>
          </div>

          <!-- Published badge -->
          <div v-if="doc.is_published" class="flex items-center gap-1">
            <Globe class="h-3 w-3 text-green-500" />
            <span class="font-cinzel text-[10px] text-green-500 font-semibold tracking-wider">Published</span>
          </div>
        </div>
      </RouterLink>
    </div>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ docs?.length ?? 0 }} documents
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Globe } from 'lucide-vue-next'
import { useScriptoriumDocuments } from '@/composables/useScriptorium'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { ScriptoriumDocType } from '@/types/scriptorium.types'

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
  { value: 'spell', label: 'Spell' },
  { value: 'monster', label: 'Monster' },
  { value: 'item', label: 'Item' },
  { value: 'class', label: 'Class' },
  { value: 'background', label: 'Background' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'npc-sheet', label: 'NPC Sheet' },
]

const DOC_TYPE_LABELS: Record<ScriptoriumDocType, string> = {
  custom: 'Custom', spell: 'Spell', monster: 'Monster', item: 'Item',
  class: 'Class', subclass: 'Subclass', race: 'Race', background: 'Background',
  adventure: 'Adventure', 'npc-sheet': 'NPC Sheet',
}

const DOC_TYPE_COLORS: Record<ScriptoriumDocType, string> = {
  custom: '#6b7280', spell: '#7c3aed', monster: '#dc2626', item: '#d97706',
  class: '#2563eb', subclass: '#0891b2', race: '#059669', background: '#9333ea',
  adventure: '#c2410c', 'npc-sheet': '#0f766e',
}

const search = ref('')
const typeFilter = ref('all')

const { data: docs, isLoading } = useScriptoriumDocuments()

const filtered = computed(() => {
  let list = docs.value ?? []
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.tags.some(t => t.toLowerCase().includes(q))
    )
  }
  if (typeFilter.value !== 'all') list = list.filter(d => d.doc_type === typeFilter.value)
  return list
})

function typeColor(type: ScriptoriumDocType): string {
  return DOC_TYPE_COLORS[type] ?? '#6b7280'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}
</script>
