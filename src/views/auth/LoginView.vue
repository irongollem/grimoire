<template>
  <div>
    <h2 class="text-heading-lg font-semibold text-foreground mb-1">Welcome back</h2>
    <p class="text-body text-muted-foreground italic mb-6">
      Sign in to continue your adventure
    </p>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div class="space-y-1.5">
        <label class="text-body text-foreground" for="email">Email</label>
        <AppInput
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          size="body"
          placeholder="wizard@faerûn.com"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-body text-foreground" for="password">Password</label>
        <AppInput
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          size="body"
          placeholder="••••••••"
        />
      </div>

      <p v-if="errorMessage" class="text-body text-destructive">
        {{ errorMessage }}
      </p>

      <AppButton
        type="submit"
        variant="primary"
        size="lg"
        block
        :disabled="auth.loading"
        :label="auth.loading ? 'Entering the realm…' : 'Enter the Realm'"
      />
    </form>

    <p class="mt-6 text-center text-body text-muted-foreground">
      New to Grimoire?
      <RouterLink to="/signup" class="text-gold-400 hover:text-gold-300 underline">
        Create an account
      </RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute, RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref("");
const password = ref("");
const errorMessage = ref("");

async function handleSubmit() {
  errorMessage.value = "";
  try {
    await auth.signIn(email.value, password.value);
    // Only honour same-app relative paths — reject `//host`, `/\host`, or absolute
    // URLs so a crafted ?redirect= can't bounce the user off-site.
    const raw = (route.query.redirect as string) || "/dashboard";
    const redirect = /^\/(?![/\\])/.test(raw) ? raw : "/dashboard";
    router.push(redirect);
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Sign in failed. Check your credentials.";
  }
}
</script>
