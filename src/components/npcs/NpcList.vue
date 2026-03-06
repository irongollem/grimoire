<template>
  <div>
    <!-- Filters bar -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-48">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search NPCs…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="s in STATUS_OPTIONS"
          :key="s.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="statusFilter === s.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="statusFilter = s.value"
        >
          {{ s.label }}
        </button>
      </div>

      <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="r in REL_OPTIONS"
          :key="r.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="relFilter === r.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="relFilter = r.value"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && statusFilter === 'all' && relFilter === 'all'"
      title="No NPCs yet"
      description="Populate your realm with merchants, villains, sages, and more."
    >
      <template #action>
        <RouterLink
          to="/npcs/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first NPC
        </RouterLink>
      </template>
    </EmptyState>

    <p v-else-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-12">
      No NPCs match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <RouterLink
        v-for="npc in filtered"
        :key="npc.id"
        :to="`/npcs/${npc.id}`"
        class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Portrait -->
        <div class="relative h-36 bg-muted overflow-hidden shrink-0">
          <img
            v-if="npc.portrait_url"
            :src="npc.portrait_url"
            :alt="npc.name"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-3xl font-cinzel font-bold"
            :style="{ backgroundColor: relColor(npc.relationship) + '22', color: relColor(npc.relationship) }"
          >
            {{ initials(npc.name) }}
          </div>
          <span
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-cinzel font-bold tracking-wider uppercase text-white"
            :style="{ backgroundColor: relColor(npc.relationship) + 'EE' }"
          >
            {{ npc.relationship }}
          </span>
        </div>

        <!-- Info -->
        <div class="p-3 flex flex-col gap-1 flex-1">
          <div class="flex items-start justify-between gap-1">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-1 flex-1">
              {{ npc.name }}
            </h3>
            <span
              :title="npc.status"
              class="w-2 h-2 rounded-full shrink-0 mt-1.5"
              :style="{ backgroundColor: statusColor(npc.status) }"
            />
          </div>

          <p v-if="npc.race || npc.class" class="font-fell text-xs text-muted-foreground italic truncate">
            {{ [npc.race, npc.class].filter(Boolean).join(' · ') }}
          </p>

          <p v-if="npc.occupation" class="font-fell text-xs text-muted-foreground truncate">
            {{ npc.occupation }}
          </p>

          <p v-if="npc.location" class="font-fell text-xs text-muted-foreground truncate">
            📍 {{ npc.location }}
          </p>

          <div v-if="npc.tags.length" class="flex flex-wrap gap-1 mt-auto pt-1">
            <span
              v-for="tag in npc.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
            <span v-if="npc.tags.length > 3" class="font-fell text-[10px] text-muted-foreground italic self-center">
              +{{ npc.tags.length - 3 }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ npcs?.length ?? 0 }} NPCs
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from 'lucide-vue-next'
import { useNpcs } from '@/composables/useNpcs'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { NpcRelationship, NpcStatus } from '@/types/npc.types'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'alive', label: 'Alive' },
  { value: 'dead', label: 'Dead' },
  { value: 'missing', label: 'Missing' },
  { value: 'unknown', label: '?' },
]

const REL_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ally', label: 'Ally' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'enemy', label: 'Enemy' },
]

const search = ref('')
const statusFilter = ref('all')
const relFilter = ref('all')

const { data: npcs, isLoading } = useNpcs()

const filtered = computed(() => {
  let list = npcs.value ?? []
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.race?.toLowerCase().includes(q) ||
      n.occupation?.toLowerCase().includes(q) ||
      n.location?.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    )
  }
  if (statusFilter.value !== 'all') list = list.filter(n => n.status === statusFilter.value)
  if (relFilter.value !== 'all') list = list.filter(n => n.relationship === relFilter.value)
  return list
})

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: '#2563eb', neutral: '#6b7280', enemy: '#dc2626', unknown: '#9333ea',
}
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: '#22c55e', dead: '#ef4444', missing: '#f59e0b', unknown: '#6b7280',
}
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? '#6b7280' }
function statusColor(s: NpcStatus) { return STATUS_COLORS[s] ?? '#6b7280' }
</script>
