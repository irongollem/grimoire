<template>
  <div>
    <!-- Pending: not yet authenticated -->
    <template v-if="!auth.isAuthenticated">
      <h2 class="text-heading-lg font-semibold text-foreground mb-1">
        You've been invited!
      </h2>
      <p class="text-body text-muted-foreground italic mb-6">
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
          <label class="text-body text-foreground" for="join-display-name">Username</label>
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
          <label class="text-body text-foreground" for="join-email">Email</label>
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
          <label class="text-body text-foreground" for="join-password">Password</label>
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

        <p v-if="authMessage" class="text-body text-elven-green">{{ authMessage }}</p>
        <p v-if="errorMessage" class="text-body text-destructive">{{ errorMessage }}</p>

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

    <!-- Authenticated: joining in progress, or choosing a character first -->
    <template v-else>
      <div class="text-center py-4">
        <div v-if="joining || isDecidingAutoJoin" class="space-y-3">
          <div class="flex justify-center">
            <div class="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p class="text-body text-muted-foreground italic">
            {{ joining ? "Joining the campaign…" : "Loading your characters…" }}
          </p>
        </div>

        <div v-else-if="joinError" class="space-y-4">
          <p class="text-heading-lg font-semibold text-destructive">Invalid Invite</p>
          <p class="text-body text-muted-foreground italic">{{ joinError }}</p>
          <RouterLink
            to="/dashboard"
            class="inline-block mt-2 text-body text-gold-400 hover:text-gold-300 underline"
          >
            Go to your dashboard
          </RouterLink>
        </div>

        <div v-else-if="showChooser" class="text-left space-y-4">
          <div class="text-center">
            <h2 class="text-heading font-semibold text-foreground mb-1">Bring a character?</h2>
            <p class="text-body text-muted-foreground italic">
              Choose one of your characters to bring along, or join without one.
            </p>
          </div>

          <div class="space-y-2">
            <label
              v-for="pm in unattachedCharacters"
              :key="pm.id"
              class="flex items-start gap-2.5 cursor-pointer group"
            >
              <input
                v-model="selectedCharacterId"
                type="radio"
                :value="pm.id"
                class="mt-1 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
              />
              <div class="min-w-0">
                <span class="text-body text-foreground group-hover:text-primary transition-colors block truncate">
                  {{ pm.name }}
                </span>
                <span class="text-caption text-muted-foreground italic block truncate">
                  {{ pm.class || "Adventurer" }}{{ pm.level ? ` · Level ${pm.level}` : "" }}
                </span>
              </div>
            </label>
            <label class="flex items-start gap-2.5 cursor-pointer group">
              <input
                v-model="selectedCharacterId"
                type="radio"
                value=""
                class="mt-1 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
              />
              <span class="text-body text-foreground group-hover:text-primary transition-colors">
                Join without a character
              </span>
            </label>
          </div>

          <AppButton
            variant="primary"
            size="md"
            block
            label="Join"
            :disabled="selectedCharacterId === null"
            @click="confirmChoice"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useQueryClient } from "@tanstack/vue-query";
import { joinCampaignViaInvite } from "@/composables/useCampaignMembers";
import { useCharacterPool } from "@/composables/useCharacterPool";
import { useModeSwitch } from "@/composables/useModeSwitch";
import { useCampaigns } from "@/composables/useCampaigns";
import AppButton from "@/components/common/AppButton.vue";

const auth = useAuthStore();
const campaign = useCampaignStore();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { switchMode } = useModeSwitch();
const { refetch: refetchCampaigns } = useCampaigns();

const token = route.params.token as string;
const activeTab = ref<"signup" | "login">("signup");
const displayName = ref("");
const email = ref("");
const password = ref("");
const errorMessage = ref("");
const authMessage = ref("");
const joining = ref(false);
const joinError = ref("");
const decidingJoin = ref(false);

// #730: characters are durable and campaign-agnostic until attached — only
// ones with no campaign yet can be brought along here.
const myCharactersQuery = useCharacterPool();
const unattachedCharacters = computed(() =>
  (myCharactersQuery.data.value ?? []).filter((pm) => pm.campaign_id === null),
);

// Transient chooser state — never the ui store, this view never reopens with
// a stale selection. null = nothing picked yet; "" = "join without one".
const selectedCharacterId = ref<string | null>(null);
const hasChosen = ref(false);

const showChooser = computed(
  () =>
    !joining.value &&
    !joinError.value &&
    !hasChosen.value &&
    !myCharactersQuery.isPending.value &&
    unattachedCharacters.value.length > 0,
);

// True only while we're still finding out whether a chooser is even needed —
// keeps the zero-character path looking the same as a plain auto-join.
const isDecidingAutoJoin = computed(() => !hasChosen.value && decidingJoin.value);

async function attemptJoin(partyMemberId?: string) {
  joining.value = true;
  joinError.value = "";
  try {
    const campaignId = await joinCampaignViaInvite(token, partyMemberId);
    // Preserve the current DM campaign in its per-mode slot before activating
    // the joined campaign. When already in player mode, the explicit cache
    // invalidation still exposes the newly-created membership immediately.
    await switchMode("player", { navigate: false });
    await queryClient.invalidateQueries();
    await auth.refreshMembership(campaignId);

    // Hydrate the whole campaign row. Assigning only activeCampaignId can
    // leave the previous mode's theme, calendar and BYOK-bearing object alive.
    const { data: freshCampaigns } = await refetchCampaigns();
    const joined = freshCampaigns?.find((c) => c.id === campaignId) ?? null;
    if (joined) {
      campaign.switchToCampaign(joined);
    } else {
      campaign.clearActiveCampaign();
      campaign.activeCampaignId = campaignId;
    }
    await router.replace({ name: "play" });
  } catch (err) {
    joinError.value = err instanceof Error ? err.message : "This invite link is invalid or has expired.";
    joining.value = false;
  }
}

function confirmChoice() {
  if (selectedCharacterId.value === null) return;
  hasChosen.value = true;
  attemptJoin(selectedCharacterId.value || undefined);
}

async function handleAuth() {
  errorMessage.value = "";
  authMessage.value = "";
  try {
    if (activeTab.value === "signup") {
      await auth.signUp(email.value, password.value, displayName.value.trim() || undefined, window.location.href);
      authMessage.value = "Check your email to confirm — the link will bring you straight back here to join.";
    } else {
      await auth.signIn(email.value, password.value);
      // onAuthStateChange will fire → watch(isAuthenticated) below decides
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "Authentication failed. Please try again.";
  }
}

// Once authenticated (via sign-in tab, or already logged in on mount) and the
// character pool has loaded, auto-join only when there is nothing to choose
// from — otherwise the chooser above takes over and the player picks first.
async function decideHowToJoin() {
  if (!auth.user?.id || hasChosen.value || joining.value || decidingJoin.value) return;
  decidingJoin.value = true;
  try {
    // refetch() also works when the query was initially disabled while auth
    // initialized, avoiding TanStack's disabled-query isPending limbo.
    const result = await myCharactersQuery.refetch();
    if (result.error) {
      joinError.value = "Couldn't load your characters. Please try again.";
      return;
    }
    if ((result.data ?? []).every((pm) => pm.campaign_id !== null)) {
      await attemptJoin();
    }
  } finally {
    decidingJoin.value = false;
  }
}

watch(() => auth.user?.id, () => { void decideHowToJoin(); }, { immediate: true });
</script>
