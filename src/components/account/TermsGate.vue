<template>
  <AppModal
    v-if="mounted"
    :open="visible"
    size="md"
    role="alertdialog"
    :dismissable="false"
    :label="headerTitle"
  >
    <ModalHeader :title="headerTitle" :icon="IconShieldCheck" tone="gold" />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 flex flex-col gap-4">
      <!-- Accept: what changed, then the age question every pre-#919 account
           was never asked, then the clickwrap. -->
      <template v-if="phase === 'accept'">
        <p class="text-body text-foreground">
          We've updated our Terms of Service and Privacy Policy. What's new:
        </p>
        <ul class="flex flex-col gap-2">
          <li
            v-for="change in TERMS_CHANGES"
            :key="change"
            class="flex items-start gap-2 text-body text-muted-foreground"
          >
            <span class="mt-2 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
            <span>{{ change }}</span>
          </li>
        </ul>
        <p class="text-body text-muted-foreground">
          Read the
          <a :href="legalUrl('terms')" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">Terms of Service</a>
          and
          <a :href="legalUrl('privacy')" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">Privacy Policy</a>.
        </p>

        <form class="flex flex-col gap-4" @submit.prevent="handleContinue">
          <BirthMonthField
            v-model:month="birthMonth"
            v-model:year="birthYear"
            legend="To keep using Grimoire, tell us when you were born."
          />
          <AppCheckbox v-model="agreed" label-role="body">
            I agree to the updated Terms of Service and Privacy Policy.
          </AppCheckbox>
          <p v-if="ageError" role="alert" class="text-caption text-destructive">{{ ageError }}</p>
          <p v-if="submitError" role="alert" class="text-caption text-destructive">{{ submitError }}</p>

          <div class="flex items-center justify-between gap-2">
            <AppButton type="button" variant="ghost" size="sm" label="I don't agree" @click="phase = 'declined'" />
            <AppButton type="submit" variant="primary" size="sm" :disabled="submitting" :label="submitting ? 'Saving…' : 'Continue'" />
          </div>
        </form>
      </template>

      <!-- Declined: Terms §12 lets them cancel and leave rather than being
           trapped by a gate they have no way out of. -->
      <template v-else-if="phase === 'declined'">
        <p class="text-body text-foreground">
          That's okay. You can download your data or delete your account from
          Account settings, and cancel Grimoire Pro from Billing. Your account
          stays as it is until you accept.
        </p>
        <div class="flex flex-col gap-1 items-start">
          <RouterLink to="/account" class="text-body text-primary hover:underline">Account settings</RouterLink>
          <RouterLink to="/billing" class="text-body text-primary hover:underline">Billing</RouterLink>
        </div>
        <div class="flex justify-end">
          <AppButton variant="subtle" size="sm" label="Back" @click="phase = 'accept'" />
        </div>
      </template>

      <!-- Under 16: this account was never asked before, so it's only now
           finding out it needs a parent. The heading above already says so;
           ParentRequestForm's own opening line explains why. -->
      <template v-else-if="phase === 'parent-request'">
        <ParentRequestForm suppress-sent-state @sent="handleParentRequestSent" />
      </template>

      <!-- Waiting: the parent has been emailed; this account reopens itself
           the moment they approve. -->
      <template v-else>
        <p class="text-body text-foreground">
          We've emailed your parent. Once they approve, Grimoire opens up again.
        </p>
        <div class="flex justify-end">
          <AppButton variant="subtle" size="sm" label="Sign out" @click="handleSignOut" />
        </div>
      </template>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Blocking re-consent gate for any account whose `user_subscriptions` row
 * predates `TERMS_VERSION` (#919) — a brand-new signup records the current
 * version the moment it's created (`useAuthStore.signUp`), so it never has a
 * mismatch to show this for. Mounted once in each authenticated shell
 * (DefaultLayout, PlayerLayout); `useTermsGate` decides visibility.
 *
 * Doubles as the re-ask of the age question a pre-#919 account was never
 * asked: this is the only path by which an *existing* account can discover
 * it needs to become parent-managed, since a brand-new one is asked at
 * signup instead.
 *
 * Terms §12 lets a person decline a change and cancel rather than accept —
 * so "I don't agree" is a real way out, not a dead end, and the gate steps
 * aside on /account, /billing and /account/family (and their children) so
 * the links it offers there actually work (`isTermsGateExemptPath`).
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { TERMS_CHANGES, TERMS_VERSION } from "@/lib/legal";
import { legalUrl } from "@/lib/marketing";
import { useAuthStore } from "@/stores/auth";
import { useChildAccount } from "@/composables/account/useChildAccount";
import { useLazyMount } from "@/composables/useLazyMount";
import { useAgeQuestion } from "@/composables/auth/useAgeQuestion";
import { wasAnsweredUnder16 } from "@/lib/ageGateSession";
import { useTermsGate } from "@/composables/account/useTermsGate";
import { IconShieldCheck } from "@/lib/icons";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import BirthMonthField from "@/components/auth/BirthMonthField.vue";
import ParentRequestForm from "@/components/auth/ParentRequestForm.vue";

type Phase = "accept" | "declined" | "parent-request" | "waiting";

// A second parent-consent request has already been sent — remembered
// separately from the age-gate's own "under 16" memory, because reaching this
// phase again on reload must not re-open the accept form (which would let the
// birth date simply be re-answered) or silently re-send the email.
const WAITING_KEY = "grimoire:terms-gate-waiting";
function rememberWaiting(): void {
  try {
    sessionStorage.setItem(WAITING_KEY, "1");
  } catch {
    // Storage unavailable — worst case the accept form reappears on reload.
  }
}
function wasWaiting(): boolean {
  try {
    return sessionStorage.getItem(WAITING_KEY) === "1";
  } catch {
    return false;
  }
}
function forgetWaiting(): void {
  try {
    sessionStorage.removeItem(WAITING_KEY);
  } catch {
    // See above.
  }
}

const auth = useAuthStore();
const queryClient = useQueryClient();
const { isChild, refetch: refetchChildLink } = useChildAccount();

const phase = ref<Phase>(wasWaiting() ? "waiting" : wasAnsweredUnder16() ? "parent-request" : "accept");
const { birthMonth, birthYear, ageError, resolveAge } = useAgeQuestion();
const agreed = ref(false);
const submitError = ref("");
const submitting = ref(false);

const { visible } = useTermsGate();
const mounted = useLazyMount(visible);

const headerTitle = computed(() => {
  switch (phase.value) {
    case "declined": return "That's okay";
    case "parent-request": return "Let's get a parent involved";
    case "waiting": return "Waiting for your parent";
    default: return "Our Terms have changed";
  }
});

async function handleContinue() {
  submitError.value = "";
  // Same session key SignupView/JoinCampaignView use — reloading here must
  // not let the birth date simply be re-answered until it gives 16+.
  const result = resolveAge();
  if (result === null) return;
  if (result === "under16") {
    phase.value = "parent-request";
    return;
  }
  if (!agreed.value) {
    ageError.value = "Please agree to the updated Terms to continue.";
    return;
  }
  submitting.value = true;
  try {
    const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
    // The server remembers an open parent request even when this browser
    // session does not (a fresh tab, cleared storage), and refuses a second,
    // different age answer until the parent decides.
    if (error?.message.includes("Waiting for a parent")) {
      rememberWaiting();
      phase.value = "waiting";
      return;
    }
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["subscription"] });
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : "Something went wrong. Please try again.";
  } finally {
    submitting.value = false;
  }
}

function handleParentRequestSent() {
  rememberWaiting();
  phase.value = "waiting";
}

async function handleSignOut() {
  forgetWaiting();
  await auth.signOut();
}

// Every 20s while the waiting screen is actually on show, ask whether the
// parent has approved yet — `isChild` flipping true makes `visible` false,
// which lifts the gate on its own; nothing here needs to react to that beyond
// not polling forever once it happens.
let waitingTimer: ReturnType<typeof setInterval> | null = null;
watch(
  () => visible.value && phase.value === "waiting",
  (isWaiting) => {
    if (isWaiting) {
      if (waitingTimer) return;
      waitingTimer = setInterval(() => void refetchChildLink(), 20_000);
    } else if (waitingTimer) {
      clearInterval(waitingTimer);
      waitingTimer = null;
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  if (waitingTimer) clearInterval(waitingTimer);
});

// Once approval lands, this session's "waiting" memory is done its job.
watch(isChild, (active) => {
  if (active) forgetWaiting();
});
</script>
