<template>
  <div>
    <h2 class="text-heading-lg font-semibold text-foreground mb-1">Forgot your password?</h2>
    <p class="text-body text-muted-foreground italic mb-6">
      We'll send you a link to set a new one
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

      <p v-if="sent" class="text-body text-elven-green">
        If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.
      </p>
      <p v-if="errorMessage" class="text-body text-destructive">{{ errorMessage }}</p>

      <AppButton
        type="submit"
        variant="primary"
        size="lg"
        block
        :disabled="auth.loading || sent"
        :label="auth.loading ? 'Sending…' : 'Send reset link'"
      />
    </form>

    <p class="mt-6 text-center text-body text-muted-foreground">
      Remembered it?
      <RouterLink to="/login" class="text-gold-400 hover:text-gold-300 underline">
        Back to sign in
      </RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { isAuthApiError } from "@supabase/supabase-js";
import { useAuthStore } from "@/stores/auth";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";

const auth = useAuthStore();

const email = ref("");
const sent = ref(false);
const errorMessage = ref("");

async function handleSubmit() {
  errorMessage.value = "";
  try {
    await auth.requestPasswordReset(email.value.trim());
    sent.value = true;
  } catch (err) {
    // Any answer from the auth server reads as "sent". Supabase's per-account
    // cooldown returns a 429 only for an address that has an account, so
    // showing its message would tell a visitor who is signed up — and for a
    // real account inside the cooldown, a link genuinely was just sent. Only a
    // failure to reach the server at all, which cannot depend on the account,
    // gets its own message.
    if (isAuthApiError(err)) sent.value = true;
    else errorMessage.value = "Could not reach the server. Check your connection and try again.";
  }
}
</script>
