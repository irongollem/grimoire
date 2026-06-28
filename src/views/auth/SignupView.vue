<template>
  <div>
    <!-- Token missing or invalid -->
    <template v-if="tokenState === 'missing'">
      <h2 class="font-cinzel text-xl font-semibold text-foreground mb-1">Invite Required</h2>
      <p class="font-fell text-muted-foreground italic text-sm">
        Grimoire is currently invite-only. Sign in if you already have an account, or ask your DM for an invite link.
      </p>
      <RouterLink
        to="/login"
        class="mt-5 inline-block w-full text-center rounded-md bg-primary px-4 py-2.5 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        Sign In
      </RouterLink>
    </template>

    <!-- Validating token -->
    <template v-else-if="tokenState === 'validating'">
      <div class="flex justify-center py-8">
        <div class="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </template>

    <!-- Token invalid / expired -->
    <template v-else-if="tokenState === 'invalid'">
      <h2 class="font-cinzel text-xl font-semibold text-destructive mb-1">Link Invalid</h2>
      <p class="font-fell text-muted-foreground italic text-sm">
        This invite link has expired or already been used. Ask your DM for a new one.
      </p>
    </template>

    <!-- Valid token — show signup form -->
    <template v-else>
      <h2 class="font-cinzel text-xl font-semibold text-foreground mb-1">Begin your journey</h2>
      <p class="font-fell text-muted-foreground italic text-sm mb-6">Create your Grimoire account</p>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div class="space-y-1.5">
          <label class="font-fell text-sm text-foreground" for="display-name">Username</label>
          <input
            id="display-name"
            v-model="displayName"
            type="text"
            autocomplete="username"
            required
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Shadowmere"
          />
        </div>

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

        <p v-if="successMessage" class="text-sm text-elven-green font-fell">{{ successMessage }}</p>
        <p v-if="errorMessage" class="text-sm text-destructive font-fell">{{ errorMessage }}</p>

        <label class="flex items-start gap-2 font-fell text-xs text-muted-foreground">
          <input
            v-model="agreedToTerms"
            type="checkbox"
            required
            class="mt-0.5 shrink-0 accent-primary"
          />
          <span>
            I agree to the
            <RouterLink to="/terms" class="underline hover:text-foreground transition-colors">Terms of Service</RouterLink>
            and
            <RouterLink to="/privacy" class="underline hover:text-foreground transition-colors">Privacy Policy</RouterLink>.
          </span>
        </label>

        <button
          type="submit"
          :disabled="auth.loading || !!successMessage || !agreedToTerms"
          class="w-full rounded-md bg-primary px-4 py-2.5 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ auth.loading ? "Creating your tome…" : "Create Your Tome" }}
        </button>
      </form>

      <p class="mt-6 text-center font-fell text-sm text-muted-foreground">
        Already have an account?
        <RouterLink to="/login" class="text-gold-400 hover:text-gold-300 underline">
          Enter the realm
        </RouterLink>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { TERMS_VERSION } from "@/lib/legal";

type TokenState = "missing" | "validating" | "invalid" | "valid";

const auth = useAuthStore();
const route = useRoute();

const token = route.query.token as string | undefined;
const tokenState = ref<TokenState>(token ? "validating" : "missing");

const displayName = ref("");
const email = ref("");
const password = ref("");
const agreedToTerms = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

onMounted(async () => {
  if (!token) return;
  const { data: valid } = await supabase.rpc("validate_app_invite", { p_token: token });
  tokenState.value = valid ? "valid" : "invalid";
});

async function handleSubmit() {
  errorMessage.value = "";
  successMessage.value = "";
  if (!agreedToTerms.value) {
    errorMessage.value = "Please accept the Terms of Service and Privacy Policy to continue.";
    return;
  }
  try {
    // Pass the invite token + accepted terms version through signup metadata — the
    // on-insert subscription trigger consumes the invite (applying the granted plan
    // server-side) and records the consent. (The old post-signup consume_app_invite
    // RPC ran before a session existed, so auth.uid() was null and grants no-op'd.)
    await auth.signUp(email.value, password.value, displayName.value.trim() || undefined, undefined, token, TERMS_VERSION);
    successMessage.value = "Check your email to confirm your account, then sign in.";
    email.value = "";
    password.value = "";
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "Sign up failed. Please try again.";
  }
}
</script>
