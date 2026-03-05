<template>
  <div>
    <PageHeader title="NPC Sheet" description="Character profile and secrets" />
    <NpcDetail />
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import NpcDetail from '@/components/npcs/NpcDetail.vue'
</script>
