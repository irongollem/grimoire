<template>
  <aside class="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card h-screen sticky top-0">
    <!-- Logo -->
    <div class="px-4 py-5 border-b border-border">
      <RouterLink to="/dashboard" class="block">
        <h1 class="font-cinzel text-xl font-bold text-gold-500 tracking-widest">
          Grimoire
        </h1>
        <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
          Campaign Companion
        </p>
      </RouterLink>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-2 py-4 space-y-1">
      <NavItem
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :item="item"
      />
    </nav>

    <!-- Gold divider -->
    <div class="gold-divider mx-3" />

    <!-- User section -->
    <div class="px-3 py-4">
      <div class="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-muted-foreground">
        <div class="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <span class="font-cinzel text-xs text-foreground font-semibold">
            {{ userInitial }}
          </span>
        </div>
        <span class="flex-1 truncate font-fell text-xs">{{ userEmail }}</span>
        <button
          class="hover:text-foreground transition-colors"
          title="Sign out"
          @click="handleSignOut"
        >
          <LogOut class="h-4 w-4" />
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { NAV_ITEMS } from '@/lib/nav'
import NavItem from './NavItem.vue'

const auth = useAuthStore()
const router = useRouter()

const userEmail = computed(() => auth.userEmail ?? '')
const userInitial = computed(() => userEmail.value.charAt(0).toUpperCase() || '?')

async function handleSignOut() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>
