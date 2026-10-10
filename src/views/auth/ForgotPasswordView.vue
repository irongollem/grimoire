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

      <CaptchaGate ref="captchaGate" />

      <AppButton
        type="submit"
        variant="primary"
        size="lg"
        block
        :disabled="auth.loading || sent"
        :label="auth.loading ? 'Sending…' : 'Send reset link'"
      />
    </form>

    <!-- A young player's account (#919) has no email to send a link to; the
         parent who set it up resets its password from Account → Family. -->
    <p class="mt-4 text-center text-caption text-muted-foreground">
      Sign in with a login name instead of an email? Ask the parent who set up your account: they can reset your password from Account → Family.
    </p>

    <p class="mt-6 text-center text-body text-muted-foreground">
      Remembered it?
      <RouterLink to="/login" class="text-primary underline hover:text-primary/80">
        Back to sign in
      </RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import { isAuthApiError } from "@supabase/supabase-js";
import { useAuthStore } from "@/stores/auth";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CaptchaGate from "@/components/auth/CaptchaGate.vue";
import { authErrorMessage, captchaSource, isCaptchaFailure } from "@/lib/auth/captcha";

const auth = useAuthStore();
const captcha = captchaSource(useTemplateRef<InstanceType<typeof CaptchaGate>>("captchaGate"));

const email = ref("");
const sent = ref(false);
const errorMessage = ref("");

async function handleSubmit() {
  errorMessage.value = "";
  try {
    await auth.requestPasswordReset(email.value.trim(), captcha);
    sent.value = true;
  } catch (err) {
    // Any answer from the auth server reads as "sent". Supabase's per-account
    // cooldown returns a 429 only for an address that has an account, so
    // showing its message would tell a visitor who is signed up — and for a
    // real account inside the cooldown, a link genuinely was just sent. Only a
    // failure to reach the server at all, which cannot depend on the account,
    // gets its own message. So does a failed bot check: the auth server runs
    // it before it looks the address up, and nothing was sent.
    if (isCaptchaFailure(err)) errorMessage.value = authErrorMessage(err, "");
    else if (isAuthApiError(err)) sent.value = true;
    else errorMessage.value = "Could not reach the server. Check your connection and try again.";
  }
}
</script>
