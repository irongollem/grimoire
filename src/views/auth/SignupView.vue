<template>
  <div>
    <h2 class="font-cinzel text-xl font-semibold text-foreground mb-1">Begin your journey</h2>
    <p class="font-fell text-muted-foreground italic text-sm mb-6">
      Create your Grimoire account
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
          autocomplete="new-password"
          required
          minlength="8"
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="At least 8 characters"
        />
      </div>

      <p v-if="successMessage" class="text-sm text-elven-green font-fell">
        {{ successMessage }}
      </p>
      <p v-if="errorMessage" class="text-sm text-destructive font-fell">
        {{ errorMessage }}
      </p>

      <button
        type="submit"
        :disabled="auth.loading"
        class="w-full rounded-md bg-primary px-4 py-2.5 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ auth.loading ? 'Creating your tome…' : 'Create Your Tome' }}
      </button>
    </form>

    <p class="mt-6 text-center font-fell text-sm text-muted-foreground">
      Already have an account?
      <RouterLink to="/login" class="text-gold-400 hover:text-gold-300 underline">
        Enter the realm
      </RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const successMessage = ref('')

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await auth.signUp(email.value, password.value)
    successMessage.value = 'Check your email to confirm your account, then sign in.'
    email.value = ''
    password.value = ''
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Sign up failed. Please try again.'
  }
}
</script>
