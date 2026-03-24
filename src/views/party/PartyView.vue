<template>
  <PageHeader title="Party Tracker" description="Track your heroes' HP, initiative, and passive skills">
    <template #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        @click="tracker?.openCompanionForm(null)"
      >
        <PawPrint class="h-3.5 w-3.5" />
        Add Companion
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        @click="tracker?.openForm(null)"
      >
        <Plus class="h-3.5 w-3.5" />
        Add Hero
      </button>
    </template>

    <PartyTracker ref="tracker" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Plus, PawPrint } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import PartyTracker from "@/components/party/PartyTracker.vue";

const tracker = ref<InstanceType<typeof PartyTracker> | null>(null);
</script>
