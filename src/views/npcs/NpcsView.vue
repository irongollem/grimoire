<template>
  <div>
    <PageHeader title="NPC Tracker" description="The denizens of your realm — allies, enemies, and unknowns">
      <template #actions>
        <div class="flex gap-2">
          <button
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground tracking-wider hover:bg-accent hover:text-accent-foreground transition-colors"
            @click="ui.npcGeneratorOpen = true"
          >
            <Wand2 class="h-3.5 w-3.5" />
            Generate
          </button>
          <RouterLink
            to="/npcs/new"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          >
            <Plus class="h-3.5 w-3.5" />
            New NPC
          </RouterLink>
        </div>
      </template>
    </PageHeader>

    <NpcList />
    <NpcGeneratorPanel />
  </div>
</template>

<script setup lang="ts">
import { Plus, Wand2 } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import NpcList from '@/components/npcs/NpcList.vue'
import NpcGeneratorPanel from '@/components/npcs/NpcGeneratorPanel.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>
