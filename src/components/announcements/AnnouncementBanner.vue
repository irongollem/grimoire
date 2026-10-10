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
        <RouterLink
          to="/rules?tab=manual&page=whats-new"
          class="ml-auto text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >All notices</RouterLink>
      </template>
    </NoticeCard>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import NoticeCard from "@/components/common/feedback/NoticeCard.vue";
import { useAnnouncements } from "@/composables/announcements/useAnnouncements";

const { current, dismiss } = useAnnouncements();
</script>
