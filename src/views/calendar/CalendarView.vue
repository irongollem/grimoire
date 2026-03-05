<template>
  <div>
    <PageHeader title="Faerûn Calendar" description="Track the passage of time across the realms">
      <template #actions>
        <button
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          Add Event
        </button>
      </template>
    </PageHeader>

    <CalendarGrid />
  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import CalendarGrid from '@/components/calendar/CalendarGrid.vue'
</script>
