<template>
  <div>
    <!-- Pending: not yet authenticated -->
    <template v-if="!auth.isAuthenticated">
      <h2 class="font-cinzel text-xl font-semibold text-foreground mb-1">
        You've been invited!
      </h2>
      <p class="font-fell text-muted-foreground italic text-sm mb-6">
        Create an account or sign in to join the campaign.
      </p>

      <!-- Tab: signup / login -->
      <div class="flex gap-1 mb-6 rounded-md border border-border p-1 bg-muted">
        <button
          v-for="tab in (['signup', 'login'] as const)"
          :key="tab"
          class="flex-1 py-1.5 rounded text-sm font-cinzel tracking-wide transition-colors"
          :class="activeTab === tab
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = tab"
        >
          {{ tab === 'signup' ? 'New Account' : 'Sign In' }}
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="handleAuth">
        <div v-if="activeTab === 'signup'" class="space-y-1.5">
          <label class="font-fell text-sm text-foreground" for="join-display-name">Username</label>
          <input
            id="join-display-name"
            v-model="displayName"
            type="text"
            autocomplete="username"
            required
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Shadowmere"
          />
        </div>

        <div class="space-y-1.5">
          <label class="font-fell text-sm text-foreground" for="join-email">Email</label>
          <input
            id="join-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="wizard@faerûn.com"
          />
        </div>

        <div class="space-y-1.5">
          <label class="font-fell text-sm text-foreground" for="join-password">Password</label>
          <input
            id="join-password"
            v-model="password"
            type="password"
            :autocomplete="activeTab === 'signup' ? 'new-password' : 'current-password'"
            required
            :minlength="activeTab === 'signup' ? 8 : undefined"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            :placeholder="activeTab === 'signup' ? 'At least 8 characters' : '••••••••'"
          />
        </div>

        <p v-if="authMessage" class="text-sm text-elven-green font-fell">{{ authMessage }}</p>
        <p v-if="errorMessage" class="text-sm text-destructive font-fell">{{ errorMessage }}</p>

        <button
          type="submit"
          :disabled="auth.loading || !!authMessage"
          class="w-full rounded-md bg-primary px-4 py-2.5 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ auth.loading
            ? (activeTab === 'signup' ? 'Creating your tome…' : 'Entering the realm…')
            : (activeTab === 'signup' ? 'Create Account & Join' : 'Sign In & Join') }}
        </button>
      </form>
    </template>

    <!-- Authenticated: joining in progress -->
    <template v-else>
      <div class="text-center py-4">
        <div v-if="joining" class="space-y-3">
          <div class="flex justify-center">
            <div class="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p class="font-fell text-muted-foreground italic text-sm">Joining the campaign…</p>
        </div>

        <div v-else-if="joinError" class="space-y-4">
          <p class="font-cinzel text-xl font-semibold text-destructive">Invalid Invite</p>
          <p class="font-fell text-muted-foreground italic text-sm">{{ joinError }}</p>
          <RouterLink
            to="/dashboard"
            class="inline-block mt-2 text-sm font-fell text-gold-400 hover:text-gold-300 underline"
          >
            Go to your dashboard
          </RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { joinCampaignViaInvite } from "@/composables/useCampaignMembers";

const auth = useAuthStore();
const campaign = useCampaignStore();
const route = useRoute();
const router = useRouter();

const token = route.params.token as string;
const activeTab = ref<"signup" | "login">("signup");
const displayName = ref("");
const email = ref("");
const password = ref("");
const errorMessage = ref("");
const authMessage = ref("");
const joining = ref(false);
const joinError = ref("");

async function attemptJoin() {
  joining.value = true;
  joinError.value = "";
  try {
    const campaignId = await joinCampaignViaInvite(token);
    await auth.refreshMembership(campaignId);

    // Activate the campaign they just joined and redirect to player portal
    campaign.activeCampaignId = campaignId;
    router.replace({ name: "play" });
  } catch (err) {
    joinError.value = err instanceof Error ? err.message : "This invite link is invalid or has expired.";
    joining.value = false;
  }
}

async function handleAuth() {
  errorMessage.value = "";
  authMessage.value = "";
  try {
    if (activeTab.value === "signup") {
      await auth.signUp(email.value, password.value, displayName.value.trim() || undefined);
      authMessage.value = "Check your email to confirm, then sign in to join.";
    } else {
      await auth.signIn(email.value, password.value);
      // onAuthStateChange will fire → watch(isAuthenticated) triggers join
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "Authentication failed. Please try again.";
  }
}

// Once authenticated (via sign-in tab or if they were already logged in), auto-join
watch(
  () => auth.isAuthenticated,
  (authed) => {
    if (authed) attemptJoin();
  },
);

onMounted(() => {
  if (auth.isAuthenticated) attemptJoin();
});
</script>
