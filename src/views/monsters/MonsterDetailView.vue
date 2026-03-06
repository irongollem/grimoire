<template>
  <div>
    <PageHeader
      :title="monster?.name ?? (isNew ? 'New Monster' : 'Loading…')"
      :description="monster ? `${monster.size} ${monster.monster_type} · CR ${monster.stat_block.challenge_rating}` : ''"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <MonsterDetail v-else :monster="isNew ? null : (monster ?? null)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMonster } from '@/composables/useMonsters'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MonsterDetail from '@/components/monsters/MonsterDetail.vue'

const route = useRoute()
const isNew = computed(() => route.name === 'monster-new')
const id = computed(() => isNew.value ? '' : (route.params.id as string))

const { data: monster, isLoading: monsterLoading } = useMonster(id.value)
const isLoading = computed(() => !isNew.value && monsterLoading.value)
</script>
