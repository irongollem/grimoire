<template>
  <div>
    <PageHeader
      title="Quest Log"
      description="Track active quests, side jobs, and completed adventures"
    >
      <template #actions>
        <RouterLink
          to="/quests/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New Quest
        </RouterLink>
      </template>
    </PageHeader>

    <QuestList />
  </div>
</template>

<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import QuestList from "@/components/quests/QuestList.vue";
</script>
