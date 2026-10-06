<template>
  <div>
    <!-- Validating token -->
    <template v-if="tokenState === 'validating'">
      <div class="flex justify-center py-8">
        <BannerLoader class="h-10" />
      </div>
    </template>

    <!-- Token invalid / expired -->
    <template v-else-if="tokenState === 'invalid'">
      <h2 class="text-heading-lg font-semibold text-destructive mb-1">Link Invalid</h2>
      <p class="text-body text-muted-foreground italic">
        This invite link has expired or already been used. Ask your DM for a new one.
      </p>
    </template>

    <!-- Public signup or valid invite -->
    <template v-else>
      <!-- Step 1: the age question, asked before anything else can be typed in.
           Answering it isn't stored for an adult — only the "under 16" branch
           below ever writes anything down (#919). -->
      <template v-if="step === 'age'">
        <h2 class="text-heading-lg font-semibold text-foreground mb-1">When were you born?</h2>
        <p class="text-body text-muted-foreground italic mb-6">
          So we can set your account up the right way.
        </p>

        <AgeQuestionStep @adult="step = 'form'" @under16="step = 'parent-request'" />
      </template>

      <!-- Step 2a: under 16 — no self-signup, a parent sets the account up.
           ParentRequestForm's own opening line explains why; this heading is
           all that needs adding here. -->
      <template v-else-if="step === 'parent-request'">
        <h2 class="text-heading-lg font-semibold text-foreground mb-6">Let's get a parent involved</h2>
        <ParentRequestForm />
      </template>

      <!-- Step 2b: 16 or older — the ordinary signup form, unchanged -->
      <template v-else>
        <h2 class="text-heading-lg font-semibold text-foreground mb-1">Begin your journey</h2>
        <p class="text-body text-muted-foreground italic mb-6">Create your Grimoire account</p>

        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-1.5">
            <label class="text-body text-foreground" for="display-name">Username</label>
            <AppInput
              id="display-name"
              v-model="displayName"
              type="text"
              tone="default"
              size="body"
              autocomplete="username"
              required
              placeholder="Shadowmere"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-body text-foreground" for="email">Email</label>
            <AppInput
              id="email"
              v-model="email"
              type="email"
              tone="default"
              size="body"
              autocomplete="email"
              required
              placeholder="wizard@faerûn.com"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-body text-foreground" for="password">Password</label>
            <AppInput
              id="password"
              v-model="password"
              type="password"
              tone="default"
              size="body"
              autocomplete="new-password"
              required
              minlength="8"
              placeholder="At least 8 characters"
            />
          </div>

          <p v-if="successMessage" class="text-body text-elven-green">{{ successMessage }}</p>
          <p v-if="errorMessage" class="text-body text-destructive">{{ errorMessage }}</p>

          <SignupConsent v-model="agreedToTerms" />

          <CaptchaGate ref="captchaGate" />

          <AppButton
            type="submit"
            variant="primary"
            size="lg"
            block
            :disabled="auth.loading || !!successMessage || !agreedToTerms"
            :label="auth.loading ? 'Creating your tome…' : 'Create Your Tome'"
          />
        </form>

        <p class="mt-6 text-center text-body text-muted-foreground">
          Already have an account?
          <RouterLink to="/login" class="text-primary underline hover:text-primary/80">
            Enter the realm
          </RouterLink>
        </p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { ref, onMounted, useTemplateRef } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { wasAnsweredUnder16 } from "@/lib/ageGateSession";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import SignupConsent from "@/components/auth/SignupConsent.vue";
import AgeQuestionStep from "@/components/auth/AgeQuestionStep.vue";
import ParentRequestForm from "@/components/auth/ParentRequestForm.vue";
import CaptchaGate from "@/components/auth/CaptchaGate.vue";
import { authErrorMessage, captchaSource } from "@/lib/auth/captcha";

type TokenState = "validating" | "invalid" | "valid";
type SignupStep = "age" | "parent-request" | "form";

const auth = useAuthStore();
const route = useRoute();
const captcha = captchaSource(useTemplateRef<InstanceType<typeof CaptchaGate>>("captchaGate"));

const token = route.query.token as string | undefined;
const tokenState = ref<TokenState>(token ? "validating" : "valid");

// Skips straight to the parent-request branch if this browser session already
// answered "under 16" — reloading or going back must not simply re-offer the
// question until it gets the answer wanted (#919).
const step = ref<SignupStep>(wasAnsweredUnder16() ? "parent-request" : "age");

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

/** Only a same-app relative path — same rule LoginView applies to `?redirect=`. */
function safeRedirectPath(raw: unknown): string | null {
  return typeof raw === "string" && /^\/(?![/\\])/.test(raw) ? raw : null;
}

async function handleSubmit() {
  errorMessage.value = "";
  successMessage.value = "";
  if (!agreedToTerms.value) {
    errorMessage.value = "Please accept the Terms of Service and Privacy Policy to continue.";
    return;
  }
  try {
    // A parent arriving here from their own confirmation link carries where
    // they were headed (e.g. `/account/family/add?request=…`) as `?redirect=`
    // — this is what gets them back there once their own email is confirmed.
    const redirectPath = safeRedirectPath(route.query.redirect);
    const emailRedirectTo = redirectPath ? `${window.location.origin}${redirectPath}` : undefined;

    // Pass the invite token + accepted terms version through signup metadata — the
    // on-insert subscription trigger consumes the invite (applying the granted plan
    // server-side) and records the consent. (The old post-signup consume_app_invite
    // RPC ran before a session existed, so auth.uid() was null and grants no-op'd.)
    await auth.signUp({
      email: email.value,
      password: password.value,
      captcha,
      displayName: displayName.value.trim() || undefined,
      redirectTo: emailRedirectTo,
      inviteToken: token,
    });
    successMessage.value = "Check your email to confirm your account, then sign in.";
    email.value = "";
    password.value = "";
  } catch (err) {
    errorMessage.value = authErrorMessage(err, "Sign up failed. Please try again.");
  }
}
</script>
