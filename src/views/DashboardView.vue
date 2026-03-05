<template>
  <div>
    <PageHeader
      title="Campaign Dashboard"
      description="Your realm at a glance"
    />

    <!-- Stat cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        v-for="stat in stats"
        :key="stat.label"
        :label="stat.label"
        :value="stat.value"
        :icon="stat.icon"
        :to="stat.to"
      />
    </div>

    <!-- Coming soon placeholder -->
    <div class="rounded-lg border border-border bg-card p-6">
      <h2 class="font-cinzel text-base font-semibold text-foreground mb-2">
        Recent Activity
      </h2>
      <p class="font-fell text-muted-foreground italic text-sm">
        Your recent notes, calendar events and NPC updates will appear here.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BookOpen, CalendarDays, Scroll, Users } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'

const stats = [
  { label: 'Notes',       value: '—', icon: BookOpen,    to: '/notes' },
  { label: 'Events',      value: '—', icon: CalendarDays, to: '/calendar' },
  { label: 'Documents',   value: '—', icon: Scroll,       to: '/scriptorium' },
  { label: 'NPCs',        value: '—', icon: Users,        to: '/npcs' },
]
</script>
