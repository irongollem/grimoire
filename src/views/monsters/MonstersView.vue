<template>
  <div>
    <PageHeader title="Bestiary" description="Your custom monster compendium">
      <template #actions>
        <RouterLink
          to="/monsters/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New Monster
        </RouterLink>
      </template>
    </PageHeader>

    <MonsterList />
  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import MonsterList from '@/components/monsters/MonsterList.vue'
</script>
