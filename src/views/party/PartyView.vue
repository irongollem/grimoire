<template>
  <div>
    <PageHeader
      title="Party Tracker"
      description="Track your heroes' HP, initiative, and passive skills"
    />
    <PartyTracker />
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import PartyTracker from '@/components/party/PartyTracker.vue'
</script>
