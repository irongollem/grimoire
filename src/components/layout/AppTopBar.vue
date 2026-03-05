<template>
  <header class="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card sticky top-0 z-30">
    <button
      class="text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Open navigation"
      @click="ui.toggleMobileNav()"
    >
      <Menu class="h-5 w-5" />
    </button>

    <h1 class="font-cinzel text-lg font-semibold text-gold-500 tracking-wider flex-1">
      {{ pageTitle }}
    </h1>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Menu } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const ui = useUiStore()

const pageTitle = computed(() => (route.meta.title as string | undefined) ?? 'Grimoire')
</script>
