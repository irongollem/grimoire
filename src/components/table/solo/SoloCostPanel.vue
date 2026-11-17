<template>
  <!-- "What this sitting has cost": the account of play, because a turn has no fixed price (Cost, 06). -->
  <div data-slip class="absolute top-full right-0 z-20 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2.5 p-4" role="dialog" aria-label="This sitting">
    <span class="text-heading-sm text-foreground">This sitting</span>
    <dl class="flex flex-col">
      <div v-for="row in rows" :key="row.label" class="flex min-h-8 items-center justify-between gap-2 border-b border-dotted border-border py-1 text-body">
        <dt>{{ row.label }}</dt>
        <dd class="font-stat font-bold">{{ row.value }}</dd>
      </div>
    </dl>
    <p class="text-caption text-muted-foreground">
      A turn costs what the Dungeon Master used to answer it: more when it looks things up, less for a short reply. You are charged one whole credit each time the total passes one.
    </p>
    <AppButton variant="outline" size="sm" label="Get credits" class="self-start" @click="emit('credits')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

const { turns, credits, balance } = defineProps<{ turns: number; credits: number; balance: number | null }>();
const emit = defineEmits<{ credits: [] }>();

const rows = computed(() => [
  { label: "Turns played", value: String(turns) },
  { label: "Credits charged", value: String(credits) },
  ...(balance === null ? [] : [{ label: "Your balance", value: String(balance) }]),
]);
</script>
