<template>
  <TonightBlock block="planned" title="Planned">
    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li v-for="(item, index) in items" :key="item.pinId" class="flex min-w-0 items-start justify-between gap-2" data-testid="tonight-planned-item">
        <span class="flex min-w-0 flex-col">
          <RouterLink :to="item.to" class="text-body font-semibold text-foreground underline-offset-2 hover:underline">{{ item.title }}</RouterLink>
          <span class="text-label text-muted-foreground">{{ item.context }}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1">
          <AppButton variant="ghost" size="icon-sm" :icon="IconChevronUp" aria-label="Move this earlier" :disabled="index === 0" data-testid="planned-up" @click="emit('move', item.pinId, -1)" />
          <AppButton variant="ghost" size="icon-sm" :icon="IconChevronDown" aria-label="Move this later" :disabled="index === items.length - 1" data-testid="planned-down" @click="emit('move', item.pinId, 1)" />
          <AppButton variant="outline" size="xs" label="Unpin" data-testid="planned-unpin" @click="emit('unpin', item.pinId)" />
        </span>
      </li>
    </ul>
  </TonightBlock>
</template>

<script setup lang="ts">
/** What the DM pinned for the next session, in their order, at the top of Tonight. */
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import TonightBlock from "@/components/canon/tonight/TonightBlock.vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import type { PinnedItem } from "@/lib/canon/canonTonight";

defineProps<{ items: readonly PinnedItem[] }>();
const emit = defineEmits<{ move: [pinId: string, direction: -1 | 1]; unpin: [pinId: string] }>();
</script>
