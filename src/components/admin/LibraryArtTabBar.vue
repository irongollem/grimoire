<script setup lang="ts">
const { activeTab, stagingCount } = defineProps<{
  activeTab: "library" | "staging";
  stagingCount: number;
}>();

const emit = defineEmits<{ "update:activeTab": ["library" | "staging"] }>();
</script>

<template>
  <div class="flex gap-1 border-b border-border pb-0.5">
    <button
      class="px-3 py-1.5 font-cinzel text-xs tracking-wide rounded-t transition-colors"
      :class="
        activeTab === 'library'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      "
      @click="emit('update:activeTab', 'library')"
    >
      Library
    </button>
    <button
      class="relative px-3 py-1.5 font-cinzel text-xs tracking-wide rounded-t transition-colors"
      :class="
        activeTab === 'staging'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      "
      @click="emit('update:activeTab', 'staging')"
    >
      Staging
      <span
        v-if="stagingCount > 0"
        class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-2xs font-bold"
      >
        {{ stagingCount }}
      </span>
    </button>
  </div>
</template>
