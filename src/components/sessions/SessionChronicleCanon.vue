<template>
  <div v-if="canon.total > 0" class="flex flex-col gap-1.5" data-testid="chronicle-canon">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <AppButton variant="ghost" size="xs" :label="open ? 'Hide canon this session' : 'Canon this session'" :aria-expanded="open" data-testid="chronicle-canon-toggle" @click="open = !open" />
      <span v-for="group in canon.groups" :key="group.kind" class="text-caption text-muted-foreground" data-testid="chronicle-canon-count">{{ group.label }} {{ group.items.length }}</span>
    </div>
    <div v-if="open" class="flex flex-col gap-2 border-l border-border pl-3" data-testid="chronicle-canon-list">
      <div v-for="group in canon.groups" :key="group.kind" class="flex flex-col gap-0.5">
        <span class="text-eyebrow text-muted-foreground">{{ group.label }}</span>
        <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
          <li v-for="item in group.items" :key="item.key" class="min-w-0">
            <RouterLink :to="item.to" class="text-body text-foreground hover:underline" data-testid="chronicle-canon-item">{{ item.title }}</RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** What the canon did in one session, under its chronicle entry: counts first, the list when opened, each item leading to its entry. Nothing shows for a session that changed nothing. */
import { ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { SessionCanon } from "@/lib/canon/canonSession";

const { canon } = defineProps<{ canon: SessionCanon }>();
const open = ref(false);
</script>
