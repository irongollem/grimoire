<template>
  <div>
    <h2 class="font-cinzel text-xl font-semibold text-foreground mb-1">Welcome back</h2>
    <p class="font-fell text-muted-foreground italic text-sm mb-6">
      Sign in to continue your adventure
    </p>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div class="space-y-1.5">
        <label class="font-fell text-sm text-foreground" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="wizard@faerûn.com"
        />
      </div>

      <div class="space-y-1.5">
        <label class="font-fell text-sm text-foreground" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••••••"
        />
      </div>

      <p v-if="errorMessage" class="text-sm text-destructive font-fell">
        {{ errorMessage }}
      </p>

      <button
        type="submit"
        :disabled="auth.loading"
        class="w-full rounded-md bg-primary px-4 py-2.5 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ auth.loading ? 'Entering the realm…' : 'Enter the Realm' }}
      </button>
    </form>

    <p class="mt-6 text-center font-fell text-sm text-muted-foreground">
      No account yet?
      <RouterLink to="/signup" class="text-gold-400 hover:text-gold-300 underline">
        Begin your journey
      </RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const errorMessage = ref('')

async function handleSubmit() {
  errorMessage.value = ''
  try {
    await auth.signIn(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Sign in failed. Check your credentials.'
  }
}
</script>
