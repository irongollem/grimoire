<template>
  <div class="flex min-h-screen bg-background">
    <AppSidebar />
    <AppMobileNav />

    <div class="flex-1 flex flex-col min-w-0">
      <AppTopBar />

      <main class="flex-1 p-4 md:p-6 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopBar from '@/components/layout/AppTopBar.vue'
import AppMobileNav from '@/components/layout/AppMobileNav.vue'
</script>
