<template>
  <!-- Disabled: requires a campaign but none is active -->
  <div
    v-if="disabled"
    class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-fell text-muted-foreground/40 cursor-not-allowed select-none"
    :title="`Select a campaign to access ${item.label}`"
  >
    <component :is="item.icon" class="h-5 w-5 shrink-0" />
    <span>{{ item.label }}</span>
    <IconLock class="h-3 w-3 ml-auto shrink-0 opacity-50" />
  </div>

  <!-- Normal -->
  <RouterLink
    v-else
    :to="item.to"
    class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-fell transition-colors duration-150"
    :class="
      isActive ? 'nav-link-active' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
    "
    @click="emit('navigate')"
  >
    <component :is="item.icon" class="h-5 w-5 shrink-0" />
    <span>{{ item.label }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { IconLock } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";
import type { NavItem } from "@/lib/nav";

const props = defineProps<{ item: NavItem }>();
const emit = defineEmits<{ navigate: [] }>();

const route = useRoute();
const campaignStore = useCampaignStore();

const isActive = computed(() => route.path.startsWith(props.item.to));
const disabled = computed(
  () => !!props.item.requiresCampaign && !campaignStore.activeCampaignId,
);
</script>
