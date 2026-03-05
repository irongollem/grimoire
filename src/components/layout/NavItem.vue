<template>
  <RouterLink
    :to="item.to"
    class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-fell transition-colors duration-150"
    :class="isActive
      ? 'nav-link-active'
      : 'text-muted-foreground hover:text-foreground hover:bg-navy-800'"
    @click="emit('navigate')"
  >
    <component :is="item.icon" class="h-4 w-4 shrink-0" />
    <span>{{ item.label }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { NavItem } from '@/lib/nav'

const props = defineProps<{ item: NavItem }>()
const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const isActive = computed(() => route.path.startsWith(props.item.to))
</script>
