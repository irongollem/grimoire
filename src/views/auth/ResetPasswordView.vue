<template>
  <div>
    <!-- No session: the link was expired, already used, or never followed. -->
    <template v-if="!auth.isAuthenticated">
      <h2 class="text-heading-lg font-semibold text-destructive mb-1">Link invalid</h2>
      <p class="text-body text-muted-foreground italic mb-6">
        This reset link has expired or already been used.
      </p>
      <RouterLink to="/forgot-password" class="text-body text-gold-400 hover:text-gold-300 underline">
        Send a new link
      </RouterLink>
    </template>

    <template v-else>
      <h2 class="text-heading-lg font-semibold text-foreground mb-1">Choose a new password</h2>
      <p class="text-body text-muted-foreground italic mb-6">
        For {{ auth.userEmail }}
      </p>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div class="space-y-1.5">
          <label class="text-body text-foreground" for="password">New password</label>
          <AppInput
            id="password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            size="body"
            placeholder="At least 8 characters"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-body text-foreground" for="password-confirm">Confirm password</label>
          <AppInput
            id="password-confirm"
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            size="body"
          />
        </div>

        <p v-if="errorMessage" class="text-body text-destructive">{{ errorMessage }}</p>

        <AppButton
          type="submit"
          variant="primary"
          size="lg"
          block
          :disabled="auth.loading"
          :label="auth.loading ? 'Saving…' : 'Set password'"
        />
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";

// Reached from the email `requestPasswordReset` sends. supabase-js reads the
// recovery token out of the URL while the client initialises — before the
// router guard's `auth.initialize()` resolves — so by the time this renders
// the user is either signed in with a recovery session or not signed in at all.

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();

const password = ref("");
const confirm = ref("");
const errorMessage = ref("");

async function handleSubmit() {
  errorMessage.value = "";
  if (password.value !== confirm.value) {
    errorMessage.value = "The passwords do not match.";
    return;
  }
  try {
    await auth.updatePassword(password.value);
    toast.success("Password updated.");
    // The guard sends this on to /welcome or the player portal as the
    // account's mode requires.
    router.push("/dashboard");
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Could not update the password. Please try again.";
  }
}
</script>
