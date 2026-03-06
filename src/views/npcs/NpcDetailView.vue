<template>
  <div>
    <PageHeader
      :title="npc?.name ?? 'New NPC'"
      :description="npc ? subtitle : 'Fill in the details below to add a new NPC to your realm'"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <NpcDetail v-else :npc="isNewNpc ? null : (npc ?? null)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNpc } from '@/composables/useNpcs'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import NpcDetail from '@/components/npcs/NpcDetail.vue'

const route = useRoute()
const isNewNpc = computed(() => route.name === 'npc-new')

const id = computed(() => isNewNpc.value ? '' : (route.params.id as string))
const { data: npc, isLoading: npcLoading } = useNpc(id.value)

const isLoading = computed(() => !isNewNpc.value && npcLoading.value)

const subtitle = computed(() => {
  if (!npc.value) return ''
  return [npc.value.race, npc.value.class, npc.value.occupation].filter(Boolean).join(' · ')
})
</script>
