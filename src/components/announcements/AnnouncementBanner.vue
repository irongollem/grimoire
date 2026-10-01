<template>
  <!-- One product announcement at a time, above the page, until dismissed. -->
  <div v-if="current" class="px-4 pt-4 md:px-6 md:pt-6">
    <NoticeCard :title="current.title">
      {{ current.body }}
      <template #actions>
        <AppButton
          v-if="current.action"
          :to="current.action.to"
          variant="outline"
          size="sm"
          :label="current.action.label"
        />
        <AppButton variant="ghost" size="sm" label="Got it" @click="dismiss(current.id)" />
      </template>
    </NoticeCard>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import NoticeCard from "@/components/common/NoticeCard.vue";
import { useAnnouncements } from "@/composables/useAnnouncements";

const { current, dismiss } = useAnnouncements();
</script>
